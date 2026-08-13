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
```

- `IMPORTANT_TOPICS` — точные топики или MQTT-шаблоны через запятую.
- `IMPORTANT_CAMERAS` — камеры для шаблонов вида `.../video/.../+`. Монитор разворачивает шаблон в отдельный контрольный канал для каждой камеры.
- `TOPIC_SILENCE_MS` — время без публикаций, после которого канал считается остановленным.

Старые переменные `EDGE5_MODBUS_IMPORTANT_TAGS`, `EDGE5_VIDEO_IMPORTANT_CAMERAS`, `TOPIC_STALE_MS` и `TOPIC_DEAD_MS` больше не используются. Монитор контролирует топики и камеры, а не содержимое или теги внутри сообщений.

## Telegram через MTProxy

Telegram необязателен. При остановке важного канала отправляется одно уведомление, после восстановления — ещё одно. Ошибка Telegram не влияет на MQTT-монитор и API.

```env
TELEGRAM_ENABLED=true
TELEGRAM_API_ID=<api-id с my.telegram.org>
TELEGRAM_API_HASH=<api-hash с my.telegram.org>
TELEGRAM_BOT_TOKEN=<токен BotFather>
TELEGRAM_CHAT_ID=-1000000000000
TELEGRAM_PROXY_HOST=proxy.example.com
TELEGRAM_PROXY_PORT=8443
TELEGRAM_PROXY_SECRET=<mtproxy-secret>
```

MTProxy работает по MTProto, поэтому кроме токена бота нужны `TELEGRAM_API_ID` и `TELEGRAM_API_HASH`. Бот должен состоять в целевом канале и иметь право публиковать сообщения.

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
