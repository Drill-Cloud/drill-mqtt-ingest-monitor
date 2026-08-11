import { EventEmitter } from 'node:events';
import mqtt, { type MqttClient } from 'mqtt';
import type { AppConfig } from './config.js';
import { MatrixNotifier } from './matrix.js';
import { getPayloadPreview, getPayloadText, getTopicState, hasWildcard, topicMatches } from './topic-utils.js';
import type { AlertEvent, MonitorSnapshot, TopicMessage, TopicState, TopicStatus } from './types.js';

const MAX_MESSAGES_PER_TOPIC = 100;
const MQTT_SUBSCRIPTIONS = ['#', '$SYS/#'];
const REPEATED_ERROR_LOG_INTERVAL_MS = 60_000;

type TopicRecord = {
  topic: string;
  messageCount: number;
  bytesTotal: number;
  messageTimes: number[];
  messages: TopicMessage[];
  lastSeenAt: number;
  lastPayloadPreview: string;
};

type ImportantState = {
  state: TopicState;
  alertSent: boolean;
};

function countActiveExpectedItems(
  pattern: string,
  topics: TopicStatus[],
  expectedItems?: string[],
): number | null {
  if (!expectedItems) return null;

  const aliveTopics = topics.filter((topic) => topic.state === 'alive');
  if (!hasWildcard(pattern)) {
    return aliveTopics.length > 0 ? expectedItems.length : 0;
  }

  const activeItems = new Set(aliveTopics.map((topic) => topic.topic.split('/').at(-1)));
  return expectedItems.filter((item) => activeItems.has(item)).length;
}

export class MqttMonitor extends EventEmitter {
  private client: MqttClient | null = null;
  private connected = false;
  private readonly startedAt = Date.now();
  private readonly topics = new Map<string, TopicRecord>();
  private readonly importantStates = new Map<string, ImportantState>();
  private readonly extraImportantTopics = new Set<string>();
  private readonly alerts: AlertEvent[] = [];
  private readonly notifier: MatrixNotifier;
  private interval: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private stopping = false;
  private lastErrorMessage = '';
  private lastErrorLoggedAt = 0;
  private applicationMessages = 0;
  private applicationBytes = 0;
  private systemMessages = 0;
  private systemBytes = 0;
  private readonly applicationTopics = new Set<string>();
  private readonly systemTopics = new Set<string>();
  private nextActivityLogAt: number;

  constructor(private readonly config: AppConfig) {
    super();
    this.notifier = new MatrixNotifier(config);
    this.nextActivityLogAt = Date.now() + config.activityLogIntervalMs;
  }

  start(): void {
    this.stopping = false;
    this.log('info', 'mqtt.connecting', { broker: this.publicBrokerUrl() });
    this.client = mqtt.connect(this.config.mqttUrl, {
      username: this.config.mqttUsername,
      password: this.config.mqttPassword,
      reconnectPeriod: 3_000,
      keepalive: 30,
    });

    this.client.on('connect', () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.log('info', 'mqtt.connected', { broker: this.publicBrokerUrl() });
      this.client?.subscribe(MQTT_SUBSCRIPTIONS, (error, granted) => {
        if (error) {
          this.log('error', 'mqtt.subscribe_failed', { error: error.message });
          return;
        }

        this.log('info', 'mqtt.subscribed', {
          subscriptions: (granted ?? []).map(({ topic, qos }) => ({ topic, qos })),
        });
      });
      this.emitUpdate();
    });

    this.client.on('close', () => {
      const wasConnected = this.connected;
      this.connected = false;
      if (wasConnected && !this.stopping) {
        this.log('warn', 'mqtt.disconnected');
      }
      this.emitUpdate();
    });

    this.client.on('reconnect', () => {
      this.reconnectAttempts += 1;
      if (this.reconnectAttempts === 1 || this.reconnectAttempts % 10 === 0) {
        this.log('warn', 'mqtt.reconnecting', { attempt: this.reconnectAttempts });
      }
    });

    this.client.on('error', (error) => {
      const now = Date.now();
      if (error.message !== this.lastErrorMessage || now - this.lastErrorLoggedAt >= REPEATED_ERROR_LOG_INTERVAL_MS) {
        this.lastErrorMessage = error.message;
        this.lastErrorLoggedAt = now;
        this.log('error', 'mqtt.error', { error: error.message });
      }
      this.emitUpdate();
    });

    this.client.on('message', (topic, payload) => {
      this.recordMessage(topic, payload);
    });

