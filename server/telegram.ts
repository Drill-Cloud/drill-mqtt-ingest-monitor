import https from 'node:https';
import { SocksProxyAgent } from 'socks-proxy-agent';
import type { TelegramConfig } from './config.js';
import type { Notifier } from './alerts.js';

type TelegramResponse = {
  ok: boolean;
  description?: string;
};

export class TelegramNotifier implements Notifier {
  private readonly agent: SocksProxyAgent;
  private sendQueue: Promise<void> = Promise.resolve();

  constructor(private readonly config: TelegramConfig) {
    const proxy = new URL(`socks5h://${config.socksHost}:${config.socksPort}`);
    proxy.username = config.socksUsername;
    proxy.password = config.socksPassword;
    this.agent = new SocksProxyAgent(proxy, { keepAlive: true });
  }

  send(message: string): Promise<void> {
    // Последовательная очередь сохраняет порядок алертов при частых изменениях состояния.
    const task = this.sendQueue.then(() => this.sendNow(message));
    this.sendQueue = task.catch(() => undefined);
    return task;
  }

  async disconnect(): Promise<void> {
    this.agent.destroy();
  }

  private sendNow(message: string): Promise<void> {
    return this.request('sendMessage', {
      chat_id: this.config.chatId,
      text: message,
      parse_mode: 'HTML',
    });
  }

  private request(method: string, payload: Record<string, string>): Promise<void> {
    const body = JSON.stringify(payload);

    return new Promise((resolve, reject) => {
      const request = https.request({
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${this.config.botToken}/${method}`,
        method: 'POST',
        agent: this.agent,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        },
      }, (response) => {
        let responseBody = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          responseBody += chunk;
        });
        response.on('end', () => {
          try {
            const result = JSON.parse(responseBody) as TelegramResponse;
            if (!result.ok) {
              reject(new Error(`Telegram API error: ${result.description ?? 'unknown error'}`));
              return;
            }
            resolve();
          } catch (error) {
            reject(new Error(`Telegram returned an invalid response (HTTP ${response.statusCode ?? 0})`, {
              cause: error,
            }));
          }
        });
      });

      request.setTimeout(15_000, () => {
        request.destroy(new Error('Telegram request timed out'));
      });
      request.on('error', reject);
      request.end(body);
    });
  }
}
