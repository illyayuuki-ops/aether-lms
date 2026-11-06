/**
 * Report charts — small, dependency-light, and identical to what the PDF/print
 * view renders (both go through ReportPrintView), so a chart in the UI and the
 * chart on the paper cannot disagree.
 *
 * Implemented with plain SVG rather than a chart library on purpose:
 *   - no layout thrash while data loads (fixed viewBox = no jump)
 *   - prints/PDFs identically in every browser
 *   - zero runtime cost on the 20 old library PCs this runs on
 */
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { DailyPoint, HourPoint } from "@workspace/reporting";

const PALETTE = {
  accent: "#1e3a5f",
  accentSoft: "#7c9cc0",
  warm: "#d97706",
  grid: "#e2e8f0",
  text: "#64748b",
};

// ─── Shared formatting ───────────────────────────────────────────────────────

function shortDate(key: string): string {
  const [, m, d] = key.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[m - 1]}`;
}

export function formatHour(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}${hour < 12 ? "am" : "pm"}`;
}

// ─── Daily trend ─────────────────────────────────────────────────────────────

interface DailyTrendProps {
  data: DailyPoint[];
  height?: number;
  /** Draw the mean line — helps a reader see above/below average days. */
  showAverage?: boolean;
}

/**
 * Sessions per day. Uses a line when the window is long (a year) and bars when
 * it is short (a week), because 365 bars are unreadable and 7 points on a line
 * hide how little data there is.
 */
