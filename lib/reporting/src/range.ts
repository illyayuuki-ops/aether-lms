/**
 * Report date resolution — ONE definition of "which period am I looking at".
 *
 * Why this file exists (see docs/reporting-gaps.md, RPT-01 / RPT-10):
 *   The old screens treated "School Year" and "Semester" as labels on an export
 *   title while filtering by a single calendar day, and bucketed days in UTC.
 *   Every report must resolve its range here so two tables in the same paper can
 *   never disagree about what "1st Semester" means.
 *
 * Rules:
 *   - Periods are CALENDAR periods, not rolling windows, unless the label says
 *     "last N days". ("This month" = the 1st to today. "Last month" = 1st to last day.)
 *   - All day boundaries are computed in the LIBRARY timezone, not the browser's
 *     and not UTC. Default Asia/Manila.
 *   - The resolved label is what gets printed on every export and dashboard card.
 *
 * Timezone handling is done with Intl only (no date library) so this module can be
 * imported by the API, the web app and the tests with zero dependencies.
 */

export const DEFAULT_LIBRARY_TZ = "Asia/Manila";

export type PeriodKind =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_7_days"
  | "last_30_days"
  | "this_month"
  | "last_month"
  | "this_year"
  | "all"
  | "custom";

/** A resolved reporting window. `fromInclusive` / `toInclusive` are YYYY-MM-DD in `tz`. */
export interface ResolvedRange {
  kind: PeriodKind;
  /** First included calendar day, YYYY-MM-DD (library timezone). */
  fromInclusive: string;
  /** Last included calendar day, YYYY-MM-DD (library timezone). */
  toInclusive: string;
  /** e.g. "1–31 October 2026", "1 Jan – 6 Nov 2026", "All recorded data". */
  label: string;
  /** IANA zone the day boundaries were computed in. */
  timezone: string;
  /** Number of calendar days covered (inclusive). */
  days: number;
  /** True when the window runs up to and including today (so numbers will still move). */
  includesToday: boolean;
  /**
   * Oldest day that has data. For "all" this is the real start of the window;
   * everywhere else it lets the capacity denominator ignore empty history.
   */
  firstRecordKey?: string;
}

// ─── Timezone primitives ───────────────────────────────────────────────────────

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday */
  weekday: number;
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsFormatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      weekday: "short",
    });
    partsFormatterCache.set(tz, f);
  }
  return f;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Wall-clock parts of `date` as seen in `tz`. */
export function zonedParts(date: Date, tz: string = DEFAULT_LIBRARY_TZ): ZonedParts {
  const parts = partsFormatter(tz).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  // Intl can emit "24" for midnight with hour12:false in some engines.
  const hour = Number(get("hour")) % 24;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
  };
}

/** YYYY-MM-DD for an instant, as seen in `tz`. */
export function zonedDateKey(date: Date, tz: string = DEFAULT_LIBRARY_TZ): string {
  const p = zonedParts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** The UTC instant corresponding to a wall-clock time in `tz`. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  tz: string = DEFAULT_LIBRARY_TZ,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  // Start from the naive UTC guess, then correct by measuring what that instant
  // looks like in the target zone.
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const guessParts = zonedParts(new Date(guess), tz);
  const guessAsUtc = Date.UTC(
    guessParts.year,
    guessParts.month - 1,
    guessParts.day,
    guessParts.hour,
    guessParts.minute,
    guessParts.second,
  );
  const offset = guessAsUtc - guess;
  return new Date(guess - offset);
}

/** Start of the calendar day containing `date`, as a UTC instant. */
export function startOfZonedDay(date: Date, tz: string = DEFAULT_LIBRARY_TZ): Date {
  const p = zonedParts(date, tz);
  return zonedTimeToUtc(p.year, p.month, p.day, tz);
}

