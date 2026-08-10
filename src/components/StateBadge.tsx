import type { TopicState } from '../types';

const stateLabels: Record<TopicState, string> = {
  alive: 'живой',
  degraded: 'неполный',
  stale: 'затихает',
  dead: 'мертвый',
  silent: 'нет данных',
};

export const stateOrder: Record<TopicState, number> = {
  dead: 0,
  degraded: 1,
  stale: 2,
  silent: 3,
  alive: 4,
};

export function StateBadge({ state }: { state: TopicState }) {
  return <span className={`state-badge state-badge--${state}`}>{stateLabels[state]}</span>;
}