    this.interval = setInterval(() => {
      void this.checkImportantTopics();
      this.logActivityIfDue();
      this.emitUpdate();
    }, 1_000);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.stopping = true;
    this.client?.end(true);
    this.client = null;
    this.log('info', 'mqtt.monitor_stopped');
  }

  getSnapshot(): MonitorSnapshot {
    const now = Date.now();
    const topics = Array.from(this.topics.values())
      .map((record) => this.toTopicStatus(record, now))
      .sort((left, right) => Number(right.important) - Number(left.important) || right.messageCount - left.messageCount);

    return {
      mqttUrl: this.config.mqttUrl,
      connected: this.connected,
      startedAt: new Date(this.startedAt).toISOString(),
      now: new Date(now).toISOString(),
      matrix: {
        enabled: this.config.matrixEnabled,
        homeserver: this.config.matrixHomeserver,
        roomConfigured: Boolean(this.config.matrixRoomId),
        accessTokenConfigured: Boolean(this.config.matrixAccessToken),
      },
      importantPatterns: this.getImportantPatterns(),
      staleMs: this.config.staleMs,
      deadMs: this.config.deadMs,
      important: this.getImportantStatuses(now, topics),
      topics,
      alerts: this.alerts.slice(-40).reverse(),
    };
  }

  addImportantTopic(pattern: string): void {
    const normalized = pattern.trim();

    if (!normalized) {
      return;
    }

    this.extraImportantTopics.add(normalized);
    this.emitUpdate();
  }

  getMessages(topic: string): TopicMessage[] {
    return [...(this.topics.get(topic)?.messages ?? [])].reverse();
  }

  private recordMessage(topic: string, payload: Buffer): void {
    const now = Date.now();
    const existingRecord = this.topics.get(topic);
    const record = existingRecord ?? {
      topic,
      messageCount: 0,
      bytesTotal: 0,
      messageTimes: [],
      messages: [],
      lastSeenAt: now,
      lastPayloadPreview: '',
    };
    const payloadPreview = getPayloadPreview(payload);
    const payloadText = getPayloadText(payload);

    const isSystemTopic = topic.startsWith('$SYS/');
    if (isSystemTopic) {
      this.systemMessages += 1;
      this.systemBytes += payload.byteLength;
      this.systemTopics.add(topic);
    } else {
      this.applicationMessages += 1;
      this.applicationBytes += payload.byteLength;
      this.applicationTopics.add(topic);
    }
    if (!existingRecord && !isSystemTopic) {
      this.log('info', 'mqtt.topic_first_seen', { topic });
    }

    record.messageCount += 1;
    record.bytesTotal += payload.byteLength;
    record.lastSeenAt = now;
    record.lastPayloadPreview = payloadPreview;
    record.messageTimes = [...record.messageTimes.filter((time) => now - time <= 60_000), now];
    record.messages = [
      ...record.messages,
      {
        id: `${now}-${record.messageCount}`,
        topic,
        receivedAt: new Date(now).toISOString(),
        bytes: payload.byteLength,
        payloadPreview,
        payload: payloadText.payload,
        payloadTruncated: payloadText.payloadTruncated,
      },
    ].slice(-MAX_MESSAGES_PER_TOPIC);

    this.topics.set(topic, record);
    this.emitUpdate();
  }

  private getMatchedPattern(topic: string): string | null {
    return this.getImportantPatterns().find((pattern) => topicMatches(pattern, topic)) ?? null;
  }

  private getImportantPatterns(): string[] {
    return [...this.config.importantTopics, ...this.extraImportantTopics].filter(
      (pattern, index, list) => list.indexOf(pattern) === index,
    );
  }

  private toTopicStatus(record: TopicRecord, now: number): TopicStatus {
    const matchedPattern = this.getMatchedPattern(record.topic);

    return {
      topic: record.topic,
      important: Boolean(matchedPattern),
      matchedPattern,
      state: getTopicState(record.lastSeenAt, now, this.config.staleMs, this.config.deadMs),
      messageCount: record.messageCount,
      bytesTotal: record.bytesTotal,
      ratePerMinute: record.messageTimes.filter((time) => now - time <= 60_000).length,
      lastSeenAt: new Date(record.lastSeenAt).toISOString(),
      lastPayloadPreview: record.lastPayloadPreview,
      isExpectation: false,
      expectedCount: null,
      activeCount: null,
      countLabel: null,
    };
  }

  private getImportantStatuses(now: number, topics: TopicStatus[]): TopicStatus[] {
    const observedImportant = topics.filter((topic) => topic.important);
    const configured = this.getImportantPatterns().map((pattern) => {
      const matched = topics.filter((topic) => topicMatches(pattern, topic.topic));
      const expectation = this.config.importantTopicExpectations[pattern];
      const lastSeenAt = matched
        .map((topic) => (topic.lastSeenAt ? Date.parse(topic.lastSeenAt) : null))
        .filter((value): value is number => value !== null && Number.isFinite(value))
        .sort((left, right) => right - left)[0] ?? null;
      const expectedCount = expectation?.expectedItems.length ?? null;
      const activeCount = countActiveExpectedItems(pattern, matched, expectation?.expectedItems);
      const isPartiallyActive = activeCount !== null
        && expectedCount !== null
        && activeCount > 0
        && activeCount < expectedCount;

      let state: TopicState;
      if (isPartiallyActive) {
        state = 'degraded';
      } else if (lastSeenAt !== null) {
        state = getTopicState(lastSeenAt, now, this.config.staleMs, this.config.deadMs);
      } else {
        state = now - this.startedAt > this.config.deadMs ? 'dead' : 'silent';
      }

      return {
        topic: pattern,
        important: true,
        matchedPattern: hasWildcard(pattern) ? pattern : null,
        state,
        messageCount: matched.reduce((sum, topic) => sum + topic.messageCount, 0),
        bytesTotal: matched.reduce((sum, topic) => sum + topic.bytesTotal, 0),
        ratePerMinute: matched.reduce((sum, topic) => sum + topic.ratePerMinute, 0),
        lastSeenAt: lastSeenAt ? new Date(lastSeenAt).toISOString() : null,
        lastPayloadPreview: matched[0]?.lastPayloadPreview ?? '',
        isExpectation: true,
        expectedCount,
        activeCount,
        countLabel: expectation?.countLabel ?? null,
      } satisfies TopicStatus;
    });

    return [...configured, ...observedImportant]
      .filter((topic, index, list) => list.findIndex((item) => item.topic === topic.topic) === index)
      .sort((left, right) => left.topic.localeCompare(right.topic));
  }

  private async checkImportantTopics(): Promise<void> {
    const snapshot = this.getSnapshot();

    for (const topic of snapshot.important) {
      const previous = this.importantStates.get(topic.topic);
      const isDead = topic.state === 'dead';
      const recovered = previous?.state === 'dead' && topic.state === 'alive';

      if (isDead && !previous?.alertSent) {
        await this.createAlert(topic, this.formatAlertMessage(topic, 'dead'));
        this.importantStates.set(topic.topic, { state: topic.state, alertSent: true });
        continue;
      }

      if (recovered) {
        await this.createAlert(topic, this.formatAlertMessage(topic, 'recovered'));
        this.importantStates.set(topic.topic, { state: topic.state, alertSent: false });
        continue;
      }

      this.importantStates.set(topic.topic, {
        state: topic.state,
        alertSent: previous?.alertSent && topic.state !== 'alive' ? true : false,
      });
    }
  }

  private formatAlertMessage(topic: TopicStatus, event: 'dead' | 'recovered'): string {
    const now = Date.now();
    const lastSeenAt = topic.lastSeenAt ? Date.parse(topic.lastSeenAt) : null;
    const silenceSeconds = lastSeenAt ? Math.max(0, Math.round((now - lastSeenAt) / 1000)) : null;
    const title = event === 'dead' ? 'MQTT поток остановился' : 'MQTT поток восстановился';

    return [
      title,
      `Топик: ${topic.topic}`,
      `Статус: ${topic.state}`,
      `Важный шаблон: ${topic.matchedPattern ?? topic.topic}`,
      `Последнее сообщение: ${topic.lastSeenAt ? new Date(topic.lastSeenAt).toLocaleString('ru-RU') : 'не было'}`,
      `Молчание: ${silenceSeconds === null ? 'нет данных' : `${silenceSeconds} сек.`}`,
      `Порог dead: ${Math.round(this.config.deadMs / 1000)} сек.`,
      `Сообщений всего: ${topic.messageCount}`,
      `Скорость сейчас: ${topic.ratePerMinute}/мин`,
      `Время события: ${new Date(now).toLocaleString('ru-RU')}`,
    ].join('\n');
  }

  private async createAlert(topic: TopicStatus, message: string): Promise<void> {
    const alert: AlertEvent = {
      id: `${Date.now()}-${topic.topic}`,
      topic: topic.topic,
      state: topic.state,
      message,
      createdAt: new Date().toISOString(),
    };

    this.alerts.push(alert);
    this.emitUpdate();

    try {
      await this.notifier.send(message);
    } catch (error) {
      console.error('matrix.alert_error', error);
    }
  }

  private emitUpdate(): void {
    this.emit('update', this.getSnapshot());
  }

  private logActivityIfDue(): void {
    const now = Date.now();
    if (now < this.nextActivityLogAt) {
      return;
    }

    this.log('info', 'mqtt.activity', {
      connected: this.connected,
      applicationMessages: this.applicationMessages,
      applicationBytes: this.applicationBytes,
      activeApplicationTopics: this.applicationTopics.size,
      systemMessages: this.systemMessages,
      systemBytes: this.systemBytes,
      activeSystemTopics: this.systemTopics.size,
      knownTopics: this.topics.size,
      intervalMs: this.config.activityLogIntervalMs,
    });
    this.applicationMessages = 0;
    this.applicationBytes = 0;
    this.systemMessages = 0;
    this.systemBytes = 0;
    this.applicationTopics.clear();
    this.systemTopics.clear();
    this.nextActivityLogAt = now + this.config.activityLogIntervalMs;
  }

  private publicBrokerUrl(): string {
    try {
      const url = new URL(this.config.mqttUrl);
      url.username = '';
      url.password = '';
      return url.toString();
    } catch {
      return '<invalid MQTT URL>';
    }
  }

  private log(level: 'info' | 'warn' | 'error', event: string, details: Record<string, unknown> = {}): void {
    const line = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...details });
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.info(line);
    }
  }
}
