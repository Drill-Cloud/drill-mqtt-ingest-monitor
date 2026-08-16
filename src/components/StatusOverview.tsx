import { Activity, Gauge, RadioTower, Wifi, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import type { MonitorSnapshot } from '../../shared/types';
import { formatAge, formatBytes, formatRate } from '../format';
import { brokerLabel, stateLabel } from '../presentation';
import { InfoHint } from './InfoHint';

export function StatusOverview({ snapshot }: { snapshot: MonitorSnapshot }) {
  const now = snapshot.timestamp;

  return (
    <section className="status-grid" aria-label="Ключевые показатели">
      <StatusCard
        tone={snapshot.broker.connected ? 'active' : 'danger'}
        icon={snapshot.broker.connected ? <Wifi /> : <WifiOff />}
        label="Брокер"
        value={brokerLabel(snapshot.broker.connected)}
        detail={snapshot.broker.error ?? snapshot.broker.address}
        hint="Показывает, установлено ли MQTT-соединение с настроенным брокером."
      />
      <StatusCard
        tone={snapshot.bus.state}
        icon={<Activity />}
        label="Поток данных"
        value={stateLabel[snapshot.bus.state]}
        detail={snapshot.bus.lastMessageAt ? `Последнее сообщение ${formatAge(snapshot.bus.lastMessageAt, now)}` : 'Сообщений ещё не было'}
        hint={`Поток активен, если хотя бы один прикладной топик получил сообщение за последние ${Math.round(snapshot.silenceMs / 1_000)} секунд.`}
      />
      <StatusCard
        icon={<RadioTower />}
        label="Топики с данными"
        value={String(snapshot.bus.activeTopicCount)}
        detail={formatRate(snapshot.bus.messagesPerMinute)}
        hint="Количество топиков, в которых недавно появились публикации. Служебные топики не учитываются."
      />
      <StatusCard
        icon={<Gauge />}
        label="Трафик за минуту"
        value={formatBytes(snapshot.bus.bytesPerMinute)}
        detail="Суммарный объём MQTT payload"
        hint="Объём данных, увиденный монитором за скользящее окно в одну минуту. Payload не сохраняется."
      />
    </section>
  );
}

type StatusCardProps = {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  hint: string;
  tone?: 'active' | 'danger' | 'silent' | 'waiting';
};

function StatusCard({ icon, label, value, detail, hint, tone }: StatusCardProps) {
  return (
    <article className={`status-card ${tone ? `status-card--${tone}` : ''}`}>
      <div className="status-card__top"><span className="status-card__icon">{icon}</span><InfoHint text={hint} /></div>
      <div className="status-card__body"><span>{label}</span><strong>{value}</strong><small title={detail}>{detail}</small></div>
      <span className="status-card__glow" />
    </article>
  );
}