/** Last millisecond of the calendar day containing `date`. */
export function endOfZonedDay(date: Date, tz: string = DEFAULT_LIBRARY_TZ): Date {
  const p = zonedParts(date, tz);
  return new Date(zonedTimeToUtc(p.year, p.month, p.day + 1, tz).getTime() - 1);
}

/** Add (or subtract) calendar days to a YYYY-MM-DD key, staying in the calendar. */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Whole calendar days between two YYYY-MM-DD keys (inclusive of both ends). */
export function daysBetweenKeys(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / 86_400_000) + 1;
}

/** Every YYYY-MM-DD key from → to inclusive. */
export function eachKey(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  let cursor = fromKey;
  // Guard against inverted input rather than looping forever.
  if (daysBetweenKeys(fromKey, toKey) < 1) return out;
  while (cursor <= toKey) {
    out.push(cursor);
    cursor = addDaysToKey(cursor, 1);
  }
  return out;
}

// ─── Range resolution ─────────────────────────────────────────────────────────

const MONTH_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_SHORT = MONTH_LONG.map((m) => m.slice(0, 3));

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function monthRangeLabel(fromKey: string, toKey: string): string {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  if (fy === ty && fm === tm) {
    if (fd === 1 && td === new Date(Date.UTC(ty, tm, 0)).getUTCDate()) {
      return `${MONTH_LONG[fm - 1]} ${fy}`;
    }
    return `${fd}–${td} ${MONTH_LONG[fm - 1]} ${fy}`;
  }
  const from = `${fd} ${MONTH_SHORT[fm - 1]} ${fy}`;
  const to = `${td} ${MONTH_SHORT[tm - 1]} ${ty}`;
  return `${from} – ${to}`;
}

export interface ResolveOptions {
  kind: PeriodKind;
  /** "now" — injectable for tests. */
  now?: Date;
  tz?: string;
  /** Required when kind === "custom". YYYY-MM-DD keys. */
  from?: string;
  to?: string;
  /** Optional display name (e.g. "1st Semester AY 2026-2027"). */
  label?: string;
  /** Oldest day with data — used for the "all" label. */
  firstRecordKey?: string;
}

/**
 * Turn a period selection into an unambiguous, labelled window.
 * This is the ONLY place that is allowed to decide what a period means.
 */
