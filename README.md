# MQTT Monitor

Read-only монитор MQTT-шины. Один экран отвечает на четыре вопроса:

1. доступен ли брокер;
2. идут ли данные через шину сейчас;
3. в каких топиках есть публикации;
4. работают ли важные топики и камеры.

Монитор подключается как независимый подписчик с `QoS 0` и `clean session`, подписывается на `#`, но ничего не публикует и не хранит payload. Каждый MQTT-подписчик получает собственную копию сообщения, поэтому монитор не перехватывает данные у ingest.

## Запуск

```bash
cp .env.example .env
npm install
npm run dev
```

`MQTT_URL` обязателен: у приложения нет брокера по умолчанию. Для production задайте адрес конкретного брокера в окружении стека — hostname и IP поддерживаются одинаково.

```env
MQTT_URL=mqtt://broker.example.com:1883
IMPORTANT_TOPICS=data/edge5/video/v2/+,data/edge5/modbus/v3
IMPORTANT_CAMERAS=camera-11,camera-12,camera-13
TOPIC_SILENCE_MS=45000
TZ=Europe/Moscow
```

- `IMPORTANT_TOPICS` — точные топики или MQTT-шаблоны через запятую.
- `IMPORTANT_CAMERAS` — камеры для шаблонов вида `.../video/.../+`. Монитор разворачивает шаблон в отдельный контрольный канал для каждой камеры.
- `TOPIC_SILENCE_MS` — время без публикаций, после которого канал считается остановленным.
- `TZ` — часовой пояс для времени в уведомлениях.

Старые переменные `EDGE5_MODBUS_IMPORTANT_TAGS`, `EDGE5_VIDEO_IMPORTANT_CAMERAS`, `TOPIC_STALE_MS` и `TOPIC_DEAD_MS` больше не используются. Монитор контролирует топики и камеры, а не содержимое или теги внутри сообщений.

## Telegram через SOCKS5

Telegram необязателен. При остановке важного канала отправляется одно уведомление, после восстановления — ещё одно. Ошибка Telegram не влияет на MQTT-монитор и API.

```env
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=<токен BotFather>
TELEGRAM_CHAT_ID=-1000000000000
TELEGRAM_SOCKS_HOST=proxy.example.com
TELEGRAM_SOCKS_PORT=1080
TELEGRAM_SOCKS_USERNAME=mqttmonitor
TELEGRAM_SOCKS_PASSWORD=<пароль>
TELEGRAM_ALERT_INTERVAL_MS=60000
```

Монитор вызывает Telegram Bot API через SOCKS5. `api_id`, `api_hash` и MTProxy secret не нужны. Бот должен состоять в целевом канале и иметь право публиковать сообщения. Доступ к SOCKS5 следует ограничить внешним IP сервера монитора. `TELEGRAM_ALERT_INTERVAL_MS` задаёт минимальный интервал между сводками; изменения, произошедшие во время ожидания, объединяются в следующее сообщение.

После заполнения `.env` отправьте одно реальное тестовое сообщение:

```bash
npm run test:telegram
```

Успешная команда выведет ID чата. Значения токена и пароля прокси приложение не печатает.

## Read-only ACL

Окончательно запретите запись на стороне брокера отдельной учётной записью:

```conf
user mqtt-monitor
topic read #
```

Приложение не подписывается на `$SYS/#`: доступность определяется MQTT-соединением, а поток данных — реальными публикациями в прикладных топиках.

## Проверка и production

```bash
npm test
npm run build
npm start
```

API состоит из трёх read-only endpoint: `/api/health`, `/api/snapshot` и SSE `/api/events`. Production-сервер также раздаёт собранный интерфейс из `dist`.
