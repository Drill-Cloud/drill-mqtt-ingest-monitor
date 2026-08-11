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
EDGE5_MODBUS_IMPORTANT_TAGS=edge5-v3-wk,edge5-v3-hk,edge5-v3-vw,edge5-v3-pdk,edge5-v3-h2s,edge5-v3-nrot,edge5-v3-vsp
EDGE5_VIDEO_IMPORTANT_CAMERAS=v1,v2,v3
TOPIC_STALE_MS=15000
TOPIC_DEAD_MS=45000
ACTIVITY_LOG_INTERVAL_MS=60000

MATRIX_ENABLED=false
MATRIX_HOMESERVER=https://matrix.greact.online
MATRIX_ROOM_ID=
MATRIX_ACCESS_TOKEN=
```

`MQTT_URL` — обязательная переменная. У монитора нет брокера по умолчанию.

`IMPORTANT_TOPICS` принимает список MQTT-шаблонов через запятую. Для новых постоянных потоков достаточно добавить шаблон в эту переменную, например:

```env
IMPORTANT_TOPICS=data/edge5/video/v2/+,data/edge5/modbus/v3,data/edge5/custom/+
```

Для production-потоков монитор также проверяет состав важных тегов и камер:

- `data/edge5/modbus/v3` — теги из `EDGE5_MODBUS_IMPORTANT_TAGS`;
- `data/edge5/video/v2/+` — камеры из `EDGE5_VIDEO_IMPORTANT_CAMERAS`.

Ожидаемое количество вычисляется из длины соответствующего списка. В разделе «Важные потоки» отображается покрытие, например `0 из 7 тегов` или `2 из 3 камер`. Для видео учитываются только камеры с ID из настроенного списка: посторонний активный топик не маскирует отсутствие обязательной камеры. Поток без данных и неполный набор камер подсвечиваются красным и попадают в счётчик «Важные с проблемой».

В UI можно быстро добавить важный топик без редеплоя. Это удобно для проверки, но после перезапуска монитора такой топик нужно будет добавить снова или перенести в `.env`.

Не фиксируйте IP брокера в production-конфигурации. Например, ошибочное значение `mqtt://83.23.97.7:1883` приведёт к статусу «оффлайн», даже когда `drillcloud.ru:1883` доступен. После изменения `MQTT_URL` стек нужно пересоздать, чтобы контейнер получил новое окружение.

## Логи и наблюдаемость

Монитор пишет структурированные JSON-события в `stdout`, поэтому они видны во вкладке **Logs** контейнера в Portainer:

- `mqtt.connecting`, `mqtt.connected`, `mqtt.disconnected`;
- `mqtt.reconnecting` — первая и затем каждая десятая попытка, без засорения логов;
- `mqtt.subscribe_failed`, `mqtt.subscribed` — результат подписки на `#` и `$SYS/#`;
- `mqtt.topic_first_seen` — первое сообщение нового топика;
- `mqtt.activity` — минутная сводка: сообщения, байты и активные топики отдельно для application и `$SYS` traffic;
- `mqtt.error` — ошибка подключения, повторяющаяся ошибка выводится не чаще раза в минуту.

Payload сообщений в stdout не пишется: это защищает секретные данные и не заполняет диск бинарными видеопакетами. Период сводки задаётся через `ACTIVITY_LOG_INTERVAL_MS`.

Обычная MQTT-подписка `#` не включает служебную иерархию `$SYS`. Поэтому монитор подписывается на неё отдельно и получает broker-метрики: число клиентов, сообщения, байты, dropped publish и очереди.

### Подключение контейнеров в Portainer

Если Mosquitto и монитор находятся в одной Docker-сети, предпочтительно обращаться к брокеру по имени его Compose-сервиса:

```env
MQTT_URL=mqtt://mosquitto:1883
```

Здесь `mosquitto` нужно заменить на настоящее имя сервиса брокера. Оба сервиса должны быть подключены к одной external-сети, например `proxy`. Публиковать порт `1883` наружу для связи контейнеров не требуется — достаточно `expose`/listener внутри сети.

Если контейнеры находятся на разных серверах или в разных сетях, используется внешний DNS:

```env
MQTT_URL=mqtt://drillcloud.ru:1883
```

После изменения переменной стек монитора нужно пересоздать. В production snapshot должны одновременно выполняться условия: `mqttUrl` содержит правильный адрес, `connected=true`, а `topics` начинает расти после публикаций.

### Рекомендуемая конфигурация Mosquitto

В `mosquitto.conf` самого брокера:

```conf
listener 1883

log_dest stdout
log_timestamp true
log_timestamp_format %Y-%m-%dT%H:%M:%S
connection_messages true
log_type error
log_type warning
log_type notice
log_type information
log_type subscribe
log_type unsubscribe

sys_interval 10
```

Не включайте `log_type all` или `debug` постоянно в production: эти режимы нужны только для короткой диагностики и создают слишком много записей. Broker-логи должны показывать подключения, ошибки и подписки; контроль потока данных выполняется через `$SYS` и агрегаты самого монитора.

Для монитора рекомендуется отдельная read-only учётная запись. Ей нужны права чтения прикладных топиков и `$SYS/#`, но не право публикации:

```conf
user mqtt-monitor
topic read #
topic read $SYS/#
```

Если используются Dynamic Security ACL, эквивалентные разрешения задаются для `subscribe` и `publishClientReceive`. Логин и пароль передаются монитору через `MQTT_USERNAME` и `MQTT_PASSWORD` в Portainer secrets/environment.

### Проверка цепочки

Из контейнера в той же Docker-сети последовательно проверить:

```bash
mosquitto_sub -h mosquitto -p 1883 -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" \
  -t '$SYS/#' -t 'data/edge5/modbus/v3' -t 'data/edge5/video/v2/+' \
  -F '@Y-@m-@dT@H:@M:@S : %t : %l bytes'
```

Если `$SYS` приходит, а `data/edge5/...` нет — брокер и ACL работают, проблема находится на стороне publisher/Node-RED либо выбран не тот broker. Если не приходит даже `$SYS`, нужно проверять адрес, сеть, listener, логин и ACL.

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
