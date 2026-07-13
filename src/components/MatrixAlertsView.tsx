import { Bell, CheckCircle2, KeyRound, MessageSquareWarning, Server, ShieldAlert } from 'lucide-react';
import type { MonitorSnapshot } from '../types';

function ConfigRow({ label, ok, value }: { label: string; ok?: boolean; value: string }) {
  return (
    <div className="config-row">
      {ok === undefined ? <Server size={16} /> : ok ? <CheckCircle2 size={16} /> : <ShieldAlert size={16} />}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function MatrixAlertsView({ snapshot }: { snapshot: MonitorSnapshot }) {
  return (
    <section className="matrix-view">
      <div className="panel matrix-hero">
        <div>
          <span className="kicker">Matrix-алерты</span>
          <h2>Алерты остановки важных MQTT-потоков</h2>
          <p>
            Когда важный поток переходит в `dead`, монитор отправляет сообщение в Matrix. При восстановлении отправляется отдельное сообщение.
          </p>
        </div>
        <div className={snapshot.matrix.enabled ? 'matrix-state matrix-state--enabled' : 'matrix-state'}>
          <Bell size={20} />
          <span>{snapshot.matrix.enabled ? 'включено' : 'выключено'}</span>
        </div>
      </div>

      <section className="panel">
        <div className="panel__header">
          <div>
            <span className="kicker">Конфигурация</span>
            <h2>Настройки Matrix</h2>
          </div>
          <KeyRound size={18} />
        </div>
        <div className="config-list">
          <ConfigRow label="Сервер" value={snapshot.matrix.homeserver} />
          <ConfigRow label="MATRIX_ENABLED" ok={snapshot.matrix.enabled} value={snapshot.matrix.enabled ? 'true' : 'false'} />
          <ConfigRow label="MATRIX_ROOM_ID" ok={snapshot.matrix.roomConfigured} value={snapshot.matrix.roomConfigured ? 'задан' : 'не задан'} />
          <ConfigRow
            label="MATRIX_ACCESS_TOKEN"
            ok={snapshot.matrix.accessTokenConfigured}
            value={snapshot.matrix.accessTokenConfigured ? 'задан' : 'не задан'}
          />
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <span className="kicker">События</span>
            <h2>Последние алерты</h2>
          </div>
          <MessageSquareWarning size={18} />
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
      </section>
    </section>
  );
}
