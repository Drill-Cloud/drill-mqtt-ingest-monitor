type StatCardProps = {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'good' | 'bad' | 'warn';
};

export function StatCard({ label, value, tone = 'neutral' }: StatCardProps) {
  return (
    <div className={`stat-card stat-card--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
