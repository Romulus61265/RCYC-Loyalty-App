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

/** Offset in minutes encoded in an ISO string ("+02:00" → 120); 0 for "Z". */
function offsetMinutes(iso: string): number {
  const m = /([+-])(\d{2}):(\d{2})$/.exec(iso);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

/**
 * "Today", "Tomorrow" or "Saturday 15 May", judged in the event's own
 * time-zone (a 20:30 dinner in Barcelona is "today" in Barcelona).
 */
export function relativeDay(iso: string, now: Date): string {
  const shift = offsetMinutes(iso) * 60_000;
  const today = new Date(now.getTime() + shift).toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + shift + 86_400_000).toISOString().slice(0, 10);
  const day = iso.slice(0, 10);
  if (day === today) return 'Today';
  if (day === tomorrow) return 'Tomorrow';
  return formatLongDate(iso);
}

/** The same local wall clock moved by some minutes, keeping the ISO string's own offset. */
export function addMinutes(iso: string, minutes: number): string {
  const offset = offsetMinutes(iso);
  const local = new Date(Date.parse(iso) + (offset + minutes) * 60_000).toISOString().slice(0, 19);
  const m = /([+-]\d{2}:\d{2}|Z)$/.exec(iso);
  return `${local}${m ? m[1] : 'Z'}`;
}

/** "UTC+2", "UTC−4", "UTC+5:30" from an ISO timestamp's offset. */
export function utcOffsetLabel(iso: string): string {
  const min = offsetMinutes(iso);
  if (min === 0) return 'UTC';
  const sign = min > 0 ? '+' : '−';
  const h = Math.floor(Math.abs(min) / 60);
  const m = Math.abs(min) % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

/** Hours between two ISO offsets: "6 h ahead of Miami" style comparisons. */
export function offsetDifferenceHours(iso: string, referenceIso: string): number {
  return (offsetMinutes(iso) - offsetMinutes(referenceIso)) / 60;
}
