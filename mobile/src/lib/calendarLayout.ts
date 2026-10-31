// Pure calendar layout helpers (no React / RN imports so they can be unit-tested
// with plain Node). Weeks start on Monday.

export interface LayoutEvent {
  occurrence_id: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function isSameDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b);
}

/** Monday of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const mondayBased = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(startOfDay(d), -mondayBased);
}

/** Weeks (arrays of 7 days, Mon–Sun) covering the month of `anchor`, padded with neighbouring days. */
export function monthGrid(anchor: Date): Date[][] {
  const first = startOfMonth(anchor);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const weeks: Date[][] = [];
  let cursor = startOfWeek(first);
  while (cursor <= last) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)));
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

/** The [start, end) window to fetch so every visible grid cell has its events. */
export function monthGridRange(anchor: Date): { start: Date; end: Date } {
  const weeks = monthGrid(anchor);
  return { start: weeks[0][0], end: addDays(weeks[weeks.length - 1][6], 1) };
}

export function groupByDay<T extends LayoutEvent>(events: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const ev of events) {
    const k = dayKey(new Date(ev.starts_at));
    const list = map.get(k);
    if (list) list.push(ev);
    else map.set(k, [ev]);
  }
  for (const list of map.values()) {
    list.sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.starts_at.localeCompare(b.starts_at));
  }
  return map;
}

export interface TimelineBlock<T> {
  event: T;
  startMin: number; // minutes from 00:00, clamped to the day
  endMin: number;
  column: number;
  columns: number; // total columns in this block's overlap cluster
}

export const MIN_BLOCK_MINUTES = 30; // a 0-length or short event still gets a tappable block

/** Position timed events on a 24h axis; overlapping events share the width in columns. */
export function layoutDay<T extends LayoutEvent>(events: T[], day: Date): TimelineBlock<T>[] {
  const dayStart = startOfDay(day).getTime();
  const items = events
    .filter((e) => !e.all_day)
    .map((event) => {
      const s = (new Date(event.starts_at).getTime() - dayStart) / 60000;
      const e = event.ends_at ? (new Date(event.ends_at).getTime() - dayStart) / 60000 : s;
      const startMin = Math.max(0, Math.min(24 * 60 - MIN_BLOCK_MINUTES, s));
      const endMin = Math.min(24 * 60, Math.max(e, startMin + MIN_BLOCK_MINUTES));
      return { event, startMin, endMin };
    })
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const out: TimelineBlock<T>[] = [];
  let cluster: typeof items = [];
  let clusterEnd = -1;
  const flush = () => {
    if (!cluster.length) return;
    const colEnds: number[] = []; // end minute of the last block in each column
    const placed = cluster.map((it) => {
      let col = colEnds.findIndex((end) => end <= it.startMin);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(it.endMin);
      } else colEnds[col] = it.endMin;
      return { ...it, column: col };
    });
    for (const p of placed) out.push({ event: p.event, startMin: p.startMin, endMin: p.endMin, column: p.column, columns: colEnds.length });
    cluster = [];
    clusterEnd = -1;
  };
  for (const it of items) {
    if (cluster.length && it.startMin >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.endMin);
  }
  flush();
  return out;
}

/** 0 (none) … 4 (busy) — drives the Year view's heat tint. */
export function heatLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

/** Whole calendar days from a to b (DST-safe: compares dates, not 24h blocks). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}

/** ISO of `iso` moved `deltaDays` calendar days, keeping its local wall-clock time. */
export function shiftIsoByDays(iso: string, deltaDays: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString();
}

/**
 * New `starts_at` for the event's SERIES when one occurrence is dragged to `targetDay`.
 * The occurrence keeps its time of day; a repeating series moves by the same number of days.
 */
export function seriesStartForMove(occurrenceStartIso: string, seriesStartIso: string, targetDay: Date): string {
  return shiftIsoByDays(seriesStartIso, daysBetween(new Date(occurrenceStartIso), targetDay));
}
