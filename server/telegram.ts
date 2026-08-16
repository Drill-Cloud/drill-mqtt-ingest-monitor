import { sessions, TelegramClient, utils } from 'teleproto';
import type { TelegramConfig } from './config.js';
import type { Notifier } from './alerts.js';

type MessageTarget = { send(message: string): Promise<unknown> };

export class TelegramNotifier implements Notifier {
  private client: TelegramClient | null = null;
  private target: MessageTarget | null = null;
  private connectionPromise: Promise<MessageTarget> | null = null;
  private sendQueue: Promise<void> = Promise.resolve();

  constructor(private readonly config: TelegramConfig) {}

  send(message: string): Promise<void> {
    // Telegram принимает сообщения последовательно через одно MTProto-соединение.
    const task = this.sendQueue.then(() => this.sendNow(message));
    this.sendQueue = task.catch(() => undefined);
    return task;
  }

  async disconnect(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.target = null;
    this.connectionPromise = null;
    await client?.disconnect().catch(() => undefined);
  }

  private async sendNow(message: string): Promise<void> {
    try {
      const target = await this.connect();
      await target.send(message);
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }

  private connect(): Promise<MessageTarget> {
    if (this.target) return Promise.resolve(this.target);
    if (this.connectionPromise) return this.connectionPromise;

    this.connectionPromise = this.openConnection().finally(() => {
      this.connectionPromise = null;
    });
    return this.connectionPromise;
  }

  private async openConnection(): Promise<MessageTarget> {
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
    this.client = client;

    try {
      await client.start({ botAuthToken: this.config.botToken });

      // Для MTProto нужен хеш доступа канала; диалоги позволяют найти его по ID из Bot API.
      const dialogs = await client.getDialogs({ limit: 200 });
      const target = dialogs.find(
        (dialog) => utils.getPeerId(dialog.inputEntity) === this.config.chatId,
      );
      if (!target) {
        throw new Error(`Telegram chat ${this.config.chatId} is not available to the bot`);
      }

      this.target = target;
      return target;
    } catch (error) {
      await client.disconnect();
      if (this.client === client) this.client = null;
      throw error;
    }
  }
}
