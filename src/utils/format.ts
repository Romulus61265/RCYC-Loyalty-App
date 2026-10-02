/**
 * Formatting that respects *local port time*. Timestamps carry their own
 * offset, so we read wall-clock values directly from the ISO string rather
 * than converting into the device's time-zone (a guest in London should see
 * "20:30" for a dinner in Barcelona, not "19:30").
 */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parts(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, weekday };
}

export function formatTime(iso: string): string {
  return iso.slice(11, 16);
}

/** "Saturday 17 October" */
export function formatLongDate(iso: string): string {
  const { m, d, weekday } = parts(iso);
  return `${WEEKDAYS[weekday]} ${d} ${MONTHS[m - 1]}`;
}

/** "17 Oct" */
export function formatShortDate(iso: string): string {
  const { m, d } = parts(iso);
  return `${d} ${MONTHS[m - 1]!.slice(0, 3)}`;
}

/** "17 – 24 October 2026" */
export function formatDateRange(startIso: string, endIso: string): string {
  const a = parts(startIso);
  const b = parts(endIso);
  if (a.m === b.m && a.y === b.y) return `${a.d} – ${b.d} ${MONTHS[a.m - 1]} ${a.y}`;
  return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
}

export function daysUntil(targetIso: string, now: Date): number {
  return Math.max(0, Math.floor((Date.parse(targetIso) - now.getTime()) / 86_400_000));
}

/** Time-of-day greeting in the guest's current local time. */
export function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function formatMoney(amountMinor: number, currency: string): string {
  const symbol = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency === 'USD' ? '$' : `${currency} `;
  return `${symbol}${Math.round(amountMinor / 100).toLocaleString('en-GB')}`;
}
