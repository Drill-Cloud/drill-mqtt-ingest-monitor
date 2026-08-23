import type { ActivityState, MonitorSnapshot } from '../shared/types.js';

export type Notifier = {
  send(message: string): Promise<void>;
};

export class AlertService {
  private readonly silentChannels = new Set<string>();
  private readonly pendingChanges = new Map<string, ActivityState>();
  private readonly timeFormatter: Intl.DateTimeFormat;
  private readonly timeZoneLabel: string;
  private latestSnapshot: MonitorSnapshot | null = null;
  private timer: NodeJS.Timeout | null = null;
  private lastSentAt = 0;

  constructor(
    private readonly notifier: Notifier | null,
    private readonly intervalMs = 60_000,
    timeZone = 'Europe/Moscow',
  ) {
    this.timeZoneLabel = timeZone === 'Europe/Moscow' ? 'МСК' : timeZone;
    this.timeFormatter = new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'short',
      timeStyle: 'medium',
      timeZone,
    });
  }

  check(snapshot: MonitorSnapshot): void {
    if (!this.notifier) return;
    this.latestSnapshot = snapshot;

    for (const channel of snapshot.important) {
      // Множество хранит открытые инциденты и не даёт повторять алерт во время одного простоя.
      if (channel.state === 'silent' && !this.silentChannels.has(channel.channel)) {
        this.silentChannels.add(channel.channel);
        this.pendingChanges.set(channel.channel, 'silent');
      }

      if (channel.state === 'active' && this.silentChannels.delete(channel.channel)) {
        this.pendingChanges.set(channel.channel, 'active');
      }
    }

    if (this.pendingChanges.size > 0) this.schedule();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    if (this.timer) return;

    const delay = Math.max(0, this.intervalMs - (Date.now() - this.lastSentAt));
    if (delay === 0) {
      this.flush();
      return;
    }

    this.timer = setTimeout(() => this.flush(), delay);
  }

  private flush(): void {
    const snapshot = this.latestSnapshot;
    const changes = new Map(this.pendingChanges);
    this.pendingChanges.clear();
    this.timer = null;

    if (!snapshot || changes.size === 0) return;
    this.lastSentAt = Date.now();
    this.notify(this.message(snapshot, changes));
  }

  private message(snapshot: MonitorSnapshot, changes: Map<string, ActivityState>): string {
    const changedStates = new Set(changes.values());
    const title = changedStates.size > 1
      ? '🟡 Состояние потоков изменилось'
      : changedStates.has('silent')
        ? '🔴 Поток данных остановлен'
        : '🟢 Поток данных восстановлен';

    const changedLines = [...changes].map(([channel, state]) =>
      `${stateIcon(state)} <b>${escapeHtml(channel)}</b> — ${stateLabel(state)}`,
    );
    const summaryLines = snapshot.important.map((channel) =>
      `${stateIcon(channel.state)} ${escapeHtml(channel.channel)} — ${stateLabel(channel.state)}`,
    );
    const time = this.timeFormatter.format(new Date(snapshot.timestamp));

    return [
      title,
      '',
      '⚠️ <b>Обратите внимание</b>',
      ...changedLines,
      '',
      '📋 <b>Все важные каналы</b>',
      ...summaryLines,
      '',
      `Время события: ${time} (${this.timeZoneLabel})`,
    ].join('\n');
  }

  private notify(message: string): void {
    void this.notifier?.send(message).catch((error: unknown) => {
      const text = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({ event: 'telegram.send_failed', error: text }));
    });
  }
}

function stateIcon(state: ActivityState): string {
  if (state === 'active') return '🟢';
  if (state === 'silent') return '🔴';
  return '⚪';
}

function stateLabel(state: ActivityState): string {
  if (state === 'active') return 'данные идут';
  if (state === 'silent') return 'нет данных';
  return 'ожидание данных';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
