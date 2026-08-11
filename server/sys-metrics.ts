import type { BrokerMetrics } from './types.js';

type SysValue = {
  value: string;
  receivedAt: number;
};

const SYS = '$SYS/broker';

export class SysMetricsCollector {
  private readonly values = new Map<string, SysValue>();

  record(topic: string, payload: Buffer, receivedAt: number): void {
    if (!topic.startsWith(`${SYS}/`)) return;

    this.values.set(topic, {
      value: payload.toString('utf8').trim(),
      receivedAt,
    });
  }

  getSnapshot(): BrokerMetrics {
    const updatedAt = Math.max(0, ...[...this.values.values()].map((item) => item.receivedAt));

    return {
      available: this.values.size > 0,
      updatedAt: updatedAt > 0 ? new Date(updatedAt).toISOString() : null,
      version: this.text(`${SYS}/version`),
      uptimeSeconds: this.number(`${SYS}/uptime`),
      clients: {
        connected: this.number(`${SYS}/clients/connected`),
        disconnected: this.number(`${SYS}/clients/disconnected`),
        total: this.number(`${SYS}/clients/total`),
        maximum: this.number(`${SYS}/clients/maximum`),
        expired: this.number(`${SYS}/clients/expired`),
      },
      messages: {
        received: this.number(`${SYS}/messages/received`),
        sent: this.number(`${SYS}/messages/sent`),
        stored: this.number(`${SYS}/messages/stored`),
        publishReceived: this.number(`${SYS}/publish/messages/received`),
        publishSent: this.number(`${SYS}/publish/messages/sent`),
        publishDropped: this.number(`${SYS}/publish/messages/dropped`),
      },
      bytes: {
        received: this.number(`${SYS}/bytes/received`),
        sent: this.number(`${SYS}/bytes/sent`),
        stored: this.number(`${SYS}/store/messages/bytes`),
      },
      subscriptions: this.number(`${SYS}/subscriptions/count`),
      retainedMessages: this.number(`${SYS}/retained messages/count`),
      heap: {
        current: this.number(`${SYS}/heap/current`),
        maximum: this.number(`${SYS}/heap/maximum`),
      },
      load: {
        messagesReceivedPerSecond: this.number(`${SYS}/load/messages/received/1min`),
        messagesSentPerSecond: this.number(`${SYS}/load/messages/sent/1min`),
        bytesReceivedPerSecond: this.number(`${SYS}/load/bytes/received/1min`),
        bytesSentPerSecond: this.number(`${SYS}/load/bytes/sent/1min`),
        publishDroppedPerSecond: this.number(`${SYS}/load/publish/dropped/1min`),
        connectionsPerSecond: this.number(`${SYS}/load/connections/1min`),
        socketsPerSecond: this.number(`${SYS}/load/sockets/1min`),
      },
    };
  }

  private text(topic: string): string | null {
    return this.values.get(topic)?.value || null;
  }

  private number(topic: string): number | null {
    const rawValue = this.values.get(topic)?.value;
    if (!rawValue) return null;

    const value = Number.parseFloat(rawValue);
    return Number.isFinite(value) ? value : null;
  }
}
