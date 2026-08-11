import { InfoTooltip } from './InfoTooltip';

type StatCardProps = {
  label: string;
  tooltip?: string;
  value: string | number;
  tone?: 'neutral' | 'good' | 'bad' | 'warn';
};

export function StatCard({ label, tooltip, value, tone = 'neutral' }: StatCardProps) {
  return (
    <div className={`stat-card stat-card--${tone}`}>
      <div className="stat-card__label">
        <span>{label}</span>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <strong>{value}</strong>
    </div>
  );
}
