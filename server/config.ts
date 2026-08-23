export type TelegramConfig = {
  botToken: string;
  chatId: string;
  socksHost: string;
  socksPort: number;
  socksUsername: string;
  socksPassword: string;
  alertIntervalMs: number;
};

export type AppConfig = {
  httpPort: number;
  mqtt: {
    url: string;
    username?: string;
    password?: string;
  };
  importantTopics: string[];
  importantCameras: string[];
  silenceMs: number;
  timeZone: string;
  telegram: TelegramConfig | null;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function positiveNumber(name: string, fallback?: number): number {
  const raw = process.env[name]?.trim();
  if (!raw && fallback !== undefined) return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

function list(name: string, fallback: string[] = []): string[] {
  const raw = process.env[name];
  const values = raw === undefined ? fallback : raw.split(',');
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function readTelegramConfig(): TelegramConfig | null {
  if (process.env.TELEGRAM_ENABLED !== 'true') return null;

  return {
    botToken: required('TELEGRAM_BOT_TOKEN'),
    chatId: required('TELEGRAM_CHAT_ID'),
    socksHost: required('TELEGRAM_SOCKS_HOST'),
    socksPort: positiveNumber('TELEGRAM_SOCKS_PORT'),
    socksUsername: required('TELEGRAM_SOCKS_USERNAME'),
    socksPassword: required('TELEGRAM_SOCKS_PASSWORD'),
    alertIntervalMs: positiveNumber('TELEGRAM_ALERT_INTERVAL_MS', 60_000),
  };
}

export function readConfig(): AppConfig {
  return {
    httpPort: positiveNumber('HTTP_PORT', 3205),
    mqtt: {
      url: required('MQTT_URL'),
      username: process.env.MQTT_USERNAME?.trim() || undefined,
      password: process.env.MQTT_PASSWORD || undefined,
    },
    importantTopics: list('IMPORTANT_TOPICS'),
    importantCameras: list('IMPORTANT_CAMERAS'),
    silenceMs: positiveNumber('TOPIC_SILENCE_MS', 45_000),
    timeZone: process.env.TZ?.trim() || 'Europe/Moscow',
    telegram: readTelegramConfig(),
  };
}
