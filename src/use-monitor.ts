import { useEffect, useState } from 'react';
import type { MonitorSnapshot } from '../shared/types';
import { getSnapshot, subscribeSnapshot } from './api';

export function useMonitor(): { snapshot: MonitorSnapshot | null; error: string | null } {
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void getSnapshot(controller.signal)
      .then(setSnapshot)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));

    const events = subscribeSnapshot(
      (nextSnapshot) => {
        setSnapshot(nextSnapshot);
        setError(null);
      },
      () => setError('Связь с монитором восстанавливается…'),
    );

    return () => {
      controller.abort();
      events.close();
    };
  }, []);

  return { snapshot, error };
}
