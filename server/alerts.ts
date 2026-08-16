import type { MonitorSnapshot } from '../shared/types.js';

export type Notifier = {
  send(message: string): Promise<void>;
};

export class AlertService {
  private readonly silentChannels = new Set<string>();

  constructor(private readonly notifier: Notifier | null) {}

  check(snapshot: MonitorSnapshot): void {
    if (!this.notifier) return;

    for (const channel of snapshot.important) {
      // Множество хранит открытые инциденты и не даёт повторять алерт во время одного простоя.
      if (channel.state === 'silent' && !this.silentChannels.has(channel.channel)) {
        this.silentChannels.add(channel.channel);
        this.notify(`🔴 Поток данных остановлен\nТопик: ${channel.channel}\nВремя: ${snapshot.timestamp}`);
      }

      if (channel.state === 'active' && this.silentChannels.delete(channel.channel)) {
        this.notify(`🟢 Поток данных восстановлен\nТопик: ${channel.channel}\nВремя: ${snapshot.timestamp}`);
      }
    }
  }

  private notify(message: string): void {
    void this.notifier?.send(message).catch((error: unknown) => {
      const text = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({ event: 'telegram.send_failed', error: text }));
    });
  }
}
