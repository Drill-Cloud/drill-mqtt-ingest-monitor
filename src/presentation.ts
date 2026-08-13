import type { ActivityState } from '../shared/types';

export const stateLabel: Record<ActivityState, string> = {
  active: 'Данные идут',
  silent: 'Нет данных',
  waiting: 'Ожидание',
};

export function brokerLabel(connected: boolean): string {
  return connected ? 'Доступен' : 'Недоступен';
}
