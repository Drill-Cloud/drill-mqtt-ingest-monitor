import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Clock3,
  Database,
  Gauge,
  HardDrive,
  MemoryStick,
  RadioTower,
  Server,
  ShieldCheck,
  Signal,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { formatAge, formatBytes } from '../format';
import type { MonitorSnapshot } from '../types';
import { InfoTooltip } from './InfoTooltip';

function getBrokerParts(mqttUrl: string) {
  try {
    const url = new URL(mqttUrl);

    return {
      protocol: url.protocol.replace(':', ''),
      host: url.hostname,
      port: url.port || (url.protocol === 'mqtts:' ? '8883' : '1883'),
    };
  } catch {
    return { protocol: 'unknown', host: mqttUrl, port: 'unknown' };
  }
}

function formatNumber(value: number | null, maximumFractionDigits = 0): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits }).format(value);
}

function formatRate(value: number | null, unit: string): string {
  return value === null ? '—' : `${formatNumber(value, 1)} ${unit}`;
}

function formatBrokerUptime(seconds: number | null): string {
  if (seconds === null) return '—';

  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);

  if (days > 0) return `${days}д ${hours}ч`;
  if (hours > 0) return `${hours}ч ${minutes}м`;
  return `${minutes}м`;
}

function MetricCard({
  detail,
  icon,
  label,
  tooltip,
  tone = 'blue',
  value,
}: {
  detail: string;
  icon: ReactNode;
  label: string;
  tooltip: string;
  tone?: 'blue' | 'green' | 'orange' | 'red';
  value: string;
}) {
  return (
    <article className={`broker-metric-card broker-metric-card--${tone}`}>
      <div className="broker-metric-card__icon">{icon}</div>
      <div className="broker-metric-card__label"><span>{label}</span><InfoTooltip text={tooltip} /></div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function FlowLane({
  color,
  icon,
  label,
  maxValue,
  tooltip,
  total,
  value,
}: {
  color: 'blue' | 'orange';
  icon: ReactNode;
  label: string;
  maxValue: number;
  tooltip: string;
  total: string;
  value: number | null;
}) {
  const width = value === null ? 0 : Math.max(4, Math.min(100, (value / maxValue) * 100));

  return (
    <div className="broker-flow-lane">
      <div className={`broker-flow-lane__icon broker-flow-lane__icon--${color}`}>{icon}</div>
      <div className="broker-flow-lane__body">
        <div className="broker-flow-lane__meta">
          <strong>{label} <InfoTooltip text={tooltip} /></strong>
          <span>{formatRate(value, 'Б/с')}</span>
        </div>
        <div className="broker-flow-lane__track">
          <span className={`broker-flow-lane__value broker-flow-lane__value--${color}`} style={{ width: `${width}%` }} />
          <i className={`broker-flow-lane__packet broker-flow-lane__packet--${color}`} />
        </div>
      </div>
      <div className="broker-flow-lane__total">
        <span>Всего</span>
        <strong>{total}</strong>
      </div>
    </div>
  );
}

export function BrokerOverview({ snapshot }: { snapshot: MonitorSnapshot }) {
  const broker = getBrokerParts(snapshot.mqttUrl);
  const metrics = snapshot.brokerMetrics;
  const applicationTopics = snapshot.topics.filter((topic) => !topic.topic.startsWith('$SYS/'));
  const telemetryRate = applicationTopics
    .filter((topic) => !topic.topic.includes('/video/'))
    .reduce((sum, topic) => sum + topic.ratePerMinute, 0);
  const applicationBytes = applicationTopics.reduce((sum, topic) => sum + topic.bytesTotal, 0);
  const clientTotal = metrics.clients.total ?? 0;
  const clientRatio = clientTotal > 0 ? Math.min(1, (metrics.clients.connected ?? 0) / clientTotal) : 0;
  const ringStyle = { '--client-progress': `${clientRatio * 360}deg` } as CSSProperties;
  const maxTraffic = Math.max(
    metrics.load.bytesReceivedPerSecond ?? 0,
    metrics.load.bytesSentPerSecond ?? 0,
    1,
  );
  const heapUsage = metrics.heap.current !== null && metrics.heap.maximum
    ? `${Math.round((metrics.heap.current / metrics.heap.maximum) * 100)}% от пика`
    : 'Текущее использование';

  return (
    <section className="broker-view">
      <section className="panel broker-hero broker-hero--dashboard">
        <div className="broker-hero__identity">
          <div className="broker-hero__radar" aria-hidden="true">
            <span />
            <RadioTower size={26} />
          </div>
          <div>
            <div className="broker-heading-with-help">
              <span className="kicker">Mosquitto / live telemetry</span>
              <InfoTooltip text="Сводное состояние MQTT-брокера. Значения поступают из служебной иерархии $SYS и не изменяют работу брокера или ingest-сервиса." />
            </div>
            <h2>{broker.host}:{broker.port}</h2>
            <p>
              Служебные показатели `$SYS` преобразуются в понятные метрики. Монитор работает как независимый
              подписчик и не участвует в доставке сообщений ingest-сервису.
            </p>
          </div>
        </div>
        <div className="broker-hero__badges">
          <div className="readonly-badge"><ShieldCheck size={16} /> Read only</div>
          <div className={`broker-connection ${snapshot.connected ? 'broker-connection--online' : 'broker-connection--offline'}`}>
            {snapshot.connected ? <Wifi size={18} /> : <WifiOff size={18} />}
            <span>{snapshot.connected ? 'подключен' : 'отключен'}</span>
          </div>
        </div>
      </section>

      {!metrics.available ? (
        <section className="panel sys-empty-state">
          <Signal size={34} />
          <div>
            <h2>Ожидаем метрики `$SYS`</h2>
            <p>Проверьте `sys_interval` Mosquitto и право `topic read $SYS/#` у пользователя монитора.</p>
          </div>
        </section>
      ) : (
        <>
          <section className="broker-dashboard-lead">
            <article className="panel broker-runtime-card">
              <div className="broker-runtime-card__top">
                <span className="broker-live-label"><i /> Broker live <InfoTooltip text="Версия и время непрерывной работы самого Mosquitto. Время обновления показывает свежесть последней полученной метрики $SYS." /></span>
                <span>{formatAge(metrics.updatedAt, snapshot.now)}</span>
              </div>
              <div className="broker-runtime-card__version">
                <Server size={24} />
                <div>
                  <span>Версия</span>
                  <strong>{metrics.version ?? 'Mosquitto'}</strong>
                </div>
              </div>
              <div className="broker-runtime-card__facts">
                <div><span>Аптайм брокера</span><strong>{formatBrokerUptime(metrics.uptimeSeconds)}</strong></div>
                <div><span>Протокол</span><strong>{broker.protocol.toUpperCase()}</strong></div>
              </div>
            </article>

            <article className="panel broker-clients-card">
              <div className="broker-clients-ring" style={ringStyle}>
                <div>
                  <strong>{formatNumber(metrics.clients.connected)}</strong>
                  <span>онлайн</span>
                </div>
              </div>
              <div className="broker-clients-copy">
                <div className="broker-heading-with-help"><span className="kicker">Клиенты</span><InfoTooltip text="Текущие MQTT-клиенты брокера: активные соединения, отключённые сессии и максимальное одновременно наблюдавшееся количество." /></div>
                <h3>Подключения к брокеру</h3>
                <div><span>Всего известно</span><strong>{formatNumber(metrics.clients.total)}</strong></div>
                <div><span>Отключено</span><strong>{formatNumber(metrics.clients.disconnected)}</strong></div>
                <div><span>Максимум</span><strong>{formatNumber(metrics.clients.maximum)}</strong></div>
              </div>
            </article>
          </section>

          <section className="broker-metric-grid">
            <MetricCard icon={<Boxes size={19} />} label="Подписки" tooltip="Количество активных MQTT-подписок всех клиентов брокера, включая подписки самого монитора." value={formatNumber(metrics.subscriptions)} detail="Активные подписки" tone="blue" />
            <MetricCard icon={<Database size={19} />} label="Retained" tooltip="Количество retained-публикаций, которые брокер хранит и сразу отдаёт новым подписчикам." value={formatNumber(metrics.retainedMessages)} detail="Сохранённые публикации" tone="green" />
            <MetricCard icon={<HardDrive size={19} />} label="В хранилище" tooltip="Сообщения, находящиеся во внутреннем хранилище Mosquitto, и занимаемый ими объём." value={formatNumber(metrics.messages.stored)} detail={metrics.bytes.stored === null ? 'Сообщений брокера' : formatBytes(metrics.bytes.stored)} tone="orange" />
            <MetricCard icon={<MemoryStick size={19} />} label="Память" tooltip="Текущий объём heap-памяти процесса Mosquitto и его отношение к зафиксированному максимуму." value={metrics.heap.current === null ? '—' : formatBytes(metrics.heap.current)} detail={heapUsage} tone="blue" />
            <MetricCard icon={<Activity size={19} />} label="Publish получено" tooltip="Общее количество PUBLISH-сообщений, принятых брокером от клиентов с момента запуска Mosquitto." value={formatNumber(metrics.messages.publishReceived)} detail="С момента запуска" tone="green" />
            <MetricCard icon={<Gauge size={19} />} label="Publish отброшено" tooltip="Публикации, которые брокер не смог доставить или сохранить. Рост значения требует проверки очередей, лимитов и медленных клиентов." value={formatNumber(metrics.messages.publishDropped)} detail={formatRate(metrics.load.publishDroppedPerSecond, 'сообщ./с')} tone={(metrics.messages.publishDropped ?? 0) > 0 ? 'red' : 'green'} />
          </section>

          <section className="panel broker-traffic-panel">
            <div className="panel__header">
              <div>
                <div className="broker-heading-with-help"><span className="kicker">Поток данных</span><InfoTooltip text="Средняя скорость всего MQTT-трафика брокера за последнюю минуту. Включает прикладные публикации и служебную доставку подписчикам." /></div>
                <h2>Трафик брокера</h2>
              </div>
              <span className="panel__hint"><Activity size={15} /> среднее за 1 минуту</span>
            </div>
            <div className="broker-flow-list">
              <FlowLane color="blue" icon={<ArrowDownToLine size={19} />} label="Получено брокером" tooltip="Байты, принятые Mosquitto от всех MQTT-клиентов. Полоса показывает среднюю скорость за одну минуту, справа — накопительный объём." maxValue={maxTraffic} total={metrics.bytes.received === null ? '—' : formatBytes(metrics.bytes.received)} value={metrics.load.bytesReceivedPerSecond} />
              <FlowLane color="orange" icon={<ArrowUpFromLine size={19} />} label="Отправлено клиентам" tooltip="Байты, доставленные Mosquitto всем подписчикам. Значение может быть выше входящего трафика, потому что одна публикация копируется нескольким клиентам." maxValue={maxTraffic} total={metrics.bytes.sent === null ? '—' : formatBytes(metrics.bytes.sent)} value={metrics.load.bytesSentPerSecond} />
            </div>
            <div className="broker-message-rates">
              <div><ArrowDownToLine size={16} /><span className="broker-inline-label">Сообщения входящие <InfoTooltip text="Среднее число MQTT-пакетов, принимаемых брокером в секунду за последнюю минуту." /></span><strong>{formatRate(metrics.load.messagesReceivedPerSecond, 'сообщ./с')}</strong></div>
              <div><ArrowUpFromLine size={16} /><span className="broker-inline-label">Сообщения исходящие <InfoTooltip text="Среднее число MQTT-пакетов, отправляемых брокером подписчикам в секунду за последнюю минуту." /></span><strong>{formatRate(metrics.load.messagesSentPerSecond, 'сообщ./с')}</strong></div>
              <div><Users size={16} /><span className="broker-inline-label">Новые соединения <InfoTooltip text="Средняя частота новых MQTT-соединений за последнюю минуту. Всплески могут указывать на частые переподключения клиентов." /></span><strong>{formatRate(metrics.load.connectionsPerSecond, 'соед./с')}</strong></div>
            </div>
          </section>
        </>
      )}

      <section className="broker-bottom-grid">
        <section className="panel broker-app-summary">
          <div className="panel__header">
            <div><div className="broker-heading-with-help"><span className="kicker">Application traffic</span><InfoTooltip text="Только пользовательские MQTT-топики. Служебные $SYS-топики исключены из количества, частоты и объёма." /></div><h2>Прикладные потоки</h2></div>
            <span className="panel__hint">без `$SYS`</span>
          </div>
          <div className="broker-app-summary__grid">
            <div><span className="broker-inline-label">Топиков <InfoTooltip text="Количество прикладных топиков, увиденных монитором после запуска. $SYS сюда не входит." /></span><strong>{applicationTopics.length}</strong></div>
            <div><span className="broker-inline-label">Телеметрия/мин <InfoTooltip text="Суммарное количество прикладных сообщений за последнюю минуту без $SYS и видеочанков. Видео оценивается по байтам в секунду." /></span><strong>{telemetryRate}</strong></div>
            <div><span className="broker-inline-label">Получено монитором <InfoTooltip text="Накопительный объём прикладных данных, которые получил этот экземпляр монитора после запуска." /></span><strong>{formatBytes(applicationBytes)}</strong></div>
          </div>
        </section>

        <section className="panel broker-readonly-panel">
          <div className="broker-readonly-panel__icon"><ShieldCheck size={24} /></div>
          <div>
            <div className="broker-heading-with-help"><span className="kicker">Безопасный режим</span><InfoTooltip text="Монитор использует обычные независимые подписки и не может перехватить сообщение у ingest. Запрет публикации окончательно обеспечивается read-only ACL Mosquitto." /></div>
            <h2>Только наблюдение</h2>
            <p>Обычные подписки `#` и `$SYS/#`, QoS 0. Публикация и shared subscription не используются.</p>
          </div>
        </section>
      </section>
    </section>
  );
}
