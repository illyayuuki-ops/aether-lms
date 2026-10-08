import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/admin-layout";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Cell,
} from "recharts";
import { TrendingUp, Users, Clock, Award, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UsagePatterns {
  peakHours: { hour: number; count: number }[];
  degreeStats: { degree: string; sessions: number; avgDuration: number }[];
  dailyTrend: { date: string; sessions: number }[];
  topStudents: { studentId: string; name: string; degree: string; visits: number; avgDuration: number }[];
}

// ─── Degree colors ────────────────────────────────────────────────────────────

const DEGREE_COLORS: Record<string, string> = {
  BSA:  "#ca8a04", BSED: "#16a34a", BSHM: "#ea580c",
  BSIE: "#0891b2", BSIT: "#2563eb", BSP:  "#9333ea",
  BSTM: "#db2777", KS:   "#0d9488", LS:   "#e11d48",
};
const getDegreeColor = (d: string) => DEGREE_COLORS[d] ?? "#6b7280";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHour(h: number) {
  if (h === 0) return "12AM";
  if (h < 12) return `${h}AM`;
  if (h === 12) return "12PM";
  return `${h - 12}PM`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatDuration(mins: number) {
  if (!mins) return "—";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ─── Peak Hours Heatmap-style bar ─────────────────────────────────────────────

function PeakHoursChart({ data }: { data: { hour: number; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1);

  // Only show library hours: 7AM–9PM
  const libraryHours = data.filter(d => d.hour >= 7 && d.hour <= 21);

  return (
    <div>
      <div className="flex gap-1 items-end h-20 mb-1">
        {libraryHours.map((d) => {
          const pct = d.count / max;
          const isHigh = pct > 0.7;
          const isMed = pct > 0.3;
          return (
            <div key={d.hour} className="flex-1 flex flex-col items-center gap-1 group relative">
              <div
                className={cn(
                  "w-full rounded-sm transition-all",
                  isHigh ? "bg-accent" : isMed ? "bg-accent/50" : "bg-accent/20"
                )}
                style={{ height: `${Math.max(pct * 64, 4)}px` }}
              />
              {/* Tooltip */}
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex bg-popover border border-border rounded-lg px-2 py-1 text-xs whitespace-nowrap z-10 shadow-lg">
                {formatHour(d.hour)}: <strong className="ml-1">{d.count} sessions</strong>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1">
        {libraryHours.map((d) => (
          <div key={d.hour} className="flex-1 text-center text-[9px] text-muted-foreground">
            {d.hour % 2 === 0 ? formatHour(d.hour) : ""}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-accent/20" /> Low</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-accent/50" /> Medium</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-accent" /> High</div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyticsDashboard() {
  const [data, setData] = useState<UsagePatterns | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [period, setPeriod] = useState<"today" | "week" | "month" | "year" | "all">("month");
  const [customYear, setCustomYear] = useState<number>(new Date().getFullYear());
  const [customMonth, setCustomMonth] = useState<number>(new Date().getMonth() + 1);
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem("admin_token");
      const params = new URLSearchParams();
      params.set("period", period);
      if (period === "all" || (customYear && customMonth)) {
        params.set("year", customYear.toString());
        params.set("month", customMonth.toString());
      }
      const resp = await fetch(`/api/admin/analytics/usage-patterns?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (resp.ok) {
        const json = await resp.json();
        setData(json);
        setLastUpdated(new Date());
      }
    } catch (e) {
      console.error("Analytics fetch error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchAnalytics(); }, []);

  // Find peak hour label
  const peakHour = data?.peakHours.reduce((a, b) => (a.count > b.count ? a : b), { hour: 0, count: 0 });
  const topDegree = data?.degreeStats[0];
  const totalSessions30d = data?.dailyTrend.reduce((s, d) => s + d.sessions, 0) ?? 0;
  const avgPerDay = data ? Math.round(totalSessions30d / 7) : 0;

  return (
    <AdminLayout>
      <div className="space-y-6 animate-in fade-in duration-500">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold">Usage Analytics</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              AI-driven insights from the last 30 days of library usage
              {lastUpdated && <span className="ml-2">• Updated {lastUpdated.toLocaleTimeString()}</span>}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center w-full sm:w-auto">
            <div className="flex gap-1 bg-muted p-1 rounded-xl" role="group" aria-label="Time period">
              {(["today", "week", "month", "year", "all"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => { setPeriod(p); setShowCustomPicker(p === "all"); fetchAnalytics(); }}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
                    period === p
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
            {showCustomPicker && (
              <div className="flex items-center gap-2 bg-muted p-2 rounded-xl">
                <label htmlFor="analytics-year" className="text-xs text-muted-foreground">Year</label>
                <select
                  id="analytics-year"
                  value={customYear}
                  onChange={(e) => { setCustomYear(Number(e.target.value)); fetchAnalytics(); }}
                  className="px-2 py-1.5 text-sm border border-input bg-background rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <label htmlFor="analytics-month" className="text-xs text-muted-foreground">Month</label>
                <select
                  id="analytics-month"
                  value={customMonth}
                  onChange={(e) => { setCustomMonth(Number(e.target.value)); fetchAnalytics(); }}
                  className="px-2 py-1.5 text-sm border border-input bg-background rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString("default", { month: "long" })}</option>
                  ))}
                </select>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={fetchAnalytics} disabled={isLoading} className="gap-2 rounded-xl">
              <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {isLoading && !data ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground gap-3">
            <Loader2 className="w-6 h-6 animate-spin" /> Loading analytics...
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                icon={Clock}
                color="bg-blue-500"
                label="Peak Hour"
                value={peakHour ? formatHour(peakHour.hour) : "—"}
                sub={peakHour ? `${peakHour.count} sessions` : "No data"}
              />
              <KpiCard
                icon={TrendingUp}
                color="bg-indigo-500"
                label="Avg / Day (7d)"
                value={avgPerDay.toString()}
                sub="sessions per day"
              />
              <KpiCard
                icon={Users}
                color="bg-emerald-500"
                label="Top Course"
                value={topDegree?.degree ?? "—"}
                sub={topDegree ? `${topDegree.sessions} sessions` : "No data"}
              />
              <KpiCard
                icon={Award}
                color="bg-amber-500"
                label="Most Active Student"
                value={data?.topStudents[0]?.name.split(",")[0] ?? "—"}
                sub={data?.topStudents[0] ? `${data.topStudents[0].visits} visits` : "No data"}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Peak Hours */}
              <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
                <div className="mb-4">
                  <h3 className="font-bold font-display text-lg">Peak Hours</h3>
                  <p className="text-xs text-muted-foreground">Library hours (7AM–9PM) · 30-day average</p>
                </div>
                {data && <PeakHoursChart data={data.peakHours} />}
              </div>

              {/* Daily Trend */}
              <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
                <div className="mb-4">
                  <h3 className="font-bold font-display text-lg">Daily Trend</h3>
                  <p className="text-xs text-muted-foreground">Sessions per day · Last 7 days</p>
                </div>
                <div className="h-[160px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data?.dailyTrend.map(d => ({ ...d, date: formatDate(d.date) }))}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)", fontSize: 12 }}
                        formatter={(v: any) => [`${v} sessions`, "Sessions"]}
                      />
                      <Line
                        type="monotone"
                        dataKey="sessions"
                        stroke="#2563eb"
                        strokeWidth={2.5}
                        dot={{ fill: "#2563eb", r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Degree Stats */}
              <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
                <div className="mb-4">
                  <h3 className="font-bold font-display text-lg">Usage by Course</h3>
                  <p className="text-xs text-muted-foreground">Sessions and average duration per degree · 30 days</p>
                </div>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data?.degreeStats} layout="vertical" margin={{ left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="degree" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600 }} width={40} />
                      <Tooltip
                        contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)", fontSize: 12 }}
                        formatter={(v: any, name: string) => [
                          name === "sessions" ? `${v} sessions` : `${v} min avg`,
                          name === "sessions" ? "Sessions" : "Avg Duration",
                        ]}
                      />
                      <Bar dataKey="sessions" radius={[0, 4, 4, 0]}>
                        {data?.degreeStats.map((entry) => (
                          <Cell key={entry.degree} fill={getDegreeColor(entry.degree)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top Students */}
              <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
                <div className="mb-4">
                  <h3 className="font-bold font-display text-lg">Most Active Students</h3>
                  <p className="text-xs text-muted-foreground">Top 5 by visit count · 30 days</p>
                </div>
                <div className="space-y-3">
                  {data?.topStudents.length === 0 && (
                    <p className="text-muted-foreground text-sm text-center py-8">No session data yet.</p>
                  )}
                  {data?.topStudents.map((s, i) => (
                    <div key={s.studentId} className="flex items-center gap-3">
                      {/* Rank badge */}
                      <div className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0",
                        i === 0 ? "bg-amber-100 text-amber-700"
                        : i === 1 ? "bg-slate-100 text-slate-600"
                        : i === 2 ? "bg-orange-100 text-orange-700"
                        : "bg-secondary text-muted-foreground"
                      )}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.degree} • {s.studentId}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-sm">{s.visits} visits</p>
                        <p className="text-xs text-muted-foreground">{formatDuration(s.avgDuration)} avg</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* AI Insights — Real Widget */}
            <AiInsightsWidget period={period} customYear={customYear} customMonth={customMonth} />
          </>
        )}
      </div>
    </AdminLayout>
  );
}

// ─── AI Insights Widget ──────────────────────────────────────────────────────

function AiInsightsWidget({ period, customYear, customMonth }: { period: "today" | "week" | "month" | "year" | "all"; customYear: number; customMonth: number }) {
  const [insights, setInsights] = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("admin_token");
      const params = new URLSearchParams();
      params.set("period", period);
      if (period === "all" || (customYear && customMonth)) {
        params.set("year", customYear.toString());
        params.set("month", customMonth.toString());
      }
      const resp  = await fetch(`/api/admin/analytics/ai-insights?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data  = await resp.json();
      setInsights(data.insights ?? "- No insights returned.");
    } catch {
      setInsights("- Failed to load insights. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-r from-accent/10 to-blue-500/10 border border-accent/20 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h4 className="font-bold text-foreground">AI-Driven Insights</h4>
            <p className="text-xs text-muted-foreground">Powered by Claude · Based on last 30 days</p>
          </div>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-background hover:bg-muted text-sm font-medium transition-colors disabled:opacity-50"
        >
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
            : insights
              ? <><RefreshCw className="w-4 h-4" /> Refresh</>
              : <><Sparkles className="w-4 h-4" /> Generate Insights</>}
        </button>
      </div>

      {insights ? (
        <ul className="space-y-2">
          {insights
            .split("\n")
            .filter(Boolean)
            .map((line, i) => (
              <li key={i} className="flex gap-2 text-sm text-foreground">
                <span className="text-accent mt-0.5 shrink-0">•</span>
                <span>{line.replace(/^[-•]\s*/, "")}</span>
              </li>
            ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Click "Generate Insights" to get AI-powered analysis of this month's library usage patterns.
        </p>
      )}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, color, label, value, sub }: {
  icon: any; color: string; label: string; value: string; sub: string;
}) {
  return (
    <div className="bg-card p-5 rounded-2xl shadow-sm border border-border flex items-center gap-4 hover:shadow-md transition-shadow">
      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0", color)}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-display font-bold truncate">{value}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}