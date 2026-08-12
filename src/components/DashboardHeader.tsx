import { Activity, ShieldCheck } from 'lucide-react';

type DashboardHeaderProps = {
  timestamp: string;
  apiError: string | null;
};

export function DashboardHeader({ timestamp, apiError }: DashboardHeaderProps) {
  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">D</span>
          <div>
            <strong>Drill Cloud</strong>
            <small>MQTT Monitor</small>
          </div>
        </div>

        <div className="live-status">
          <span className={apiError ? 'live-status__dot live-status__dot--warning' : 'live-status__dot'} />
          <span>{apiError ?? 'Данные обновляются в реальном времени'}</span>
          <time>{new Date(timestamp).toLocaleTimeString('ru-RU')}</time>
        </div>
      </header>

      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow"><Activity /> Наблюдение за потоком данных</p>
          <h1>MQTT-шина <span>в реальном времени</span></h1>
          <p>Единый экран состояния брокера, активных топиков и важных каналов Drill Cloud.</p>
        </div>
        <div className="readonly">
          <span className="readonly__icon"><ShieldCheck /></span>
          <span><strong>Read only</strong></span>
        </div>
      </section>
    </>
  );
}
