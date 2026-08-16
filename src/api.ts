import type { MonitorSnapshot } from '../shared/types';

export async function getSnapshot(signal?: AbortSignal): Promise<MonitorSnapshot> {
  const response = await fetch('/api/snapshot', { signal });
  if (!response.ok) throw new Error(`Monitor API: HTTP ${response.status}`);
  return response.json() as Promise<MonitorSnapshot>;
}

export function subscribeSnapshot(
  onMessage: (snapshot: MonitorSnapshot) => void,
  onError: () => void,
): EventSource {
  const events = new EventSource('/api/events');
  events.onmessage = (event) => onMessage(JSON.parse(event.data) as MonitorSnapshot);
  events.onerror = onError;
  return events;
}