export function DailyTrendChart({ data, height = 180, showAverage = true }: DailyTrendProps) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 720;
  const padL = 34;
  const padB = 22;
  const padT = 10;
  const innerW = width - padL - 8;
  const innerH = height - padB - padT;

  const max = Math.max(1, ...data.map((d) => d.sessions));
  const avg = data.length > 0 ? data.reduce((a, d) => a + d.sessions, 0) / data.length : 0;
  const useBars = data.length <= 31;
  const step = data.length > 0 ? innerW / data.length : innerW;

  const y = (v: number) => padT + innerH - (v / max) * innerH;

  const linePath = useMemo(() => {
    if (data.length === 0) return "";
    const pts = data.map((d, i) => {
      const x = padL + step * i + step / 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y(d.sessions).toFixed(1)}`;
    });
    return pts.join(" ");
  }, [data, step, max, height]);

  // Grid: 0, half, max
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);

  if (data.length === 0) {
    return <EmptyChart height={height} message="No sessions in this period" />;
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`Sessions per day, ${data.length} days, peak ${max}`}
        onMouseLeave={() => setHover(null)}
      >
        {/* grid + y labels */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={width - 8} y1={y(t)} y2={y(t)} stroke={PALETTE.grid} strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={9} fill={PALETTE.text}>
              {t}
            </text>
          </g>
        ))}

        {showAverage && avg > 0 && (
          <g>
            <line
              x1={padL}
              x2={width - 8}
              y1={y(avg)}
              y2={y(avg)}
              stroke={PALETTE.warm}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
            <text x={width - 10} y={y(avg) - 3} textAnchor="end" fontSize={9} fill={PALETTE.warm}>
              avg {avg.toFixed(1)}
            </text>
          </g>
        )}

        {useBars
          ? data.map((d, i) => {
              const barW = Math.max(2, step * 0.6);
              const x = padL + step * i + (step - barW) / 2;
              const h = (d.sessions / max) * innerH;
              return (
                <g key={d.date}>
                  <rect
                    x={x}
                    y={padT + innerH - h}
                    width={barW}
                    height={Math.max(d.sessions > 0 ? 1.5 : 0, h)}
                    rx={1.5}
                    fill={hover === i ? PALETTE.accent : PALETTE.accentSoft}
                  />
                  <rect
                    x={padL + step * i}
                    y={padT}
                    width={step}
                    height={innerH}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                  />
                </g>
              );
            })
          : (
            <g>
              <path d={linePath} fill="none" stroke={PALETTE.accent} strokeWidth={1.8} />
              {data.map((d, i) => (
                <circle
                  key={d.date}
                  cx={padL + step * i + step / 2}
                  cy={y(d.sessions)}
                  r={hover === i ? 3.5 : 1.6}
                  fill={PALETTE.accent}
                  onMouseEnter={() => setHover(i)}
                />
              ))}
            </g>
          )}

        {/* x labels: first, middle, last only — 30 labels never fit */}
        {[0, Math.floor((data.length - 1) / 2), data.length - 1]
          .filter((i, idx, arr) => i >= 0 && arr.indexOf(i) === idx)
          .map((i) => (
            <text
              key={`x${i}`}
              x={padL + step * i + step / 2}
              y={height - 6}
              textAnchor="middle"
              fontSize={9}
              fill={PALETTE.text}
            >
              {shortDate(data[i].date)}
            </text>
          ))}
      </svg>

      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            left: `${((padL + step * hover + step / 2) / width) * 100}%`,
            top: 0,
            transform: "translateX(-50%)",
          }}
        >
          <p className="font-semibold">{shortDate(data[hover].date)}</p>
          <p className="text-muted-foreground">
            {data[hover].sessions} session{data[hover].sessions === 1 ? "" : "s"} ·{" "}
            {data[hover].uniqueStudents} student{data[hover].uniqueStudents === 1 ? "" : "s"}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Hourly occupancy ───────────────────────────────────────────────────────

/**
 * Average busy PCs per hour. Shows occupancy (how full the room was) rather than
 * login counts, because "15 logins at 9am" says nothing about whether PCs were free.
 */
export function HourlyOccupancyChart({ data, height = 180 }: { data: HourPoint[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 720;
  const padL = 34;
  const padB = 22;
  const padT = 10;
  const innerW = width - padL - 8;
  const innerH = height - padB - padT;

  const maxPct = Math.max(1, ...data.map((h) => h.occupancyPct ?? 0));
  const step = innerW / 24;
  const y = (v: number) => padT + innerH - (v / maxPct) * innerH;

  const peak = data.reduce((best, h) => ((h.occupancyPct ?? 0) > (best.occupancyPct ?? 0) ? h : best), data[0]);

  if (data.every((h) => h.sessions === 0)) {
    return <EmptyChart height={height} message="No sessions in this period" />;
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} role="img"
        aria-label="Average PC occupancy by hour of day"
        onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={padL} x2={width - 8} y1={y(maxPct * f)} y2={y(maxPct * f)} stroke={PALETTE.grid} />
            <text x={padL - 6} y={y(maxPct * f) + 3} textAnchor="end" fontSize={9} fill={PALETTE.text}>
              {Math.round(maxPct * f)}%
            </text>
          </g>
        ))}

        {data.map((h, i) => {
          const pct = h.occupancyPct ?? 0;
          const barH = (pct / maxPct) * innerH;
          const isPeak = peak && h.hour === peak.hour && pct > 0;
          return (
            <g key={h.hour}>
              <rect
                x={padL + step * i + 1}
                y={padT + innerH - barH}
                width={step - 2}
                height={Math.max(pct > 0 ? 1.5 : 0, barH)}
                rx={1.5}
                fill={isPeak ? PALETTE.warm : hover === i ? PALETTE.accent : PALETTE.accentSoft}
              />
              <rect
                x={padL + step * i}
                y={padT}
                width={step}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            </g>
          );
        })}

        {[0, 6, 12, 18, 23].map((h) => (
          <text key={h} x={padL + step * h + step / 2} y={height - 6} textAnchor="middle" fontSize={9} fill={PALETTE.text}>
            {formatHour(h)}
          </text>
        ))}
      </svg>

      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: `${((padL + step * hover + step / 2) / width) * 100}%`, top: 0, transform: "translateX(-50%)" }}
        >
          <p className="font-semibold">{formatHour(data[hover].hour)}</p>
          <p className="text-muted-foreground">
            {data[hover].sessions} login{data[hover].sessions === 1 ? "" : "s"} ·{" "}
            {data[hover].avgBusyPcs.toFixed(1)} PC{data[hover].avgBusyPcs === 1 ? "" : "s"} busy
            {data[hover].occupancyPct !== null ? ` (${data[hover].occupancyPct}%)` : ""}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Weekday × hour heatmap ─────────────────────────────────────────────────

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * 7 × 24 grid of login counts. The single most useful picture for a timetable
 * argument ("Tuesday 10am is the crunch"), and impossible to read from a table.
 * Fed by `weekdayHour` from the API so it never guesses.
 */
export function WeekdayHourHeatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  const weekTotal = grid.map((row) => row.reduce((a, b) => a + b, 0));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-[2px] text-[10px]">
        <thead>
          <tr>
            <th className="w-9" />
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} className="font-normal text-muted-foreground">
                {h % 3 === 0 ? formatHour(h).replace(":00", "") : ""}
              </th>
            ))}
            <th className="pl-1 font-normal text-muted-foreground">Total</th>
          </tr>
        </thead>
        <tbody>
          {grid.map((row, wd) => (
            <tr key={wd}>
              <td className="pr-1 text-right text-muted-foreground">{WEEKDAYS[wd]}</td>
              {row.map((v, h) => (
                <td key={h} className="p-0">
                  <div
                    className="h-4 w-full rounded-[3px]"
                    style={{
                      backgroundColor: v === 0 ? "#f1f5f9" : `rgba(30,58,95,${0.12 + (v / max) * 0.88})`,
                    }}
                    title={`${WEEKDAYS[wd]} ${formatHour(h)} — ${v} login${v === 1 ? "" : "s"}`}
                  />
                </td>
              ))}
              <td className="pl-1 tabular-nums text-muted-foreground">{weekTotal[wd]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span>fewer</span>
        {[0.12, 0.34, 0.56, 0.78, 1].map((o) => (
          <span key={o} className="h-2.5 w-4 rounded-[2px]" style={{ backgroundColor: `rgba(30,58,95,${o})` }} />
        ))}
        <span>more</span>
      </div>
    </div>
  );
}

// ─── Horizontal bars (course / year level) ─────────────────────────────────

export function BreakdownBars({
  rows,
  labelKey,
  valueKey,
  maxRows = 8,
  unit = "sessions",
}: {
  rows: { [k: string]: string | number }[];
  labelKey: string;
  valueKey: string;
  maxRows?: number;
  unit?: string;
}) {
  const shown = rows.slice(0, maxRows);
  const max = Math.max(1, ...shown.map((r) => Number(r[valueKey]) || 0));

  if (shown.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No data for this period.</p>;
  }

  return (
    <ul className="space-y-2">
      {shown.map((r) => {
        const value = Number(r[valueKey]) || 0;
        return (
          <li key={String(r[labelKey])} className="grid grid-cols-[7rem_1fr_auto] items-center gap-2 text-xs">
            <span className="truncate font-medium" title={String(r[labelKey])}>{String(r[labelKey])}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-secondary">
              <span
                className="block h-full rounded-full bg-[#1e3a5f]"
                style={{ width: `${(value / max) * 100}%` }}
              />
            </span>
            <span className="tabular-nums text-muted-foreground">
              {value.toLocaleString()} {unit}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Small pieces ───────────────────────────────────────────────────────────

function EmptyChart({ height, message }: { height: number; message: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground"
      style={{ height }}
    >
      {message}
    </div>
  );
}

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const max = Math.max(1, ...values);
  const w = 120;
  const h = 28;
  if (values.length === 0) return null;
  const step = w / Math.max(1, values.length - 1);
  const path = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-7 w-24", className)} aria-hidden>
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}
