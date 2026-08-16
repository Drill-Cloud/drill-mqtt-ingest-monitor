export function formatAge(value: string, now: string): string {
  const seconds = Math.max(0, Math.round((Date.parse(now) - Date.parse(value)) / 1_000));
  if (seconds < 2) return 'только что';
  if (seconds < 60) return `${seconds} с назад`;
  return `${Math.floor(seconds / 60)} мин назад`;
}

export function formatBytes(value: number): string {
  if (value < 1_024) return `${value} Б`;
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} КБ`;
  return `${(value / 1_048_576).toFixed(1)} МБ`;
}

export function formatRate(value: number): string {
  return `${value.toLocaleString('ru-RU')} сообщ./мин`;
}

export function formatBrokerAddress(value: string): string {
  try {
    const address = new URL(value);
    return address.host;
  } catch {
    return value;
  }
}
