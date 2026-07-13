import { Bell, ShieldAlert } from 'lucide-react';
import type { MonitorSnapshot } from '../types';

export function AlertsPanel({ snapshot }: { snapshot: MonitorSnapshot }) {
  return (
    <aside className="panel">
      <div className="panel__header">
        <div>
          <span className="kicker">Matrix</span>
          <h2>Алерты</h2>
        </div>
        <Bell size={18} />
      </div>
      {snapshot.alerts.length === 0 ? (
        <div className="empty-panel empty-panel--small">Алертов пока нет.</div>
      ) : (
        <div className="alert-list">
          {snapshot.alerts.map((alert) => (
            <article className="alert-item" key={alert.id}>
              <ShieldAlert size={16} />
              <div>
                <strong>{alert.message}</strong>
                <span>{new Date(alert.createdAt).toLocaleString('ru-RU')}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </aside>
  );
}
