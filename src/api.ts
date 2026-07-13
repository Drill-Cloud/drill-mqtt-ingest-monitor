import type { MonitorSnapshot, TopicMessage } from './types';

export async function getSnapshot(signal?: AbortSignal): Promise<MonitorSnapshot> {
  const response = await fetch('/api/snapshot', { signal });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<MonitorSnapshot>;
}

export function subscribeSnapshot(onMessage: (snapshot: MonitorSnapshot) => void, onError: () => void): EventSource {
  const source = new EventSource('/api/events');

  source.onmessage = (event) => {
    onMessage(JSON.parse(event.data) as MonitorSnapshot);
  };

  source.onerror = () => {
    onError();
  };

  return source;
}

export async function getTopicMessages(topic: string, signal?: AbortSignal): Promise<TopicMessage[]> {
  const params = new URLSearchParams({ topic });
  const response = await fetch(`/api/messages?${params.toString()}`, { signal });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as { messages: TopicMessage[] };
  return body.messages;
}

export async function addImportantTopic(pattern: string): Promise<MonitorSnapshot> {
  const response = await fetch('/api/important-topics', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pattern }),
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<MonitorSnapshot>;
}
