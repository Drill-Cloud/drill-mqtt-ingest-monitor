import { readTelegramConfig } from './config.js';
import { TelegramNotifier } from './telegram.js';

const config = readTelegramConfig();
if (!config) throw new Error('TELEGRAM_ENABLED must be true');

const notifier = new TelegramNotifier(config);

try {
  await notifier.send([
    '🧪 Тест MQTT Monitor',
    'Telegram-уведомления работают.',
    `Время: ${new Date().toISOString()}`,
  ].join('\n'));
  console.log(`Test message sent to Telegram chat ${config.chatId}`);
} finally {
  await notifier.disconnect();
}
