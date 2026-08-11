import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import mqtt, { type MqttClient } from 'mqtt';
import type { AppConfig } from './config.js';
import { TelegramNotifier } from './telegram.js';
import { SysMetricsCollector } from './sys-metrics.js';
import { getPayloadPreview, getPayloadText, getTopicState, hasWildcard, topicMatches } from './topic-utils.js';
import type { AlertEvent, MonitorSnapshot, TopicMessage, TopicState, TopicStatus } from './types.js';

const MAX_MESSAGES_PER_TOPIC = 100;
const MQTT_SUBSCRIPTIONS = ['#', '$SYS/#'];
const REPEATED_ERROR_LOG_INTERVAL_MS = 60_000;

type TopicRecord = {
  topic: string;
  messageCount: number;
  bytesTotal: number;
  byteSamples: Array<{ receivedAt: number; bytes: number }>;
  messageTimes: number[];
  messages: TopicMessage[];
  lastSeenAt: number;
  lastPayloadPreview: string;
};

type ImportantState = {
  state: TopicState;
  alertSent: boolean;
  outageStartedAt: number | null;
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
  private readonly clientId = `mqtt-monitor-${randomUUID()}`;
  private connected = false;
  private readonly startedAt = Date.now();
  private readonly topics = new Map<string, TopicRecord>();
  private readonly importantStates = new Map<string, ImportantState>();
  private readonly extraImportantTopics = new Set<string>();
  private readonly alerts: AlertEvent[] = [];
  private readonly notifier: TelegramNotifier;
  private readonly sysMetrics = new SysMetricsCollector();
  private interval: NodeJS.Timeout | null = null;
  private checkingImportantTopics = false;
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
    this.notifier = new TelegramNotifier(config);
    this.nextActivityLogAt = Date.now() + config.activityLogIntervalMs;
  }

  start(): void {
    this.stopping = false;
    this.log('info', 'mqtt.connecting', { broker: this.publicBrokerUrl() });
    this.client = mqtt.connect(this.config.mqttUrl, {
      clientId: this.clientId,
      clean: true,
      username: this.config.mqttUsername,
      password: this.config.mqttPassword,
      reconnectPeriod: 3_000,
      keepalive: 30,
    });

    this.client.on('connect', () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.log('info', 'mqtt.connected', { broker: this.publicBrokerUrl() });
      this.client?.subscribe(MQTT_SUBSCRIPTIONS, { qos: 0 }, (error, granted) => {
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
      telegram: {
        enabled: this.config.telegramEnabled,
        ready: this.config.telegramEnabled
          && Boolean(this.config.telegramBotToken)
          && Boolean(this.config.telegramChatId),
        recipient: this.config.telegramChannelName || this.config.telegramChatId || 'не задан',
        chatConfigured: Boolean(this.config.telegramChatId),
        botTokenConfigured: Boolean(this.config.telegramBotToken),
        messageThreadConfigured: this.config.telegramMessageThreadId !== null,
      },
      brokerMetrics: this.sysMetrics.getSnapshot(),
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
      byteSamples: [],
      messageTimes: [],
      messages: [],
      lastSeenAt: now,
      lastPayloadPreview: '',
    };
    const payloadPreview = getPayloadPreview(payload);
    const isBinaryStream = topic.includes('/video/');
    const payloadText = isBinaryStream
      ? { payload: '<binary stream payload is not stored>', payloadTruncated: true }
      : getPayloadText(payload);

    const isSystemTopic = topic.startsWith('$SYS/');
    if (isSystemTopic) {
      this.sysMetrics.record(topic, payload, now);
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
    record.byteSamples = [
      ...record.byteSamples.filter((sample) => now - sample.receivedAt <= 60_000),
      { receivedAt: now, bytes: payload.byteLength },
    ];
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
      bytesPerMinute: record.byteSamples.reduce((sum, sample) => sum + sample.bytes, 0),
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
        bytesPerMinute: matched.reduce((sum, topic) => sum + topic.bytesPerMinute, 0),
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
    if (this.checkingImportantTopics) return;
    this.checkingImportantTopics = true;

    try {
      const snapshot = this.getSnapshot();

      for (const topic of this.getAlertCandidates(snapshot)) {
        const previous = this.importantStates.get(topic.topic);
        const isDead = topic.state === 'dead';
        const recovered = previous?.alertSent === true && topic.state === 'alive';

        if (isDead && !previous?.alertSent) {
          const outageStartedAt = topic.lastSeenAt
            ? Date.parse(topic.lastSeenAt)
            : this.startedAt;
          await this.createAlert(topic, 'dead', outageStartedAt);
          this.importantStates.set(topic.topic, {
            state: topic.state,
            alertSent: true,
            outageStartedAt,
          });
          continue;
        }

        if (recovered) {
          await this.createAlert(topic, 'recovered', previous.outageStartedAt);
          this.importantStates.set(topic.topic, {
            state: topic.state,
            alertSent: false,
            outageStartedAt: null,
          });
          continue;
        }

        this.importantStates.set(topic.topic, {
          state: topic.state,
          alertSent: previous?.alertSent && topic.state !== 'alive' ? true : false,
          outageStartedAt: previous?.outageStartedAt ?? null,
        });
      }
    } finally {
      this.checkingImportantTopics = false;
    }
  }

  private getAlertCandidates(snapshot: MonitorSnapshot): TopicStatus[] {
    const topicsByName = new Map(snapshot.topics.map((topic) => [topic.topic, topic]));
    const expectationsByPattern = new Map(
      snapshot.important
        .filter((topic) => topic.isExpectation)
        .map((topic) => [topic.topic, topic]),
    );
    const candidates: TopicStatus[] = [];

    for (const pattern of this.getImportantPatterns()) {
      const expectation = this.config.importantTopicExpectations[pattern];
      const materializedTopics = expectation?.expectedItems
        .map((item) => this.materializeExpectedTopic(pattern, item))
        .filter((topic): topic is string => topic !== null) ?? [];

      if (materializedTopics.length > 0) {
        for (const topicName of materializedTopics) {
          const observed = topicsByName.get(topicName);
          candidates.push(observed ?? this.createMissingTopicStatus(topicName, pattern));
        }
        continue;
      }

      const configured = expectationsByPattern.get(pattern);
      if (configured) candidates.push(configured);
    }

    return candidates.filter(
      (topic, index, list) => list.findIndex((item) => item.topic === topic.topic) === index,
    );
  }

  private materializeExpectedTopic(pattern: string, expectedItem: string): string | null {
    const parts = pattern.split('/');
    const wildcardIndexes = parts
      .map((part, index) => (part === '+' ? index : -1))
      .filter((index) => index >= 0);

    if (wildcardIndexes.length !== 1 || parts.includes('#')) return null;

    parts[wildcardIndexes[0]] = expectedItem;
    return parts.join('/');
  }

  private createMissingTopicStatus(topic: string, matchedPattern: string): TopicStatus {
    const now = Date.now();
    return {
      topic,
      important: true,
      matchedPattern,
      state: now - this.startedAt > this.config.deadMs ? 'dead' : 'silent',
      messageCount: 0,
      bytesTotal: 0,
      bytesPerMinute: 0,
      ratePerMinute: 0,
      lastSeenAt: null,
      lastPayloadPreview: '',
      isExpectation: true,
      expectedCount: 1,
      activeCount: 0,
      countLabel: 'источник',
    };
  }

  private formatAlertMessage(
    topic: TopicStatus,
    event: 'dead' | 'recovered',
    outageStartedAt: number | null,
  ): string {
    const now = Date.now();
    const lastSeenAt = topic.lastSeenAt ? Date.parse(topic.lastSeenAt) : null;
    const silenceSeconds = lastSeenAt ? Math.max(0, Math.round((now - lastSeenAt) / 1000)) : null;
    const outageDurationSeconds = event === 'recovered' && outageStartedAt
      ? Math.max(0, Math.round((now - outageStartedAt) / 1_000))
      : null;
    const title = event === 'dead' ? '🔴 MQTT-поток остановился' : '🟢 MQTT-поток восстановился';
    const source = topic.topic.split('/').at(-1) ?? topic.topic;

    return [
      title,
      '',
      `Источник: ${source}`,
      `Топик: ${topic.topic}`,
      `Брокер: ${this.publicBrokerUrl()}`,
      `Последнее сообщение: ${topic.lastSeenAt ? new Date(topic.lastSeenAt).toLocaleString('ru-RU') : 'не было'}`,
      event === 'dead'
        ? `Нет данных: ${silenceSeconds === null ? 'с момента запуска монитора' : `${silenceSeconds} сек.`}`
        : `Продолжительность простоя: ${outageDurationSeconds ?? 0} сек.`,
      `Время события: ${new Date(now).toLocaleString('ru-RU')}`,
    ].join('\n');
  }

  private async createAlert(
    topic: TopicStatus,
    event: 'dead' | 'recovered',
    outageStartedAt: number | null,
  ): Promise<void> {
    const now = Date.now();
    const lastSeenAt = topic.lastSeenAt ? Date.parse(topic.lastSeenAt) : null;
    const message = this.formatAlertMessage(topic, event, outageStartedAt);
    const alert: AlertEvent = {
      id: `${now}-${topic.topic}`,
      topic: topic.topic,
      state: topic.state,
      event,
      message,
      createdAt: new Date().toISOString(),
      silenceSeconds: lastSeenAt ? Math.max(0, Math.round((now - lastSeenAt) / 1_000)) : null,
      outageDurationSeconds: event === 'recovered' && outageStartedAt
        ? Math.max(0, Math.round((now - outageStartedAt) / 1_000))
        : null,
      deliveryStatus: 'pending',
      deliveryError: null,
    };

    this.alerts.push(alert);
    this.emitUpdate();

    try {
      alert.deliveryStatus = await this.notifier.send(message);
    } catch (error) {
      alert.deliveryStatus = 'failed';
      alert.deliveryError = error instanceof Error ? error.message : String(error);
      console.error('telegram.alert_error', error);
    } finally {
      this.emitUpdate();
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
