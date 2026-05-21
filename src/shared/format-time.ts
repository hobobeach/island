const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/**
 * "5 minutes ago", "2 days ago", "just now". Stays in the past tense when the
 * given date is in the past (which is the usual case for created-at timestamps).
 */
export function formatRelative(date: Date, now: Date = new Date()): string {
  const diffMs = date.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const round = (v: number): number => Math.round(v);

  if (abs < 60_000) return RTF.format(round(diffMs / 1000), 'second');
  if (abs < 3_600_000) return RTF.format(round(diffMs / 60_000), 'minute');
  if (abs < 86_400_000) return RTF.format(round(diffMs / 3_600_000), 'hour');
  if (abs < 86_400_000 * 30) return RTF.format(round(diffMs / 86_400_000), 'day');
  if (abs < 86_400_000 * 365) return RTF.format(round(diffMs / (86_400_000 * 30)), 'month');
  return RTF.format(round(diffMs / (86_400_000 * 365)), 'year');
}
