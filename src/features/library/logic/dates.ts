/** Local calendar date as YYYY-MM-DD (session dates are stored in the user's local day). */
export function localISODate(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today", "Tomorrow", "Yesterday" or "12 Nov" (adds the year when it differs). */
export function friendlyDate(iso: string, today: string): string {
  if (iso === today) return 'Today';
  const toUtc = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  const diff = Math.round((toUtc(iso) - toUtc(today)) / 86_400_000);
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const label = `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1] ?? ''}`;
  return iso.slice(0, 4) === today.slice(0, 4) ? label : `${label} ${iso.slice(0, 4)}`;
}
