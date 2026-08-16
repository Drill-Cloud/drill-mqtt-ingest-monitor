import { RadioTower, ShieldCheck } from 'lucide-react';
import { ChannelPanels } from './components/ChannelPanels';
import { DashboardHeader } from './components/DashboardHeader';
import { DataFlow } from './components/DataFlow';
import { StatusOverview } from './components/StatusOverview';
import { useMonitor } from './use-monitor';

export function App() {
  const { snapshot, error } = useMonitor();

  if (!snapshot) {
    return (
      <main className="loading">
        <span className="loading__signal"><RadioTower /></span>
        <strong>Подключаем монитор</strong>
        <span>{error ?? 'Получаем состояние MQTT-шины…'}</span>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />
      <DashboardHeader timestamp={snapshot.timestamp} apiError={error} />
      <DataFlow snapshot={snapshot} />
      <StatusOverview snapshot={snapshot} />
      <ChannelPanels snapshot={snapshot} />
      <footer className="footer">
        <ShieldCheck />
        <span>Независимый MQTT-подписчик</span>
        <i />
        <span>QoS 0</span>
        <i />
        <span>Clean session</span>
        <i />
        <span>Payload не хранится</span>
      </footer>
    </main>
  );
}
