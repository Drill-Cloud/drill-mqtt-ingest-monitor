import type { TopicState } from '../types';

const stateLabels: Record<TopicState, string> = {
  alive: 'живой',
  stale: 'затихает',
  dead: 'мертвый',
  silent: 'нет данных',
};

export const stateOrder: Record<TopicState, number> = {
  dead: 0,
  stale: 1,
  silent: 2,
  alive: 3,
};

export function StateBadge({ state }: { state: TopicState }) {
  return <span className={`state-badge state-badge--${state}`}>{stateLabels[state]}</span>;
}
