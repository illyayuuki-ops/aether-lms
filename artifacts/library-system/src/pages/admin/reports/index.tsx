/**
 * Reports — one screen, one request, one definition of the period.
 *
 * Replaces the workflow this project had before (docs/reporting-gaps.md):
 *   old: open three screens → set filters by hand → export three times →
 *        stitch in Excel → hope the filters matched.
 *   new: pick a period → every card, chart and table below is derived from the
 *        same single response, so the numbers reconcile by construction.
 *
 * The period picker resolves to real dates (resolveRange) and the resolved range
 * is printed under the title, on screen and in every export.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { useAdminAuth } from "@/hooks/use-auth";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PERIOD_OPTIONS,
  humanMinutes,
  percent,
  type PeriodKind,
  type ReportOverviewResponse,
} from "@workspace/reporting";
import {
  Activity, AlertTriangle, CalendarDays, Clock, Download,
  FileSpreadsheet, FileText, Info, Loader2, PieChart,
  RefreshCw, TrendingUp, Users,
} from "lucide-react";
import { DailyTrendChart, HourlyOccupancyChart, WeekdayHourHeatmap, BreakdownBars, formatHour } from "./charts";
import { exportCsv, exportXls, openPrintView } from "./export";

// ─── Period picker ───────────────────────────────────────────────────────────

function todayKeyLocal(): string {
  // Input[type=date] wants YYYY-MM-DD; use the browser's local date (the librarian's).
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface PeriodState {
  kind: PeriodKind;
  from: string;
  to: string;
}

function PeriodPicker({
  value,
  onChange,
}: {
  value: PeriodState;
  onChange: (next: PeriodState) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">
        {PERIOD_OPTIONS.map((o) => (
          <button
            key={o.kind}
            onClick={() => onChange({ ...value, kind: o.kind })}
            className={cn(
              "rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
              value.kind === o.kind
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={value.kind === o.kind}
          >
            {o.label}
          </button>
        ))}
      </div>

      {value.kind === "custom" && (
        <div className="flex items-end gap-2">
          <label className="text-xs text-muted-foreground">
            <span className="mb-1 block">From</span>
            <input
              type="date"
              value={value.from}
              max={value.to || todayKeyLocal()}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
              className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            <span className="mb-1 block">To</span>
            <input
              type="date"
              value={value.to}
              min={value.from}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
              className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
            />
          </label>
        </div>
      )}
    </div>
  );
}

// ─── Small presentational pieces ────────────────────────────────────────────

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  hint,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  hint?: string;
  tone?: "default" | "good" | "warn";
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p
            className={cn(
              "mt-1 truncate text-2xl font-bold tabular-nums",
              tone === "good" && "text-emerald-600",
              tone === "warn" && "text-amber-600",
            )}
          >
            {value}
          </p>
          {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            tone === "good" ? "bg-emerald-50 text-emerald-600" : tone === "warn" ? "bg-amber-50 text-amber-600" : "bg-secondary text-muted-foreground",
          )}
        >
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
      {hint && (
        <p className="mt-3 flex items-start gap-1 border-t border-border pt-2 text-[11px] leading-snug text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          {hint}
        </p>
      )}
    </div>
  );
}

function Section({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Table({
  headers,
  rows,
  align = [],
}: {
  headers: string[];
  rows: (string | number)[][];
  align?: ("left" | "right")[];
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No data for this period.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left">
            {headers.map((h, i) => (
              <th
                key={h}
                className={cn("py-2 pr-3 font-semibold text-muted-foreground", align[i] === "right" && "text-right")}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border/50 last:border-0 hover:bg-secondary/30">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={cn(
                    "py-1.5 pr-3 tabular-nums",
                    align[ci] === "right" && "text-right",
                    ci === 0 && "font-medium",
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

type LoadState = "idle" | "loading" | "ready" | "error";

export default function ReportsPage() {
  const { authHeaders } = useAdminAuth();
  const { toast } = useToast();

  const [period, setPeriod] = useState<PeriodState>({
    kind: "this_month",
    from: todayKeyLocal().slice(0, 8) + "01",
    to: todayKeyLocal(),
  });
  const [data, setData] = useState<ReportOverviewResponse | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string>("");
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams({ period: period.kind });
    if (period.kind === "custom") {
      p.set("from", period.from);
      p.set("to", period.to);
    }
    return p.toString();
  }, [period]);

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const resp = await fetch(`/api/reports/overview?${query}`, { headers: authHeaders as HeadersInit });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.message ?? `HTTP ${resp.status}`);
      }
      setData(await resp.json());
      setState("ready");
      setLastLoadedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports.");
      setState("error");
    }
    // authHeaders is recreated each render; the token itself is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Export handlers ───────────────────────────────────────────────────────

  const generatedBy = localStorage.getItem("admin_username") ?? undefined;

  const exportContext = data
    ? {
        meta: data.meta,
        title: "Library Usage Report",
        generatedBy,
        note: `Utilisation = session minutes ÷ (${data.summary.capacityPcMinutes > 0 ? "configured PCs × open hours" : "unknown capacity"})`,
      }
    : null;

  const handleExportSummary = () => {
    if (!data || !exportContext) return;
    const s = data.summary;
    const rows: (string | number)[][] = [
      ["Sessions", s.totalSessions],
      ["Completed sessions", s.completedSessions],
      ["Still active", s.activeSessions],
      ["Unique students", s.uniqueStudents],
      ["Enrolled students", s.enrolledStudents || "not recorded"],
      ["Reach (% of enrolled)", s.reachPct === null ? "unknown" : `${s.reachPct}%`],
      ["Total PC time", humanMinutes(s.totalMinutes)],
      ["Average session", humanMinutes(s.avgSessionMinutes)],
      ["Median session", humanMinutes(s.medianSessionMinutes)],
      ["Longest session", humanMinutes(s.longestSessionMinutes)],
      ["Sessions under 1 minute", s.underOneMinuteSessions],
      ["Capacity (PC-minutes)", s.capacityPcMinutes],
      ["Utilisation", s.utilisationPct === null ? "unknown" : `${s.utilisationPct}%`],
      ["Average sessions per day", s.avgSessionsPerDay],
      ...s.byOutcome.map((o) => [`How sessions ended: ${o.outcome}`, o.count] as [string, number]),
    ];
    exportCsv(exportContext, ["Measure", "Value"], rows);
    toast({ title: "Summary exported", description: `${data.meta.label} · ${rows.length} measures` });
  };

  const handleExportDaily = () => {
    if (!data || !exportContext) return;
    exportCsv(
      exportContext,
      ["Date", "Sessions", "Unique students", "Minutes"],
      data.daily.map((d) => [d.date, d.sessions, d.uniqueStudents, d.minutes]),
    );
    toast({ title: "Daily trend exported", description: `${data.daily.length} days` });
  };

  const handleExportCourses = () => {
    if (!data || !exportContext) return;
    exportCsv(
      exportContext,
      ["Course", "Sessions", "Unique students", "Avg session (min)", "Total minutes", "Share %"],
      data.byCourse.map((c) => [
        c.degree, c.sessions, c.uniqueStudents, c.avgSessionMinutes, c.totalMinutes, c.sharePct,
      ]),
    );
    toast({ title: "Course breakdown exported", description: `${data.byCourse.length} courses` });
  };

  const handleExportWorkbook = () => {
    if (!data || !exportContext) return;
    const s = data.summary;
    exportXls(exportContext, [
      {
        name: "Summary",
        headers: ["Measure", "Value"],
        rows: [
          ["Sessions", s.totalSessions],
          ["Unique students", s.uniqueStudents],
          ["Total PC time (min)", s.totalMinutes],
          ["Average session (min)", s.avgSessionMinutes],
          ["Median session (min)", s.medianSessionMinutes],
          ["Utilisation %", s.utilisationPct ?? ""],
          ["Reach %", s.reachPct ?? ""],
        ],
      },
      {
        name: "Daily",
        headers: ["Date", "Sessions", "Unique students", "Minutes"],
        rows: data.daily.map((d) => [d.date, d.sessions, d.uniqueStudents, d.minutes]),
      },
      {
        name: "By hour",
        headers: ["Hour", "Sessions", "Avg PCs busy", "Occupancy %"],
        rows: data.hours.map((h) => [formatHour(h.hour), h.sessions, h.avgBusyPcs, h.occupancyPct ?? ""]),
      },
      {
        name: "By course",
        headers: ["Course", "Sessions", "Unique students", "Avg session (min)", "Share %"],
        rows: data.byCourse.map((c) => [c.degree, c.sessions, c.uniqueStudents, c.avgSessionMinutes, c.sharePct]),
      },
      {
        name: "By year level",
        headers: ["Year level", "Sessions", "Unique students", "Share %"],
        rows: data.byYearLevel.map((y) => [y.yearLevel, y.sessions, y.uniqueStudents, y.sharePct]),
      },
      {
        name: "Data quality",
        headers: ["Check", "Count", "How it is handled"],
        rows: data.quality.issues.map((i) => [i.label, i.count, i.treatment]),
      },
    ]);
    toast({
      title: "Workbook exported",
      description: "6 sheets + a provenance page for the whole period.",
    });
  };

  const handlePrint = () => {
    if (!data) return;
    const opened = openPrintView(`/admin/reports/print?${query}`);
    if (!opened) {
      toast({
        title: "Print view blocked",
        description: "Allow pop-ups for this site, then try again.",
        variant: "destructive",
      });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const s = data?.summary;

  return (
    <AdminLayout>
      <div className="flex flex-col gap-4 pb-10">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Reports</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Every figure below comes from one dataset, so the cards and the charts always agree.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={state === "loading"} className="gap-2">
              <RefreshCw className={cn("h-4 w-4", state === "loading" && "animate-spin")} />
              Refresh
            </Button>
            <Button size="sm" onClick={handleExportWorkbook} disabled={!data} className="gap-2">
              <Download className="h-4 w-4" />
              Export workbook
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} disabled={!data} className="gap-2">
              <FileText className="h-4 w-4" />
              Print / PDF
            </Button>
          </div>
        </div>

        {/* Period bar — the resolved range is always visible */}
        <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
          <PeriodPicker value={period} onChange={setPeriod} />
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              <strong className="font-medium text-foreground">{data?.meta.label ?? "Resolving period…"}</strong>
            </span>
            {data && (
              <>
                <span>
                  {data.meta.fromDate} → {data.meta.toDate} · {data.meta.days} day
                  {data.meta.days === 1 ? "" : "s"} · {data.meta.timezone}
                </span>
                {data.meta.includesToday && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
                    includes today — figures will still change
                  </span>
                )}
                {lastLoadedAt && (
                  <span className="ml-auto">loaded {lastLoadedAt.toLocaleTimeString()}</span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Body */}
        {state === "loading" && !data && (
          <div className="flex items-center justify-center gap-3 py-24 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Building report…
          </div>
        )}

        {state === "error" && (
          <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
            <div>
              <p className="text-sm font-semibold text-destructive">Could not build the report</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{error}</p>
              <Button size="sm" variant="outline" onClick={load} className="mt-2">
                Try again
              </Button>
            </div>
          </div>
        )}

        {data && s && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi
                icon={Activity}
                label="Sessions"
                value={s.totalSessions.toLocaleString()}
                sub={`${s.avgSessionsPerDay} per day average`}
                hint={`${s.completedSessions.toLocaleString()} completed · ${s.activeSessions} still active`}
              />
              <Kpi
                icon={Users}
                label="Unique students"
                value={s.uniqueStudents.toLocaleString()}
                sub={s.reachPct === null ? "reach needs enrolments" : `${s.reachPct}% of ${s.enrolledStudents.toLocaleString()} enrolled`}
                hint={
                  s.reachPct === null
                    ? "Add the student registry total to show reach."
                    : `${s.uniqueStudents} of ${s.enrolledStudents} active students used a PC.`
                }
              />
              <Kpi
                icon={Clock}
                label="Average session"
                value={humanMinutes(s.avgSessionMinutes)}
                sub={`median ${humanMinutes(s.medianSessionMinutes)} · longest ${humanMinutes(s.longestSessionMinutes)}`}
                hint={
                  s.underOneMinuteSessions > 0
                    ? `${s.underOneMinuteSessions} session(s) under a minute were left out of the average.`
                    : "All completed sessions counted."
                }
              />
              <Kpi
                icon={TrendingUp}
                label="Utilisation"
                value={s.utilisationPct === null ? "—" : `${s.utilisationPct}%`}
                sub={`${humanMinutes(s.totalMinutes)} of PC time used`}
                tone={s.utilisationPct === null ? "default" : s.utilisationPct >= 60 ? "good" : "warn"}
                hint={
                  s.capacityPcMinutes > 0
                    ? `Capacity = PCs × library open hours (${humanMinutes(s.capacityPcMinutes)}).`
                    : "Set the library opening hours in Settings to show utilisation."
                }
              />
            </div>

            {/* Two charts side by side */}
            <div className="grid gap-4 xl:grid-cols-2">
              <Section
                title="Sessions per day"
                description="Every day in the period is drawn, including days with no sessions."
                actions={
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={handleExportDaily}>
                    <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
                  </Button>
                }
              >
                <DailyTrendChart data={data.daily} />
              </Section>

              <Section
                title="PC occupancy by hour"
                description="Average share of PCs busy in each hour. Amber bar = busiest hour."
              >
                <HourlyOccupancyChart data={data.hours} />
              </Section>
            </div>

            {/* Heatmap */}
            <Section
              title="Weekday × hour"
              description="Logins by day of week and time of day — the picture for a timetable argument."
            >
              <WeekdayHourHeatmap grid={data.weekdayHour} />
            </Section>

            {/* Breakdowns */}
            <div className="grid gap-4 xl:grid-cols-2">
              <Section
                title="By course"
                description="Sessions per course, with each course's share of all sessions."
                actions={
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={handleExportCourses}>
                    <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
                  </Button>
                }
              >
                <Table
                  headers={["Course", "Sessions", "Students", "Avg", "Share"]}
                  align={["left", "right", "right", "right", "right"]}
                  rows={data.byCourse.map((c) => [
                    c.degree,
                    c.sessions.toLocaleString(),
                    c.uniqueStudents,
                    humanMinutes(c.avgSessionMinutes),
                    `${c.sharePct}%`,
                  ])}
                />
              </Section>

              <Section title="By year level" description="Sessions per year level.">
                <BreakdownBars
                  rows={data.byYearLevel.map((y) => ({ label: `Year ${y.yearLevel}`, sessions: y.sessions }))}
                  labelKey="label"
                  valueKey="sessions"
                />
              </Section>
            </div>

            {/* Outcomes + quality */}
            <div className="grid gap-4 xl:grid-cols-2">
              <Section
                title="How sessions ended"
                description="Separates students leaving from sessions we cut off — the old report merged these."
              >
                <Table
                  headers={["Outcome", "Sessions", "Share"]}
                  align={["left", "right", "right"]}
                  rows={s.byOutcome.map((o) => [
                    OUTCOME_LABELS[o.outcome] ?? o.outcome,
                    o.count.toLocaleString(),
                    percent(o.count, s.totalSessions),
                  ])}
                />
              </Section>

              <Section
                title="Data quality"
                description="What was excluded from the headline numbers, and why. Use this in your methodology."
              >
                {data.quality.issues.length === 0 ? (
                  <p className="flex items-center gap-2 py-4 text-sm text-emerald-600">
                    <PieChart className="h-4 w-4" /> No data-quality issues found in this period.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {data.quality.issues.map((issue) => (
                      <li key={issue.code} className="flex items-start gap-2 text-xs">
                        <span
                          className={cn(
                            "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                            issue.severity === "warning" ? "bg-amber-500" : "bg-slate-400",
                          )}
                        />
                        <span>
                          <strong className="font-medium">{issue.count}</strong> · {issue.label}
                          <span className="mt-0.5 block text-muted-foreground">{issue.treatment}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 space-y-1.5 border-t border-border pt-2">
                  {data.quality.completeness.map((c) => (
                    <div key={c.field} className="flex items-center gap-2 text-[11px]">
                      <span className="w-28 shrink-0 text-muted-foreground">{c.field}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                        <span
                          className={cn("block h-full rounded-full", c.pct >= 99 ? "bg-emerald-500" : "bg-amber-500")}
                          style={{ width: `${c.pct}%` }}
                        />
                      </span>
                      <span className="w-10 text-right tabular-nums">{c.pct}%</span>
                    </div>
                  ))}
                </div>
              </Section>
            </div>

            {/* Footer provenance */}
            <p className="px-1 text-[11px] text-muted-foreground">
              Definitions v{data.meta.definitionsVersion} · generated {new Date(data.meta.generatedAt).toLocaleString()} ·
              timezone {data.meta.timezone} · every export carries this header automatically.
            </p>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

// Kept next to the page because the API speaks outcome codes.
const OUTCOME_LABELS: Record<string, string> = {
  manual: "Logged out by student",
  inactivity: "Ended automatically (inactivity)",
  time_limit: "Ended at the time limit",
  librarian: "Ended by librarian",
  active: "Still active",
  unknown: "Not recorded",
};

// Re-exported for the print view so both render identical labels.
export { OUTCOME_LABELS };
