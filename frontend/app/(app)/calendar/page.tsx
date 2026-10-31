"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2, MapPin, Repeat, Link2, Pencil, X } from "lucide-react";
import {
  CalendarOccurrence,
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvents,
  getCalendarFeedUrl,
  updateCalendarEvent,
} from "../../../utils/api";

const REPEATS = ["none", "daily", "weekly", "monthly", "yearly"];
const REMINDERS: { label: string; minutes: number[] }[] = [
  { label: "No reminder", minutes: [] },
  { label: "30 minutes before", minutes: [30] },
  { label: "1 hour before", minutes: [60] },
  { label: "1 day before", minutes: [1440] },
];

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm".
function toLocalInput(d: Date) {
  return `${dayKey(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function defaultStart() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toLocalInput(d);
}

export default function CalendarPage() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [events, setEvents] = useState<CalendarOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [start, setStart] = useState(defaultStart);
  const [repeat, setRepeat] = useState("none");
  const [reminder, setReminder] = useState(1);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<CalendarOccurrence | null>(null);
  const [feedUrl, setFeedUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const end = new Date(month.getFullYear(), month.getMonth() + 1, 1);
      setEvents(await getCalendarEvents(month.toISOString(), end.toISOString()));
    } catch (e: any) {
      setError(e?.message || "Could not load calendar");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarOccurrence[]>();
    for (const ev of events) {
      const key = dayKey(new Date(ev.starts_at));
      map.set(key, [...(map.get(key) ?? []), ev]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [events]);

  const startEdit = (ev: CalendarOccurrence) => {
    setEditing(ev);
    setTitle(ev.title);
    setLocation(ev.location ?? "");
    setStart(toLocalInput(new Date(ev.starts_at)));
    setRepeat(ev.recurrence);
    const idx = REMINDERS.findIndex((r) => r.minutes[0] === ev.reminder_offsets[0]);
    setReminder(ev.reminder_offsets.length === 0 ? 0 : idx >= 0 ? idx : 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditing(null);
    setTitle("");
    setLocation("");
    setStart(defaultStart());
    setRepeat("none");
    setReminder(1);
  };

  const showFeed = async (rotate: boolean) => {
    if (rotate && !window.confirm("Reset the link? Calendars subscribed to the old link will stop updating.")) return;
    try {
      setFeedUrl(await getCalendarFeedUrl(rotate));
    } catch (err: any) {
      setError(err?.message || "Could not get the calendar link");
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        // Editing a repeating event moves the whole series by the same amount.
        const shiftMs = new Date(start).getTime() - new Date(editing.starts_at).getTime();
        const initialReminder = editing.reminder_offsets.length === 0 ? 0 : REMINDERS.findIndex((r) => r.minutes[0] === editing.reminder_offsets[0]);
        await updateCalendarEvent(editing.id, {
          title: title.trim(),
          recurrence: repeat,
          location: location.trim() || null,
          ...(shiftMs !== 0 ? { starts_at: new Date(new Date(editing.series_starts_at).getTime() + shiftMs).toISOString() } : {}),
          // Leave custom reminders (e.g. a bill's "9am the day before") alone unless changed.
          ...(reminder !== initialReminder && !(initialReminder < 0 && reminder === 1) ? { reminder_offsets: REMINDERS[reminder].minutes } : {}),
        });
        cancelEdit();
      } else {
        await createCalendarEvent({
          title: title.trim(),
          starts_at: new Date(start).toISOString(),
          recurrence: repeat,
          location: location.trim() || null,
          reminder_offsets: REMINDERS[reminder].minutes,
        });
        setTitle("");
        setLocation("");
        setStart(defaultStart());
      }
      await load();
    } catch (err: any) {
      setError(err?.message || "Could not save event");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (ev: CalendarOccurrence) => {
    const msg = ev.recurrence !== "none" ? `Delete "${ev.title}" and all its repeats?` : `Delete "${ev.title}"?`;
    if (!window.confirm(msg)) return;
    try {
      await deleteCalendarEvent(ev.id);
      await load();
    } catch (err: any) {
      setError(err?.message || "Could not delete event");
    }
  };

  const shift = (delta: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  const todayKey = dayKey(new Date());

  return (
    <div className="space-y-5">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <CalendarDays size={20} />
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Calendar</h1>
        <button onClick={() => showFeed(false)} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "6px 10px", color: "inherit", cursor: "pointer" }}>
          <Link2 size={14} /> Subscribe
        </button>
      </div>
      {feedUrl && (
        <div className="card-surface" style={{ borderRadius: "var(--radius-lg)", padding: 12, display: "grid", gap: 8 }}>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Add this link as a subscription calendar (Apple: File → New Calendar Subscription; Google: Other calendars → From URL).
            Anyone with the link can see your events.
          </div>
          <input readOnly value={feedUrl} onFocus={(e) => e.currentTarget.select()} aria-label="Calendar feed URL"
            style={{ padding: 8, borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--surface-secondary)", color: "inherit", fontFamily: "var(--font-mono)", fontSize: 12 }} />
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={() => navigator.clipboard?.writeText(feedUrl)} style={{ background: "none", border: 0, color: "var(--accent-trends)", cursor: "pointer" }}>Copy</button>
            <button onClick={() => showFeed(true)} style={{ background: "none", border: 0, color: "var(--status-critical, #dc2626)", cursor: "pointer" }}>Reset link</button>
            <button onClick={() => setFeedUrl(null)} style={{ background: "none", border: 0, color: "var(--text-secondary)", cursor: "pointer" }}>Hide</button>
          </div>
        </div>
      )}

      <form onSubmit={add} className="card-surface" style={{ borderRadius: "var(--radius-xl)", padding: 16, display: "grid", gap: 10 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New event title"
          aria-label="Event title"
          required
          style={{ padding: 10, borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--surface-secondary)", color: "inherit" }}
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start" required
            style={{ padding: 10, borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--surface-secondary)", color: "inherit" }} />
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (optional)" aria-label="Location"
            style={{ padding: 10, borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--surface-secondary)", color: "inherit" }} />
          <select value={repeat} onChange={(e) => setRepeat(e.target.value)} aria-label="Repeats"
            style={{ padding: 10, borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--surface-secondary)", color: "inherit" }}>
            {REPEATS.map((r) => <option key={r} value={r}>{r === "none" ? "Does not repeat" : `Repeats ${r}`}</option>)}
          </select>
          <select value={reminder} onChange={(e) => setReminder(Number(e.target.value))} aria-label="Reminder"
            style={{ padding: 10, borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--surface-secondary)", color: "inherit" }}>
            {REMINDERS.map((r, i) => <option key={r.label} value={i}>{r.label}</option>)}
          </select>
        </div>
        <button type="submit" disabled={saving || !title.trim()}
          style={{ justifySelf: "start", display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 8, background: "var(--accent-trends)", color: "#fff", border: 0, opacity: saving ? 0.6 : 1, cursor: "pointer" }}>
          <Plus size={16} /> {saving ? "Saving…" : editing ? "Save changes" : "Add event"}
        </button>
        {editing && (
          <button type="button" onClick={cancelEdit} style={{ justifySelf: "start", display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: 0, color: "var(--text-secondary)", cursor: "pointer" }}>
            <X size={14} /> Cancel editing
          </button>
        )}
      </form>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={() => shift(-1)} aria-label="Previous month" style={{ background: "none", border: 0, color: "inherit", cursor: "pointer" }}><ChevronLeft size={20} /></button>
        <strong>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong>
        <button onClick={() => shift(1)} aria-label="Next month" style={{ background: "none", border: 0, color: "inherit", cursor: "pointer" }}><ChevronRight size={20} /></button>
      </div>

      {error && <div role="alert" style={{ color: "var(--status-critical, #dc2626)" }}>{error}</div>}

      {loading ? (
        <div className="card-surface animate-pulse" style={{ borderRadius: "var(--radius-xl)", height: 160, background: "var(--surface-secondary)" }} />
      ) : byDay.length === 0 ? (
        <div className="card-surface" style={{ borderRadius: "var(--radius-xl)", padding: 24, textAlign: "center", color: "var(--text-secondary)" }}>
          Nothing scheduled this month.
        </div>
      ) : (
        byDay.map(([key, items]) => (
          <section key={key}>
            <h2 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, color: key === todayKey ? "var(--accent-trends)" : "var(--text-secondary)" }}>
              {key === todayKey ? "Today · " : ""}
              {new Date(items[0].starts_at).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}
            </h2>
            <div style={{ display: "grid", gap: 8 }}>
              {items.map((ev) => (
                <div key={ev.occurrence_id} className="card-surface" style={{ borderRadius: "var(--radius-lg)", padding: 12, display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>{ev.title}</div>
                    <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                      {ev.all_day ? "All day" : new Date(ev.starts_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      {ev.origin !== "user" ? ` · ${({ goal: "goal deadline", rsu: "RSU vest", subscription: "subscription", dividend: "dividend" } as Record<string, string>)[ev.origin]}` : ""}
                    </div>
                    {ev.location && <div style={{ fontSize: 12, color: "var(--text-tertiary)", display: "flex", gap: 4, alignItems: "center" }}><MapPin size={12} />{ev.location}</div>}
                    {ev.recurrence !== "none" && <div style={{ fontSize: 12, color: "var(--text-tertiary)", display: "flex", gap: 4, alignItems: "center" }}><Repeat size={12} />{ev.recurrence}</div>}
                  </div>
                  {ev.origin === "user" && (
                    <button onClick={() => startEdit(ev)} aria-label={`Edit ${ev.title}`} style={{ background: "none", border: 0, color: "var(--text-tertiary)", cursor: "pointer" }}>
                      <Pencil size={16} />
                    </button>
                  )}
                  {ev.origin === "user" && (
                    <button onClick={() => remove(ev)} aria-label={`Delete ${ev.title}`} style={{ background: "none", border: 0, color: "var(--text-tertiary)", cursor: "pointer" }}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