export function resolveRange(opts: ResolveOptions): ResolvedRange {
  const tz = opts.tz ?? DEFAULT_LIBRARY_TZ;
  const now = opts.now ?? new Date();
  const today = zonedParts(now, tz);
  const todayKey = zonedDateKey(now, tz);

  let fromKey: string;
  let toKey: string = todayKey;
  let label: string;

  switch (opts.kind) {
    case "today":
      fromKey = todayKey;
      label = "Today, " + longDate(todayKey);
      break;

    case "yesterday": {
      fromKey = addDaysToKey(todayKey, -1);
      toKey = fromKey;
      label = "Yesterday, " + longDate(fromKey);
      break;
    }

    case "this_week": {
      // Monday-based week (typical for PH school calendars).
      const mondayOffset = (today.weekday + 6) % 7;
      fromKey = addDaysToKey(todayKey, -mondayOffset);
      label = "This week (Mon–today)";
      break;
    }

    case "last_7_days":
      fromKey = addDaysToKey(todayKey, -6);
      label = "Last 7 days";
      break;

    case "last_30_days":
      fromKey = addDaysToKey(todayKey, -29);
      label = "Last 30 days";
      break;

    case "this_month":
      fromKey = `${today.year}-${pad(today.month)}-01`;
      label = "This month (" + MONTH_LONG[today.month - 1] + " " + today.year + ")";
      break;

    case "last_month": {
      const m = today.month === 1 ? 12 : today.month - 1;
      const y = today.month === 1 ? today.year - 1 : today.year;
      fromKey = `${y}-${pad(m)}-01`;
      toKey = `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
      label = "Last month (" + MONTH_LONG[m - 1] + " " + y + ")";
      break;
    }

    case "this_year":
      fromKey = `${today.year}-01-01`;
      label = "Year " + today.year;
      break;

    case "all":
      fromKey = opts.firstRecordKey ?? "2000-01-01";
      label = "All recorded data";
      break;

    case "custom": {
      if (!opts.from || !opts.to) {
        throw new Error('resolveRange: kind "custom" requires both from and to (YYYY-MM-DD).');
      }
      assertKey(opts.from);
      assertKey(opts.to);
      // Never swap silently: a reversed window is a typo, and quietly returning
      // a different range than the one asked for is how wrong numbers get
      // published. The API turns this into a 400 invalid_range.
      if (opts.from > opts.to) {
        throw new Error(`Invalid date range: from (${opts.from}) is after to (${opts.to}).`);
      }
      fromKey = opts.from;
      toKey = opts.to;
      label = monthRangeLabel(fromKey, toKey);
      break;
    }

    default: {
      const exhaustive: never = opts.kind;
      throw new Error(`resolveRange: unknown period "${String(exhaustive)}"`);
    }
  }

  const days = daysBetweenKeys(fromKey, toKey);
  // An explicit label (e.g. a semester name) always wins and is followed by the
  // dates it covers. Otherwise the period name gets the dates appended — except
  // when that would repeat them ("Today, 6 Nov" · "6 Nov").
  let resolvedLabel: string;
  if (opts.label) {
    resolvedLabel = `${opts.label} (${monthRangeLabel(fromKey, toKey)})`;
  } else if (opts.kind === "custom" || opts.kind === "all" || opts.kind === "today" || opts.kind === "yesterday") {
    resolvedLabel = label;
  } else {
    resolvedLabel = `${label} · ${monthRangeLabel(fromKey, toKey)}`;
  }

  return {
    kind: opts.kind,
    fromInclusive: fromKey,
    toInclusive: toKey,
    label: resolvedLabel,
    timezone: tz,
    days,
    includesToday: toKey >= todayKey,
    firstRecordKey: opts.firstRecordKey,
  };
}

/** Convert a resolved range into the UTC instants used in SQL comparisons. */
export function rangeToInstants(range: ResolvedRange): { from: Date; to: Date } {
  const [fy, fm, fd] = range.fromInclusive.split("-").map(Number);
  const [ty, tm, td] = range.toInclusive.split("-").map(Number);
  return {
    from: zonedTimeToUtc(fy, fm, fd, range.timezone, 0, 0, 0),
    // Exclusive upper bound: first instant of the day AFTER `toInclusive`.
    to: zonedTimeToUtc(ty, tm, td + 1, range.timezone, 0, 0, 0),
  };
}

function assertKey(key: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    throw new Error(`Date must be YYYY-MM-DD, got "${key}"`);
  }
}

function longDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${d} ${MONTH_LONG[m - 1]} ${y}`;
}

// ─── Labels used by the UI ────────────────────────────────────────────────────

export const PERIOD_OPTIONS: { kind: PeriodKind; label: string }[] = [
  { kind: "today", label: "Today" },
  { kind: "yesterday", label: "Yesterday" },
  { kind: "this_week", label: "This week" },
  { kind: "last_7_days", label: "Last 7 days" },
  { kind: "last_30_days", label: "Last 30 days" },
  { kind: "this_month", label: "This month" },
  { kind: "last_month", label: "Last month" },
  { kind: "this_year", label: "This year" },
  { kind: "all", label: "All time" },
  { kind: "custom", label: "Custom range" },
];

/** Short human duration, e.g. 95 → "1h 35m", 8 → "8m", 0 → "0m". */
export function humanMinutes(minutes: number | null | undefined): string {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Percentage with a sane guard, e.g. 0.428 → "42.8%". */
export function percent(part: number, whole: number, digits = 1): string {
  if (!whole || whole <= 0) return "—";
  return `${((part / whole) * 100).toFixed(digits)}%`;
}
