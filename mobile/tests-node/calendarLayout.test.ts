// Run: node --experimental-strip-types --test tests-node/calendarLayout.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { daysBetween, seriesStartForMove, monthGrid, monthGridRange, startOfWeek, layoutDay, groupByDay, heatLevel, dayKey, addMonths } from "../src/lib/calendarLayout.ts";

const ev = (id: string, start: string, end: string | null = null, all_day = false) => ({
  occurrence_id: id, starts_at: new Date(start).toISOString(), ends_at: end ? new Date(end).toISOString() : null, all_day,
});

test("weeks start on Monday", () => {
  assert.equal(dayKey(startOfWeek(new Date(2026, 10, 1))), "2026-10-26"); // Sunday 1 Nov 2026 -> Mon 26 Oct
  assert.equal(dayKey(startOfWeek(new Date(2026, 10, 2))), "2026-11-02"); // Monday stays
});

test("month grid: Nov 2026 is 6 Mon-Sun weeks from 26 Oct to 6 Dec (30 Nov is a Monday)", () => {
  const g = monthGrid(new Date(2026, 10, 15));
  assert.equal(g.length, 6);
  assert.equal(dayKey(g[0][0]), "2026-10-26");
  assert.equal(dayKey(g[5][6]), "2026-12-06");
  assert.ok(g.every((w) => w.length === 7));
});

test("month grid: months that need 6 rows, and Feb that fits 4", () => {
  assert.equal(monthGrid(new Date(2026, 7, 1)).length, 6); // Aug 2026 starts Saturday
  assert.equal(monthGrid(new Date(2026, 9, 1)).length, 5); // Oct 2026 starts Thursday
  assert.equal(monthGrid(new Date(2027, 1, 1)).length, 4); // Feb 2027 starts Monday, 28 days
});

test("month grid covers every day exactly once, across year boundaries", () => {
  for (const m of [new Date(2026, 11, 1), new Date(2027, 0, 1), new Date(2028, 1, 1)]) {
    const days = monthGrid(m).flat().map(dayKey);
    assert.equal(new Set(days).size, days.length);
    const inMonth = days.filter((d) => d.startsWith(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`));
    assert.equal(inMonth.length, new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate());
  }
});

test("grid range is [first cell, day after last cell)", () => {
  const r = monthGridRange(new Date(2026, 10, 1));
  assert.equal(dayKey(r.start), "2026-10-26");
  assert.equal(dayKey(r.end), "2026-12-07");
});

test("addMonths wraps years", () => {
  assert.equal(dayKey(addMonths(new Date(2026, 11, 15), 1)), "2027-01-01");
  assert.equal(dayKey(addMonths(new Date(2026, 0, 31), -1)), "2025-12-01");
});

test("timeline: non-overlapping events get a full-width column", () => {
  const day = new Date(2026, 10, 5);
  const blocks = layoutDay([ev("a", "2026-11-05T09:00", "2026-11-05T10:00"), ev("b", "2026-11-05T11:00", "2026-11-05T12:30")], day);
  assert.deepEqual(blocks.map((b) => [b.startMin, b.endMin, b.column, b.columns]), [[540, 600, 0, 1], [660, 750, 0, 1]]);
});

test("timeline: overlapping events split into columns; later free event reuses column 0", () => {
  const day = new Date(2026, 10, 5);
  const blocks = layoutDay([
    ev("a", "2026-11-05T09:00", "2026-11-05T11:00"),
    ev("b", "2026-11-05T10:00", "2026-11-05T10:30"),
    ev("c", "2026-11-05T10:15", "2026-11-05T11:30"),
    ev("d", "2026-11-05T14:00", "2026-11-05T15:00"),
  ], day);
  const by = Object.fromEntries(blocks.map((b) => [b.event.occurrence_id, b]));
  assert.deepEqual([by.a.column, by.b.column, by.c.column], [0, 1, 2]);
  assert.ok([by.a, by.b, by.c].every((b) => b.columns === 3));
  assert.deepEqual([by.d.column, by.d.columns], [0, 1]);
});

test("timeline: touching events (end == next start) do not overlap", () => {
  const blocks = layoutDay([ev("a", "2026-11-05T09:00", "2026-11-05T10:00"), ev("b", "2026-11-05T10:00", "2026-11-05T11:00")], new Date(2026, 10, 5));
  assert.deepEqual(blocks.map((b) => [b.column, b.columns]), [[0, 1], [0, 1]]);
});

test("timeline: zero-length / missing-end events get a 30 minute block; all-day excluded", () => {
  const blocks = layoutDay([ev("a", "2026-11-05T09:00"), ev("b", "2026-11-05T00:00", null, true)], new Date(2026, 10, 5));
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].endMin - blocks[0].startMin, 30);
});

test("timeline: late-night event is clamped inside the day", () => {
  const [b] = layoutDay([ev("a", "2026-11-05T23:50", "2026-11-06T01:00")], new Date(2026, 10, 5));
  assert.equal(b.endMin, 1440);
  assert.ok(b.endMin - b.startMin >= 30 && b.startMin <= 1410);
});

test("groupByDay buckets by local day, all-day first then by time", () => {
  const m = groupByDay([ev("late", "2026-11-05T15:00"), ev("ad", "2026-11-05T00:00", null, true), ev("early", "2026-11-05T08:00"), ev("next", "2026-11-06T09:00")]);
  assert.deepEqual(m.get("2026-11-05")!.map((e) => e.occurrence_id), ["ad", "early", "late"]);
  assert.equal(m.get("2026-11-06")!.length, 1);
});

test("heat levels", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 6, 7, 20].map(heatLevel), [0, 1, 2, 2, 3, 3, 4, 4]);
});

test("daysBetween counts calendar days, across DST and year ends", () => {
  assert.equal(daysBetween(new Date(2026, 9, 25, 23, 0), new Date(2026, 9, 26, 1, 0)), 1); // across the Oct DST change
  assert.equal(daysBetween(new Date(2026, 11, 31), new Date(2027, 0, 2)), 2);
  assert.equal(daysBetween(new Date(2026, 10, 5), new Date(2026, 10, 3)), -2);
  assert.equal(daysBetween(new Date(2026, 10, 5, 9), new Date(2026, 10, 5, 23)), 0);
});

test("moving a single event keeps its time of day", () => {
  const occ = new Date(2026, 10, 5, 15, 30).toISOString();
  const moved = new Date(seriesStartForMove(occ, occ, new Date(2026, 10, 9)));
  assert.deepEqual([moved.getDate(), moved.getHours(), moved.getMinutes()], [9, 15, 30]);
});

test("moving one occurrence of a weekly series shifts the whole series by the same days", () => {
  const series = new Date(2026, 10, 2, 18, 0).toISOString(); // Mon 2 Nov
  const occ = new Date(2026, 10, 16, 18, 0).toISOString();   // the 16 Nov occurrence, dragged to the 17th
  const moved = new Date(seriesStartForMove(occ, series, new Date(2026, 10, 17)));
  assert.deepEqual([moved.getMonth(), moved.getDate(), moved.getHours()], [10, 3, 18]); // series now starts Tue 3 Nov, still 18:00
});

test("moving across a DST change keeps the wall-clock hour", () => {
  const occ = new Date(2026, 9, 24, 9, 0).toISOString(); // before EU DST ends (25 Oct)
  const moved = new Date(seriesStartForMove(occ, occ, new Date(2026, 9, 27)));
  assert.equal(moved.getHours(), 9);
});
