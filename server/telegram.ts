import { sessions, TelegramClient, utils } from 'teleproto';
import type { TelegramConfig } from './config.js';
import type { Notifier } from './alerts.js';

type MessageTarget = { send(message: string): Promise<unknown> };

export class TelegramNotifier implements Notifier {
  private client: TelegramClient | null = null;
  private target: MessageTarget | null = null;

  constructor(private readonly config: TelegramConfig) {}

  async send(message: string): Promise<void> {
    try {
      const target = await this.connect();
      await target.send(message);
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.client?.disconnect().catch(() => undefined);
    this.client = null;
    this.target = null;
  }

  private async connect(): Promise<MessageTarget> {
    if (this.target) return this.target;

    const client = new TelegramClient(
      new sessions.StringSession(''),
      this.config.apiId,
      this.config.apiHash,
      {
        connectionRetries: 5,
        proxy: {
          ip: this.config.proxyHost,
          port: this.config.proxyPort,
          MTProxy: true,
          secret: this.config.proxySecret,
          timeout: 10,
        },
      },
    );

    await client.start({ botAuthToken: this.config.botToken });

    // Для MTProto нужен хеш доступа канала; загрузка диалогов находит его по числовому ID Bot API.
    const dialogs = await client.getDialogs({ limit: 200 });
    const target = dialogs.find((dialog) => utils.getPeerId(dialog.inputEntity) === this.config.chatId);
    if (!target) {
      await client.disconnect();
      throw new Error(`Telegram chat ${this.config.chatId} is not available to the bot`);
    }

    this.client = client;
    this.target = target;
    return target;
  }
}
