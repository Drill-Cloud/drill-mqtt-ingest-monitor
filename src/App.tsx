import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Layers3,
  RadioTower,
  Send,
  Shield,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getSnapshot, subscribeSnapshot } from './api';
import { BrokerOverview } from './components/BrokerOverview';
import { ImportantStreams } from './components/ImportantStreams';
import { TelegramAlertsView } from './components/TelegramAlertsView';
import { StatCard } from './components/StatCard';
import { TopicExplorer } from './components/TopicExplorer';
import { formatUptime } from './format';
import type { MonitorSnapshot } from './types';

type Section = 'broker' | 'topics' | 'important' | 'telegram';

const sectionTitles: Record<Section, string> = {
  broker: 'Брокер',
  topics: 'Топики',
  important: 'Важные потоки',
  telegram: 'Telegram',
};

export function App() {
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('broker');

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
    const topics = (snapshot?.topics ?? []).filter((topic) => !topic.topic.startsWith('$SYS/'));
    const telemetryTopics = topics.filter((topic) => !topic.topic.includes('/video/'));
    const important = (snapshot?.important ?? []).filter((topic) => topic.isExpectation);

    return {
      topics: topics.length,
      importantAlive: important.filter((topic) => topic.state === 'alive').length,
      importantProblems: important.filter((topic) => topic.state !== 'alive').length,
      rate: telemetryTopics.reduce((sum, topic) => sum + topic.ratePerMinute, 0),
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
          <button className={section === 'telegram' ? 'sidebar-nav__item--active' : ''} onClick={() => setSection('telegram')} type="button">
            <Send size={16} />
            Telegram
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
          <StatCard label="Прикладных топиков" tooltip="Количество увиденных пользовательских топиков без служебной иерархии $SYS." value={stats.topics} />
          <StatCard label="Важные живые" tooltip="Важные потоки, которые сейчас получают данные и имеют полный ожидаемый состав." value={stats.importantAlive} tone="good" />
          <StatCard
            label="Важные с проблемой"
            tooltip="Важные потоки в состояниях degraded, stale, dead или silent. Они требуют проверки источника данных или ожидаемого состава."
            value={stats.importantProblems}
            tone={stats.importantProblems > 0 ? 'bad' : 'good'}
          />
          <StatCard label="Телеметрия/мин" tooltip="Количество MQTT-сообщений за минуту без $SYS и видеочанков. Видео оценивается отдельно по скорости трафика." value={stats.rate} />
          <StatCard label="Аптайм" tooltip="Время работы процесса mqtt-monitor с момента последнего запуска." value={formatUptime(snapshot.startedAt, snapshot.now)} />
        </section>

        {section === 'broker' && <BrokerOverview snapshot={snapshot} />}
        {section === 'topics' && <TopicExplorer snapshot={snapshot} onSnapshot={setSnapshot} />}
        {section === 'important' && <ImportantStreams snapshot={snapshot} />}
        {section === 'telegram' && <TelegramAlertsView snapshot={snapshot} />}

        <footer className="footer">
          <div>
            <CheckCircle2 size={15} />
            Подписки: # + $SYS/#
          </div>
          <div>{formatUptime(snapshot.startedAt, snapshot.now)}</div>
        </footer>
      </main>
    </div>
  );
}
