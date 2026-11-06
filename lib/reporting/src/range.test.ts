/**
 * Tests for report date resolution.
 *
 * Run: pnpm --dir lib/reporting test
 * These lock the definitions of "today", "this month", "all time" etc. so a
 * refactor can never silently shift a published number.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveRange,
  rangeToInstants,
  zonedDateKey,
  startOfZonedDay,
  endOfZonedDay,
  addDaysToKey,
  daysBetweenKeys,
  eachKey,
  humanMinutes,
  percent,
  DEFAULT_LIBRARY_TZ,
} from "./range";

const TZ = DEFAULT_LIBRARY_TZ;

/** 2026-11-06 09:30 in Manila == 2026-11-06 01:30 UTC */
const NOW = new Date("2026-11-06T01:30:00.000Z");

test("zonedDateKey uses the library timezone, not UTC", () => {
  // 23:30 UTC on the 5th is already 07:30 on the 6th in Manila.
  assert.equal(zonedDateKey(new Date("2026-11-05T23:30:00.000Z"), TZ), "2026-11-06");
  // 16:30 UTC on the 6th is 00:30 on the 7th in Manila.
  assert.equal(zonedDateKey(new Date("2026-11-06T16:30:00.000Z"), TZ), "2026-11-07");
  // This is exactly the bug in RPT-10: toISOString() would say 2026-11-05 / 2026-11-06.
  assert.equal(new Date("2026-11-05T23:30:00.000Z").toISOString().slice(0, 10), "2026-11-05");
});

test("today resolves to one calendar day in local time", () => {
  const r = resolveRange({ kind: "today", now: NOW, tz: TZ });
  assert.equal(r.fromInclusive, "2026-11-06");
  assert.equal(r.toInclusive, "2026-11-06");
  assert.equal(r.days, 1);
  assert.equal(r.includesToday, true);
  assert.equal(r.timezone, TZ);
});

test("rangeToInstants covers the full local day, not the UTC day", () => {
  const r = resolveRange({ kind: "today", now: NOW, tz: TZ });
  const { from, to } = rangeToInstants(r);
  // Manila midnight (UTC+8) == 16:00 UTC the previous day.
  assert.equal(from.toISOString(), "2026-11-05T16:00:00.000Z");
  // Exclusive upper bound == next local midnight.
  assert.equal(to.toISOString(), "2026-11-06T16:00:00.000Z");
  assert.equal(startOfZonedDay(NOW, TZ).getTime(), from.getTime());
  assert.equal(endOfZonedDay(NOW, TZ).getTime(), to.getTime() - 1);
});

test("this_month starts on the 1st and runs to today", () => {
  const r = resolveRange({ kind: "this_month", now: NOW, tz: TZ });
  assert.equal(r.fromInclusive, "2026-11-01");
  assert.equal(r.toInclusive, "2026-11-06");
  assert.equal(r.days, 6);
  assert.match(r.label, /November 2026/);
});

test("last_month is the whole previous calendar month", () => {
  const r = resolveRange({ kind: "last_month", now: NOW, tz: TZ });
  assert.equal(r.fromInclusive, "2026-10-01");
  assert.equal(r.toInclusive, "2026-10-31");
  assert.equal(r.days, 31);
  assert.match(r.label, /October 2026/);
});

test("last_month handles January → December of the previous year", () => {
  const jan = new Date("2027-01-15T02:00:00.000Z");
  const r = resolveRange({ kind: "last_month", now: jan, tz: TZ });
  assert.equal(r.fromInclusive, "2026-12-01");
  assert.equal(r.toInclusive, "2026-12-31");
});

test("last_month handles February in a leap year", () => {
  const mar = new Date("2028-03-10T02:00:00.000Z");
  const r = resolveRange({ kind: "last_month", now: mar, tz: TZ });
  assert.equal(r.fromInclusive, "2028-02-01");
  assert.equal(r.toInclusive, "2028-02-29");
  assert.equal(r.days, 29);
});

test("this_week starts on Monday", () => {
  // 2026-11-06 is a Friday.
  const r = resolveRange({ kind: "this_week", now: NOW, tz: TZ });
  assert.equal(r.fromInclusive, "2026-11-02"); // Monday
  assert.equal(r.toInclusive, "2026-11-06");
  assert.equal(r.days, 5);
});

test("this_week on a Sunday returns that same Sunday as the only day", () => {
  const sunday = new Date("2026-11-08T04:00:00.000Z"); // 12:00 Manila, Sunday
  const r = resolveRange({ kind: "this_week", now: sunday, tz: TZ });
  assert.equal(r.fromInclusive, "2026-11-02");
  assert.equal(r.toInclusive, "2026-11-08");
  assert.equal(r.days, 7);
});

