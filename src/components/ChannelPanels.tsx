import { Camera, Check, CircleAlert, RadioTower } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ActivityState, ImportantActivity, MonitorSnapshot, TopicActivity } from '../../shared/types';
import { formatAge, formatBytes } from '../format';
import { stateLabel } from '../presentation';
import { InfoHint } from './InfoHint';

export function ChannelPanels({ snapshot }: { snapshot: MonitorSnapshot }) {
  const activeImportant = snapshot.important.filter((item) => item.state === 'active').length;

  return (
    <div className="panels-grid">
      <section className="panel">
        <PanelHeader
          index="02"
          title="Топики с данными"
          subtitle="Активны прямо сейчас"
          counter={String(snapshot.topics.length)}
          hint="Список прикладных MQTT-топиков, получивших хотя бы одно сообщение в пределах интервала активности."
        />
        {snapshot.topics.length > 0
          ? <TopicList topics={snapshot.topics} timestamp={snapshot.timestamp} />
          : <EmptyState>За последние {Math.round(snapshot.silenceMs / 1_000)} секунд публикаций не было</EmptyState>}
      </section>

      <section className="panel">
        <PanelHeader
          index="03"
          title="Важные каналы"
          subtitle="Видны даже без данных"
          counter={`${activeImportant}/${snapshot.important.length}`}
          hint="Каналы из IMPORTANT_TOPICS. Видео-шаблон разворачивается в отдельный канал для каждой камеры из IMPORTANT_CAMERAS."
        />
        {snapshot.important.length > 0
          ? <ImportantList items={snapshot.important} timestamp={snapshot.timestamp} />
          : <EmptyState>Список IMPORTANT_TOPICS пока пуст</EmptyState>}
      </section>
    </div>
  );
}

function PanelHeader({ index, title, subtitle, counter, hint }: { index: string; title: string; subtitle: string; counter: string; hint: string }) {
  return (
    <header className="panel__header">
      <div className="section-heading"><span className="section-index">{index}</span><div><span className="section-kicker">{subtitle}</span><h2>{title}</h2></div></div>
      <div className="panel__tools"><span className="counter">{counter}</span><InfoHint text={hint} /></div>
    </header>
  );
}

function TopicList({ topics, timestamp }: { topics: TopicActivity[]; timestamp: string }) {
  const maximumTraffic = Math.max(...topics.map((topic) => topic.bytesPerMinute), 1);

  return (
    <div className="topic-list">
      <div className="topic-list__labels"><span>Топик</span><span>Последнее</span><span>Трафик</span></div>
      {topics.map((topic) => (
        <div className="topic-row" key={topic.topic}>
          <span className="activity-dot" />
          <div className="topic-row__name"><code>{topic.topic}</code><span><i style={{ width: `${Math.max(4, topic.bytesPerMinute / maximumTraffic * 100)}%` }} /></span></div>
          <small>{formatAge(topic.lastSeenAt, timestamp)}</small>
          <strong>{formatBytes(topic.bytesPerMinute)}/мин</strong>
        </div>
      ))}
    </div>
  );
}

function ImportantList({ items, timestamp }: { items: ImportantActivity[]; timestamp: string }) {
  const stateOrder: Record<ActivityState, number> = { silent: 0, waiting: 1, active: 2 };
  const orderedItems = [...items].sort((left, right) => stateOrder[left.state] - stateOrder[right.state]);

  return (
    <div className="important-list">
      {orderedItems.map((item) => (
        <article className={`important-row important-row--${item.state}`} key={item.channel}>
          <span className="important-row__icon">
            {item.channel.includes('/video/') ? <Camera /> : item.state === 'active' ? <Check /> : <CircleAlert />}
          </span>
          <div>
            <code>{item.channel}</code>
            <small>{item.lastSeenAt ? `${formatAge(item.lastSeenAt, timestamp)} · ${formatBytes(item.bytesPerMinute)}/мин` : 'Канал настроен · данные ещё не поступали'}</small>
          </div>
          <StateBadge state={item.state} />
        </article>
      ))}
    </div>
  );
}

function StateBadge({ state }: { state: ActivityState }) {
  return <span className={`badge badge--${state}`}><i />{stateLabel[state]}</span>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty"><span className="empty__icon"><RadioTower /></span><strong>Нет активности</strong><span>{children}</span></div>;
}
