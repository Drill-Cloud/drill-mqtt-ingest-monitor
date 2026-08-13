import type {
  ActivityState,
  ImportantActivity,
  MonitorSnapshot,
  TopicActivity,
} from '../shared/types.js';

const RATE_WINDOW_MS = 60_000;
const MAX_TRACKED_TOPICS = 2_000;

type Bucket = { second: number; messages: number; bytes: number };
type TopicRecord = { lastSeenAt: number; buckets: Bucket[] };
type Rate = { messagesPerMinute: number; bytesPerMinute: number };

export function matchesTopic(pattern: string, topic: string): boolean {
  const patternLevels = pattern.split('/');
  const topicLevels = topic.split('/');

  for (let index = 0; index < patternLevels.length; index += 1) {
    const level = patternLevels[index];
    if (level === '#') return index === patternLevels.length - 1;
    if (topicLevels[index] === undefined || (level !== '+' && level !== topicLevels[index])) {
      return false;
    }
  }

  return patternLevels.length === topicLevels.length;
}

export function expandImportantChannels(patterns: string[], cameras: string[]): string[] {
  return patterns.flatMap((pattern) => {
    // Шаблон камер раскрывается в отдельные каналы, чтобы работающая камера не скрывала остановку другой.
    const isCameraPattern = pattern.includes('/video/') && pattern.endsWith('/+');
    if (!isCameraPattern || cameras.length === 0) return pattern;
    return cameras.map((camera) => `${pattern.slice(0, -1)}${camera}`);
  });
}

export class TopicTracker {
  private readonly topics = new Map<string, TopicRecord>();
  private readonly importantChannels: string[];
  private readonly startedAt: number;

  constructor(
    importantPatterns: string[],
    importantCameras: string[],
    private readonly silenceMs: number,
    startedAt = Date.now(),
  ) {
    this.importantChannels = expandImportantChannels(importantPatterns, importantCameras);
    this.startedAt = startedAt;
  }

  record(topic: string, bytes: number, now = Date.now()): void {
    // Пространства `$` содержат метаданные брокера, а не прикладные данные в шине.
    if (topic.startsWith('$')) return;

    let record = this.topics.get(topic);
    if (!record) {
      this.makeRoom();
      record = { lastSeenAt: now, buckets: [] };
      this.topics.set(topic, record);
    }

    record.lastSeenAt = now;
    const second = Math.floor(now / 1_000);
    const bucket = record.buckets.at(-1);

    if (bucket?.second === second) {
      bucket.messages += 1;
      bucket.bytes += bytes;
    } else {
      record.buckets.push({ second, messages: 1, bytes });
    }
  }

  snapshot(now = Date.now()): Pick<MonitorSnapshot, 'bus' | 'topics' | 'important'> {
    const activeTopics: TopicActivity[] = [];
    let lastMessageAt: number | null = null;
    let busMessages = 0;
    let busBytes = 0;

    for (const [topic, record] of this.topics) {
      const rate = this.rate(record, now);
      busMessages += rate.messagesPerMinute;
      busBytes += rate.bytesPerMinute;
      lastMessageAt = Math.max(lastMessageAt ?? 0, record.lastSeenAt);

      if (now - record.lastSeenAt <= this.silenceMs) {
        activeTopics.push(this.toTopicActivity(topic, record, rate));
      }
    }

    activeTopics.sort((left, right) => {
      return right.bytesPerMinute - left.bytesPerMinute || left.topic.localeCompare(right.topic);
    });

    return {
      bus: {
        state: this.state(lastMessageAt, now),
        lastMessageAt: lastMessageAt ? new Date(lastMessageAt).toISOString() : null,
        activeTopicCount: activeTopics.length,
        messagesPerMinute: busMessages,
        bytesPerMinute: busBytes,
      },
      topics: activeTopics,
      important: this.importantChannels.map((channel) => this.importantActivity(channel, now)),
    };
  }

  private importantActivity(channel: string, now: number): ImportantActivity {
    let latest: TopicRecord | null = null;
    let messages = 0;
    let bytes = 0;

    for (const [topic, record] of this.topics) {
      if (!matchesTopic(channel, topic)) continue;
      if (!latest || record.lastSeenAt > latest.lastSeenAt) latest = record;
      const rate = this.rate(record, now);
      messages += rate.messagesPerMinute;
      bytes += rate.bytesPerMinute;
    }

    return {
      channel,
      state: this.state(latest?.lastSeenAt ?? null, now),
      lastSeenAt: latest ? new Date(latest.lastSeenAt).toISOString() : null,
      messagesPerMinute: messages,
      bytesPerMinute: bytes,
    };
  }

  private state(lastSeenAt: number | null, now: number): ActivityState {
    if (lastSeenAt !== null && now - lastSeenAt <= this.silenceMs) return 'active';
    if (lastSeenAt === null && now - this.startedAt <= this.silenceMs) return 'waiting';
    return 'silent';
  }

  private rate(record: TopicRecord, now: number): Rate {
    const minimumSecond = Math.floor((now - RATE_WINDOW_MS) / 1_000);
    // Очистка при секундном снимке сохраняет обработку каждого MQTT-сообщения быстрой.
    while (record.buckets[0]?.second < minimumSecond) record.buckets.shift();

    return record.buckets.reduce(
      (total, bucket) => ({
        messagesPerMinute: total.messagesPerMinute + bucket.messages,
        bytesPerMinute: total.bytesPerMinute + bucket.bytes,
      }),
      { messagesPerMinute: 0, bytesPerMinute: 0 },
    );
  }

  private toTopicActivity(topic: string, record: TopicRecord, rate: Rate): TopicActivity {
    return {
      topic,
      lastSeenAt: new Date(record.lastSeenAt).toISOString(),
      ...rate,
    };
  }

  private makeRoom(): void {
    if (this.topics.size < MAX_TRACKED_TOPICS) return;

    // Ограничиваем память, но не удаляем явно настроенные важные каналы.
    let oldest: [string, TopicRecord] | null = null;
    for (const entry of this.topics) {
      if (this.importantChannels.some((pattern) => matchesTopic(pattern, entry[0]))) continue;
      if (!oldest || entry[1].lastSeenAt < oldest[1].lastSeenAt) oldest = entry;
    }
    if (oldest) this.topics.delete(oldest[0]);
  }
}
