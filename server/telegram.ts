import type { AppConfig } from './config.js';

const SEND_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 5_000;
const RETRY_DELAY_MS = 600;

type TelegramErrorResponse = {
  description?: string;
  parameters?: {
    retry_after?: number;
  };
};

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class TelegramNotifier {
  constructor(private readonly config: AppConfig) {}

  async send(message: string): Promise<'disabled' | 'sent'> {
    if (!this.config.telegramEnabled) {
      return 'disabled';
    }

    if (!this.config.telegramBotToken) {
      throw new Error('TELEGRAM_BOT_TOKEN is not configured');
    }

    if (!this.config.telegramChatId) {
      throw new Error('TELEGRAM_CHAT_ID is not configured');
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= SEND_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(
          `https://api.telegram.org/bot${this.config.telegramBotToken}/sendMessage`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify({
              chat_id: this.config.telegramChatId,
              text: message,
              message_thread_id: this.config.telegramMessageThreadId ?? undefined,
            }),
            signal: controller.signal,
          },
        );

        const body = await response.json().catch(() => ({})) as TelegramErrorResponse;
        if (response.ok) {
          return 'sent';
        }

        lastError = new Error(body.description || `Telegram returned ${response.status}`);
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt === SEND_ATTEMPTS) {
          break;
        }

        const retryAfterMs = body.parameters?.retry_after
          ? body.parameters.retry_after * 1_000
          : RETRY_DELAY_MS * attempt;
        await wait(retryAfterMs);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < SEND_ATTEMPTS) {
          await wait(RETRY_DELAY_MS * attempt);
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError ?? new Error('Telegram delivery failed');
  }
}
