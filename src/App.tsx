import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Database,
  Layers3,
  RadioTower,
  Shield,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getSnapshot, subscribeSnapshot } from './api';
import { BrokerOverview } from './components/BrokerOverview';
import { ImportantStreams } from './components/ImportantStreams';
import { MatrixAlertsView } from './components/MatrixAlertsView';
import { StatCard } from './components/StatCard';
import { TopicExplorer } from './components/TopicExplorer';
import { formatUptime } from './format';
import type { MonitorSnapshot } from './types';

type Section = 'broker' | 'topics' | 'important' | 'matrix';

const sectionTitles: Record<Section, string> = {
  broker: 'Брокер',
  topics: 'Топики',
  important: 'Важные потоки',
  matrix: 'Matrix-алерты',
};

export function App() {
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('topics');

  useEffect(() => {
    const controller = new AbortController();

    void getSnapshot(controller.signal)
      .then(setSnapshot)
      .catch((nextError: unknown) => setError((nextError as Error).message));

    const source = subscribeSnapshot(
      (nextSnapshot) => {
        setSnapshot(nextSnapshot);
        setError(null);
      },
      () => setError('SSE-соединение с монитором потеряно'),
    );

    return () => {
      controller.abort();
      source.close();
    };
  }, []);

  const stats = useMemo(() => {
    const topics = snapshot?.topics ?? [];
    const important = snapshot?.important ?? [];

    return {
      topics: topics.length,
      importantAlive: important.filter((topic) => topic.state === 'alive').length,
      importantDead: important.filter((topic) => topic.state === 'dead').length,
      rate: topics.reduce((sum, topic) => sum + topic.ratePerMinute, 0),
    };
  }, [snapshot]);

  if (!snapshot) {
    return (
      <main className="page page--center">
        <div className="loading-card">
          <RadioTower />
          <strong>Подключаем MQTT-монитор</strong>
          <span>{error ?? 'Ждем первый snapshot...'}</span>
        </div>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand__mark">M</div>
          <div>
            <span>MQTT</span>
            <strong>Monitor</strong>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Разделы монитора">
          <button className={section === 'broker' ? 'sidebar-nav__item--active' : ''} onClick={() => setSection('broker')} type="button">
            <Database size={16} />
            Брокер
          </button>
          <button className={section === 'topics' ? 'sidebar-nav__item--active' : ''} onClick={() => setSection('topics')} type="button">
            <Layers3 size={16} />
            Топики
          </button>
          <button className={section === 'important' ? 'sidebar-nav__item--active' : ''} onClick={() => setSection('important')} type="button">
            <Shield size={16} />
            Важные потоки
          </button>
          <button className={section === 'matrix' ? 'sidebar-nav__item--active' : ''} onClick={() => setSection('matrix')} type="button">
            <Bell size={16} />
            Matrix-алерты
          </button>
        </nav>

        <div className={`sidebar-status ${snapshot.connected ? 'sidebar-status--online' : 'sidebar-status--offline'}`}>
          {snapshot.connected ? <Wifi size={16} /> : <WifiOff size={16} />}
          <span>{snapshot.connected ? 'MQTT онлайн' : 'MQTT оффлайн'}</span>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Кластер</span>
            <span>/</span>
            <strong>{sectionTitles[section]}</strong>
          </div>
          <div className="topbar__meta">
            <span>{snapshot.mqttUrl}</span>
            <div className={`connection-pill ${snapshot.connected ? 'connection-pill--online' : 'connection-pill--offline'}`}>
              {snapshot.connected ? <Wifi size={18} /> : <WifiOff size={18} />}
              <span>{snapshot.connected ? 'онлайн' : 'оффлайн'}</span>
            </div>
          </div>
        </header>

        {error && (
          <section className="error-banner">
            <AlertTriangle size={18} />
            {error}
          </section>
        )}

        <section className="status-grid">
          <StatCard label="Всего топиков" value={stats.topics} />
          <StatCard label="Важные живые" value={stats.importantAlive} tone="good" />
          <StatCard label="Важные мертвые" value={stats.importantDead} tone={stats.importantDead > 0 ? 'bad' : 'good'} />
          <StatCard label="Сообщений/мин" value={stats.rate} />
          <StatCard label="Аптайм" value={formatUptime(snapshot.startedAt, snapshot.now)} />
        </section>

        {section === 'broker' && <BrokerOverview snapshot={snapshot} />}
        {section === 'topics' && <TopicExplorer snapshot={snapshot} onSnapshot={setSnapshot} />}
        {section === 'important' && <ImportantStreams snapshot={snapshot} />}
        {section === 'matrix' && <MatrixAlertsView snapshot={snapshot} />}

        <footer className="footer">
          <div>
            <CheckCircle2 size={15} />
            Подписка: #
          </div>
          <div>{formatUptime(snapshot.startedAt, snapshot.now)}</div>
        </footer>
      </main>
    </div>
  );
}
