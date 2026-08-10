# MQTT Monitor

Монитор Mosquitto: показывает увиденные MQTT-топики, состояние важных потоков и отправляет Matrix-алерты при остановке данных.

## Что умеет

- Подключается к одному MQTT-брокеру, адрес которого обязательно задаётся через `MQTT_URL` при развёртывании.
- Подписывается на `#` и видит все топики, в которые приходят сообщения после старта монитора.
- Отдельно отслеживает важные потоки:
  - `data/edge5/video/v2/+`
  - `data/edge5/modbus/v3`
- Показывает:
  - alive / stale / dead / silent;
  - последнее сообщение;
  - последние 100 сообщений по выбранному топику;
  - скорость сообщений за минуту;
  - общий счетчик сообщений и объем данных;
  - последние алерты.
- Позволяет добавить новый важный топик прямо из UI. Такие добавления живут до перезапуска процесса; постоянные важные топики задаются через `IMPORTANT_TOPICS`.
- Может отправлять сообщение в Matrix при переходе важного потока в `dead` и при восстановлении.

Важно: MQTT broker не хранит список всех когда-либо существовавших топиков. Монитор видит только те топики, по которым пришли сообщения после запуска, плюс заранее заданные важные шаблоны.

## Запуск

```bash
cd C:\Users\<user>\Drill\mqtt-monitor
npm install
copy .env.example .env
npm run dev
```

Открыть UI:

```text
http://localhost:5174
```

Backend API:

```text
http://localhost:3205/api/snapshot
http://localhost:3205/api/events
http://localhost:3205/api/messages?topic=data/edge5/modbus/v3
```

## Env

```env
HTTP_PORT=3205
VITE_PORT=5174
VITE_API_URL=http://localhost:3205

MQTT_URL=mqtt://drillcloud.ru:1883
MQTT_USERNAME=
MQTT_PASSWORD=

IMPORTANT_TOPICS=data/edge5/video/v2/+,data/edge5/modbus/v3
EDGE5_MODBUS_EXPECTED_TAGS=7
EDGE5_VIDEO_EXPECTED_CAMERAS=3
TOPIC_STALE_MS=15000
TOPIC_DEAD_MS=45000

MATRIX_ENABLED=false
MATRIX_HOMESERVER=https://matrix.greact.online
MATRIX_ROOM_ID=
MATRIX_ACCESS_TOKEN=
```

`IMPORTANT_TOPICS` принимает список MQTT-шаблонов через запятую. Для новых постоянных потоков достаточно добавить шаблон в эту переменную, например:

```env
IMPORTANT_TOPICS=data/edge5/video/v2/+,data/edge5/modbus/v3,data/edge5/custom/+
```

Для production-потоков монитор также проверяет ожидаемый состав:

- `data/edge5/modbus/v3` — данные для 7 тегов;
- `data/edge5/video/v2/+` — 3 одновременно живые камеры.

В разделе «Важные потоки» отображается покрытие, например `0 из 7 тегов` или `2 из 3 камер`. Поток без данных и неполный набор камер подсвечиваются красным и попадают в счётчик «Важные с проблемой». Ожидаемые количества задаются через `EDGE5_MODBUS_EXPECTED_TAGS` и `EDGE5_VIDEO_EXPECTED_CAMERAS`.

В UI можно быстро добавить важный топик без редеплоя. Это удобно для проверки, но после перезапуска монитора такой топик нужно будет добавить снова или перенести в `.env`.

Не фиксируйте IP брокера в production-конфигурации. Например, ошибочное значение `mqtt://83.23.97.7:1883` приведёт к статусу «оффлайн», даже когда `drillcloud.ru:1883` доступен. После изменения `MQTT_URL` стек нужно пересоздать, чтобы контейнер получил новое окружение.

## Matrix

Чтобы включить алерты:

```env
MATRIX_ENABLED=true
MATRIX_ROOM_ID=!room-id:matrix.greact.online
MATRIX_ACCESS_TOKEN=<access-token>
```

Сообщения отправляются в формате обычного `m.text`.

## Production build

```bash
npm run build
npm start
```

После `npm start` backend отдает только API. Для production UI нужно раздавать `dist` через nginx/static hosting или добавить отдельную раздачу статики, если это потребуется.
