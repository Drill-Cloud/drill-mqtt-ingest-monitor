export function formatAge(value: string | null, now: string): string {
  if (!value) {
    return 'не было';
  }

  const seconds = Math.max(0, Math.round((Date.parse(now) - Date.parse(value)) / 1000));

  if (seconds < 60) {
    return `${seconds} c назад`;
  }

  return `${Math.floor(seconds / 60)} мин назад`;
}

export function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  if (value < 1024 * 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }

  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function formatUptime(startedAt: string, now: string): string {
  const seconds = Math.max(0, Math.round((Date.parse(now) - Date.parse(startedAt)) / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours} ч ${minutes % 60} мин`;
  }

  return `${minutes} мин`;
}