test("rolling windows are 7 and 30 days inclusive, and say so", () => {
  const s = resolveRange({ kind: "last_7_days", now: NOW, tz: TZ });
  assert.equal(s.days, 7);
  assert.equal(s.fromInclusive, "2026-10-31");
  assert.match(s.label, /Last 7 days/);

  const l = resolveRange({ kind: "last_30_days", now: NOW, tz: TZ });
  assert.equal(l.days, 30);
  assert.equal(l.fromInclusive, "2026-10-08");
});

test("custom range is inclusive of both end dates", () => {
  const a = resolveRange({ kind: "custom", from: "2026-06-01", to: "2026-10-31", now: NOW, tz: TZ });
  assert.equal(a.days, 153);
  assert.equal(a.includesToday, false);
  assert.deepEqual([a.fromInclusive, a.toInclusive], ["2026-06-01", "2026-10-31"]);
});

test("custom range rejects a reversed window instead of silently swapping it", () => {
  // Reporting a window the user did not ask for is worse than an error.
  assert.throws(
    () => resolveRange({ kind: "custom", from: "2026-10-31", to: "2026-06-01", now: NOW, tz: TZ }),
    /Invalid date range/,
  );
});

test("custom range rejects malformed dates", () => {
  assert.throws(() => resolveRange({ kind: "custom", from: "06/01/2026", to: "2026-10-31", now: NOW, tz: TZ }));
  assert.throws(() => resolveRange({ kind: "custom", from: "2026-06-01", now: NOW, tz: TZ }));
});

test("a named term keeps the name AND the resolved dates", () => {
  const r = resolveRange({
    kind: "custom",
    from: "2026-06-15",
    to: "2026-10-31",
    label: "1st Semester AY 2026-2027",
    now: NOW,
    tz: TZ,
  });
  assert.equal(r.label, "1st Semester AY 2026-2027 (15 Jun 2026 – 31 Oct 2026)");
});

test("all time starts at the first record when known", () => {
  const r = resolveRange({ kind: "all", firstRecordKey: "2025-06-02", now: NOW, tz: TZ });
  assert.equal(r.fromInclusive, "2025-06-02");
  assert.match(r.label, /All recorded data/);
});

test("calendar helpers agree with each other", () => {
  assert.equal(addDaysToKey("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysToKey("2026-03-01", -1), "2026-02-28");
  assert.equal(addDaysToKey("2028-03-01", -1), "2028-02-29");
  assert.equal(daysBetweenKeys("2026-11-01", "2026-11-30"), 30);
  assert.equal(daysBetweenKeys("2026-11-06", "2026-11-06"), 1);
  assert.deepEqual(eachKey("2026-11-03", "2026-11-05"), ["2026-11-03", "2026-11-04", "2026-11-05"]);
  assert.deepEqual(eachKey("2026-11-05", "2026-11-03"), []);
});

test("every resolved period produces a non-empty, ordered window", () => {
  const kinds = [
    "today", "yesterday", "this_week", "last_7_days", "last_30_days",
    "this_month", "last_month", "this_year", "all",
  ] as const;
  for (const kind of kinds) {
    const r = resolveRange({ kind, now: NOW, tz: TZ, firstRecordKey: "2025-01-01" });
    assert.ok(r.fromInclusive <= r.toInclusive, `${kind} is inverted`);
    assert.ok(r.days >= 1, `${kind} has no days`);
    assert.ok(r.label.length > 0, `${kind} has no label`);
    assert.equal(
      daysBetweenKeys(r.fromInclusive, r.toInclusive),
      r.days,
      `${kind} day count disagrees with its bounds`,
    );
  }
});

test("daylight-saving zones still yield whole local days", () => {
  // Manila has no DST, so also check a zone that does: New York, 1 Nov 2026 (fall back).
  const ny = "America/New_York";
  const now = new Date("2026-11-01T17:00:00.000Z"); // 13:00 EDT
  const r = resolveRange({ kind: "today", now, tz: ny });
  assert.equal(r.fromInclusive, "2026-11-01");
  const { from, to } = rangeToInstants(r);
  const spanHours = (to.getTime() - from.getTime()) / 3_600_000;
  assert.equal(spanHours, 25, "the fall-back day should be 25 hours long");
});

test("formatting helpers", () => {
  assert.equal(humanMinutes(0), "0m");
  assert.equal(humanMinutes(8), "8m");
  assert.equal(humanMinutes(95), "1h 35m");
  assert.equal(humanMinutes(null), "0m");
  assert.equal(percent(1, 4), "25.0%");
  assert.equal(percent(5, 0), "—");
});
