// Shared helpers for "pick specific days" range selection (Bio, Capital).
// Dates are handled as local calendar days ("YYYY-MM-DD") so a picked day
// always means that day on the user's calendar, whatever the timezone.

export function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Days in [from, to], inclusive. */
export function inclusiveDays(from: Date, to: Date): number {
  return Math.max(1, Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000) + 1);
}

/** "12 Oct" for one day, "12 Oct – 18 Oct" for a range. */
export function formatRange(from: Date, to: Date): string {
  const f = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return localDay(from) === localDay(to) ? f(from) : `${f(from)} – ${f(to)}`;
}

/** Keep items whose date field falls on a day within [fromStr, toStr]. */
export function filterByRange<T>(items: T[] | undefined, fromStr: string, toStr: string, dateKey: keyof T): T[] {
  if (!items) return [];
  return items.filter((it) => {
    const raw = it[dateKey];
    if (typeof raw !== "string") return false;
    const day = raw.slice(0, 10);
    return day >= fromStr && day <= toStr;
  });
}
