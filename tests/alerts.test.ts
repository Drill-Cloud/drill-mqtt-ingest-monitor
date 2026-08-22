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

function snapshot(...states: Array<'active' | 'silent' | 'waiting'>): MonitorSnapshot {
  return {
    timestamp: '2026-08-13T10:00:00.000Z',
    broker: { address: 'mqtt://broker', connected: true, error: null },
    bus: { state: states[0] ?? 'waiting', lastMessageAt: null, activeTopicCount: 0, messagesPerMinute: 0, bytesPerMinute: 0 },
    topics: [],
    important: states.map((state, index) => ({
      channel: `data/important/${index + 1}`,
      state,
      lastSeenAt: null,
      messagesPerMinute: 0,
      bytesPerMinute: 0,
    })),
    silenceMs: 45_000,
  };
}

test('combines changed channels and includes the full summary', () => {
  const notifier = new FakeNotifier();
  const alerts = new AlertService(notifier, 0, 'Europe/Moscow');

  alerts.check(snapshot('waiting', 'waiting'));
  alerts.check(snapshot('silent', 'silent'));
  alerts.check(snapshot('silent', 'silent'));
  alerts.check(snapshot('active', 'active'));
  alerts.check(snapshot('active', 'active'));

  assert.equal(notifier.messages.length, 2);
  assert.match(notifier.messages[0] ?? '', /остановлен/);
  assert.match(notifier.messages[0] ?? '', /<b>data\/important\/1<\/b>/);
  assert.match(notifier.messages[0] ?? '', /data\/important\/2/);
  assert.match(notifier.messages[0] ?? '', /13\.08\.2026, 13:00:00/);
  assert.match(notifier.messages[0] ?? '', /\(МСК\)/);
  assert.match(notifier.messages[1] ?? '', /восстановлен/);
});

test('does not send summaries more often than the configured interval', async () => {
  const notifier = new FakeNotifier();
  const alerts = new AlertService(notifier, 30);

  alerts.check(snapshot('silent'));
  alerts.check(snapshot('active'));
  assert.equal(notifier.messages.length, 1);

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(notifier.messages.length, 2);
  alerts.stop();
});
