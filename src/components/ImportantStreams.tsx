import { Clock3 } from 'lucide-react';
import { formatAge, formatBytes } from '../format';
import type { MonitorSnapshot, TopicStatus } from '../types';
import { StateBadge } from './StateBadge';

function ImportantStream({ topic, now }: { topic: TopicStatus; now: string }) {
  return (
    <article className={`important-card important-card--${topic.state}`}>
      <div className="important-card__top">
        <StateBadge state={topic.state} />
        <span>{formatAge(topic.lastSeenAt, now)}</span>
      </div>
      <h3>{topic.topic}</h3>
      {topic.isExpectation && topic.expectedCount !== null && topic.activeCount !== null && (
        <div className={`important-card__coverage ${topic.state === 'alive' ? '' : 'important-card__coverage--problem'}`}>
          <strong>{topic.activeCount} из {topic.expectedCount}</strong>
          <span>{topic.countLabel}</span>
        </div>
      )}
      <div className="important-card__metrics">
        <span>{topic.ratePerMinute}/мин</span>
        <span>{formatBytes(topic.bytesTotal)}</span>
        <span>{topic.messageCount} сообщений</span>
      </div>
    </article>
  );
}

export function ImportantStreams({ snapshot }: { snapshot: MonitorSnapshot }) {
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <span className="kicker">Важные</span>
          <h2>Критичные потоки</h2>
        </div>
        <div className="panel__hint">
          <Clock3 size={15} />
          stale {Math.round(snapshot.staleMs / 1000)}с · dead {Math.round(snapshot.deadMs / 1000)}с
        </div>
      </div>
      <div className="important-grid">
        {snapshot.important.filter((topic) => topic.isExpectation).map((topic) => (
          <ImportantStream key={topic.topic} topic={topic} now={snapshot.now} />
        ))}
      </div>
    </section>
  );
}
