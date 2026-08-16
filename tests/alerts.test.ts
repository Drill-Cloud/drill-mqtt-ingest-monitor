import assert from 'node:assert/strict';
import test from 'node:test';
import type { MonitorSnapshot } from '../shared/types.js';
import { AlertService, type Notifier } from '../server/alerts.js';

class FakeNotifier implements Notifier {
  readonly messages: string[] = [];
  async send(message: string): Promise<void> {
    this.messages.push(message);
  }
}

function snapshot(state: 'active' | 'silent' | 'waiting'): MonitorSnapshot {
  return {
    timestamp: '2026-08-13T10:00:00.000Z',
    broker: { address: 'mqtt://broker', connected: true, error: null },
    bus: { state, lastMessageAt: null, activeTopicCount: 0, messagesPerMinute: 0, bytesPerMinute: 0 },
    topics: [],
    important: [{ channel: 'data/important', state, lastSeenAt: null, messagesPerMinute: 0, bytesPerMinute: 0 }],
    silenceMs: 45_000,
  };
}

test('sends one stop alert and one recovery without duplicates', () => {
  const notifier = new FakeNotifier();
  const alerts = new AlertService(notifier);

  alerts.check(snapshot('waiting'));
  alerts.check(snapshot('silent'));
  alerts.check(snapshot('silent'));
  alerts.check(snapshot('active'));
  alerts.check(snapshot('active'));

  assert.equal(notifier.messages.length, 2);
  assert.match(notifier.messages[0] ?? '', /остановлен/);
  assert.match(notifier.messages[1] ?? '', /восстановлен/);
});
