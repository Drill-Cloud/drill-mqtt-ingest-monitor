import { CheckCircle2, Clock3, Database, RadioTower, Wifi, WifiOff } from 'lucide-react';
import { formatAge, formatBytes, formatUptime } from '../format';
import type { MonitorSnapshot, TopicStatus } from '../types';
import { StateBadge, stateOrder } from './StateBadge';

function getBrokerParts(mqttUrl: string) {
  try {
    const url = new URL(mqttUrl);

    return {
      protocol: url.protocol.replace(':', ''),
      host: url.hostname,
      port: url.port || (url.protocol === 'mqtts:' ? '8883' : '1883'),
      path: url.pathname === '/' ? '' : url.pathname,
      usernameConfigured: Boolean(url.username),
    };
  } catch {
    return {
      protocol: 'unknown',
      host: mqttUrl,
      port: 'unknown',
      path: '',
      usernameConfigured: false,
    };
  }
}

function InfoTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="info-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getAllKnownTopics(snapshot: MonitorSnapshot): TopicStatus[] {
  const topicsByName = new Map<string, TopicStatus>();

  for (const topic of [...snapshot.important, ...snapshot.topics]) {
    const current = topicsByName.get(topic.topic);

    if (!current) {
      topicsByName.set(topic.topic, topic);
      continue;
    }

    topicsByName.set(topic.topic, {
      ...topic,
      important: current.important || topic.important,
      matchedPattern: current.matchedPattern ?? topic.matchedPattern,
    });
  }

  return [...topicsByName.values()].sort(
    (left, right) =>
      Number(right.important) - Number(left.important) ||
      stateOrder[left.state] - stateOrder[right.state] ||
      left.topic.localeCompare(right.topic),
  );
}

function BrokerTopicsTable({ now, topics }: { now: string; topics: TopicStatus[] }) {
  if (topics.length === 0) {
    return <div className="empty-panel">Пока нет известных MQTT-топиков. Они появятся после первого сообщения или настройки важного шаблона.</div>;
  }

  return (
    <div className="topic-table broker-topic-table">
      <div className="topic-table__head">
        <span>Топик</span>
        <span>Статус</span>
        <span>Последнее</span>
        <span>Скорость</span>
        <span>Сообщений</span>
        <span>Шаблон</span>
      </div>
      {topics.map((topic) => (
        <div className="topic-table__row" key={topic.topic}>
          <div>
            <strong>{topic.topic}</strong>
            {topic.important && <small>важный поток</small>}
          </div>
          <StateBadge state={topic.state} />
          <span>{formatAge(topic.lastSeenAt, now)}</span>
          <span>{topic.ratePerMinute}/мин</span>
          <span>{topic.messageCount}</span>
          <span>{topic.matchedPattern ?? '—'}</span>
        </div>
      ))}
    </div>
  );
}

export function BrokerOverview({ snapshot }: { snapshot: MonitorSnapshot }) {
  const broker = getBrokerParts(snapshot.mqttUrl);
  const allKnownTopics = getAllKnownTopics(snapshot);
  const totalMessages = snapshot.topics.reduce((sum, topic) => sum + topic.messageCount, 0);
  const totalBytes = snapshot.topics.reduce((sum, topic) => sum + topic.bytesTotal, 0);
  const rate = snapshot.topics.reduce((sum, topic) => sum + topic.ratePerMinute, 0);

  return (
    <section className="broker-view">
      <div className="panel broker-hero" id="broker">
        <div>
          <span className="kicker">Брокер</span>
          <h2>{snapshot.mqttUrl}</h2>
          <p>Монитор подключается к брокеру, подписывается на `#` и собирает runtime-картину известных MQTT-топиков.</p>
        </div>
        <div className={`broker-connection ${snapshot.connected ? 'broker-connection--online' : 'broker-connection--offline'}`}>
          {snapshot.connected ? <Wifi size={20} /> : <WifiOff size={20} />}
          <span>{snapshot.connected ? 'подключен' : 'отключен'}</span>
        </div>
      </div>

      <section className="broker-grid">
        <InfoTile label="Протокол" value={broker.protocol} />
        <InfoTile label="Хост" value={broker.host} />
        <InfoTile label="Порт" value={broker.port} />
        <InfoTile label="Путь" value={broker.path || '—'} />
        <InfoTile label="Пользователь" value={broker.usernameConfigured ? 'задан' : 'не задан'} />
        <InfoTile label="Подписка" value="#" />
      </section>

      <section className="broker-grid">
        <InfoTile label="Известных топиков" value={allKnownTopics.length} />
        <InfoTile label="Увиденных топиков" value={snapshot.topics.length} />
        <InfoTile label="Важных шаблонов" value={snapshot.importantPatterns.length} />
        <InfoTile label="Сообщений/мин" value={rate} />
        <InfoTile label="Трафик" value={formatBytes(totalBytes)} />
        <InfoTile label="Аптайм" value={formatUptime(snapshot.startedAt, snapshot.now)} />
      </section>

      <section className="panel broker-topics-panel">
        <div className="panel__header">
          <div>
            <span className="kicker">Топики</span>
            <h2>Все известные топики</h2>
          </div>
          <span className="panel__hint">{totalMessages} сообщений</span>
        </div>
        <BrokerTopicsTable now={snapshot.now} topics={allKnownTopics} />
      </section>

      <section className="panel broker-diagnostics">
        <div className="panel__header">
          <div>
            <span className="kicker">Диагностика</span>
            <h2>Пороговые значения и проверки</h2>
          </div>
          <RadioTower size={18} />
        </div>
        <div className="diagnostic-list">
          <div>
            <Clock3 size={16} />
            <span>Состояние `stale` после {Math.round(snapshot.staleMs / 1000)} секунд без сообщений.</span>
          </div>
          <div>
            <Clock3 size={16} />
            <span>Состояние `dead` после {Math.round(snapshot.deadMs / 1000)} секунд без сообщений.</span>
          </div>
          <div>
            <CheckCircle2 size={16} />
            <span>Увиденные топики появляются после сообщений, пришедших после запуска монитора.</span>
          </div>
          <div>
            <Database size={16} />
            <span>MQTT-брокер не хранит каталог всех когда-либо существовавших топиков, поэтому молчащие потоки нужно задавать как важные шаблоны.</span>
          </div>
        </div>
      </section>
    </section>
  );
}
