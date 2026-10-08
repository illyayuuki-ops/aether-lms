import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { useGetStats, useGetComputerStatus } from "@workspace/api-client-react";
import { Users, Clock, UserCheck, Monitor, Settings } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { cn } from "@/lib/utils";

interface TopStudent {
  studentId: string;
  name: string;
  degree: string;
  yearLevel: string;
  sessionCount: number;
}

interface Dailystat {
  date: string;
  sessions: number;
  uniqueStudents: number;
}

function getInitials(name: string): string {
  const parts = name.split(",");
  const last  = parts[0]?.trim().charAt(0) ?? "";
  const first = parts[1]?.trim().charAt(0) ?? "";
  return (last + first).toUpperCase() || name.charAt(0).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-blue-500", "bg-purple-500", "bg-emerald-500",
  "bg-amber-500", "bg-rose-500",
];

export default function AdminDashboard() {
  const { data: stats, refetch: refetchStats } = useGetStats({ period: "today" });
  const { data: computers, refetch: refetchComps } = useGetComputerStatus();

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const [topStudents, setTopStudents] = useState<TopStudent[]>([]);
  const [lineData, setLineData] = useState<Dailystat[]>([]);
  const [lineRange, setLineRange] = useState<"7" | "30">("7");

  // ── Fetch top students ──
  const fetchTopStudents = async () => {
    try {
      const token = localStorage.getItem("admin_token");
      const resp = await fetch("/api/admin/analytics/top-students?period=month&limit=5", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (resp.ok) {
        const json = await resp.json();
        setTopStudents(json.students ?? []);
      }
    } catch { /* silently ignore */ }
  };

  // ── Fetch daily session analytics for line chart ──
  const fetchLineData = async (days: string) => {
    try {
      const token = localStorage.getItem("admin_token");
      const resp = await fetch(`/api/admin/analytics/daily?days=${days}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (resp.ok) {
        const json = await resp.json();
        setLineData(json.data ?? []);
      } else {
        // Fallback: generate last N days from stats if endpoint not yet built
        setLineData(generateFallbackData(Number(days)));
      }
    } catch {
      setLineData(generateFallbackData(Number(days)));
    }
  };

  // Fallback: builds empty day slots so chart always renders
  const generateFallbackData = (days: number): Dailystat[] => {
    return Array.from({ length: days }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      return {
        date: d.toLocaleDateString([], { month: "short", day: "numeric" }),
        sessions: 0,
        uniqueStudents: 0,
      };
    });
  };

  // ── PC count ──
  const serverTotal = computers?.totalComputers;
  const [totalPCs, setTotalPCs] = useState<number>(() => {
    const saved = localStorage.getItem("dashboard_total_pcs");
    return serverTotal ?? (saved ? Number(saved) : 20);
  });
  const [showPCSettings, setShowPCSettings] = useState(false);
  const [pcInput, setPcInput] = useState(totalPCs.toString());

  const savePCCount = () => {
    const n = parseInt(pcInput);
    if (!isNaN(n) && n >= 1 && n <= 100) {
      setTotalPCs(n);
      localStorage.setItem("dashboard_total_pcs", n.toString());
      setShowPCSettings(false);
    }
  };

  useEffect(() => {
    if (serverTotal) {
      setTotalPCs(serverTotal);
      localStorage.setItem("dashboard_total_pcs", serverTotal.toString());
    }
  }, [serverTotal]);

  useEffect(() => {
    fetchTopStudents();
    fetchLineData(lineRange);
    const interval = setInterval(() => {
      refetchStats();
      refetchComps();
      fetchTopStudents();
    }, 30000);
    return () => clearInterval(interval);
  }, [refetchStats, refetchComps]);

  useEffect(() => {
    fetchLineData(lineRange);
  }, [lineRange]);

  const pcGrid = Array.from({ length: totalPCs }, (_, i) => {
    const num  = i + 1;
    const comp = computers?.computers?.find((c: any) => c.computerNumber === num);
    return { computerNumber: num, isInUse: comp?.isInUse ?? false, currentSession: comp?.currentSession ?? null };
  });

  const inUseCount    = pcGrid.filter(c => c.isInUse).length;
  const availableCount = totalPCs - inUseCount;

  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <AdminLayout>
      <div className="space-y-8 animate-in fade-in duration-500">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Overview of library activity</p>
          </div>
          <div className="flex flex-col items-end">
            <span className="font-mono text-2xl font-bold text-foreground tabular-nums">{timeStr}</span>
            <span className="text-xs text-muted-foreground">{dateStr}</span>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <KpiCard title="Active Sessions"    value={stats?.activeSessions  || 0}              icon={Monitor}   color="bg-blue-500" />
          <KpiCard title="Total Logins Today" value={stats?.totalSessions   || 0}              icon={Users}     color="bg-indigo-500" />
          <KpiCard title="Unique Students"    value={stats?.uniqueStudents  || 0}              icon={UserCheck} color="bg-emerald-500" />
          <KpiCard title="Avg Duration"       value={`${stats?.avgDurationMinutes || 0}m`}    icon={Clock}     color="bg-amber-500" />
        </div>

        {/* Top 5 Students */}
        {topStudents.length > 0 && (
          <div>
            <h2 className="text-base font-semibold text-foreground mb-3">Top Students This Month</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {topStudents.map((s, i) => (
                <div key={s.studentId} className="bg-card border border-border rounded-2xl p-4 flex flex-col items-center gap-2 text-center shadow-sm hover:shadow-md transition-shadow">
                  <div className={cn("w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0", AVATAR_COLORS[i % AVATAR_COLORS.length])}>
                    {getInitials(s.name)}
                  </div>
                  <div className="w-full">
                    <p className="font-semibold text-sm text-foreground leading-tight truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{s.studentId}</p>
                    <p className="text-xs text-muted-foreground truncate">{s.degree} • {s.yearLevel}</p>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
                    {s.sessionCount} {s.sessionCount === 1 ? "visit" : "visits"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* ── Line Chart ── */}
          <div className="lg:col-span-2">
            <div className="bg-card rounded-2xl shadow-sm border p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold font-display">Session Analytics</h3>
                <div className="flex gap-1 bg-muted rounded-lg p-1">
                  {(["7", "30"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setLineRange(r)}
                      className={cn(
                        "px-3 py-1 rounded-md text-xs font-medium transition-all",
                        lineRange === r
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {r === "7" ? "7 Days" : "30 Days"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-[300px] w-full">
                {lineData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={lineData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11 }}
                        interval={lineRange === "30" ? 4 : 0}
                      />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "8px", border: "none",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "16px" }} />
                      <Line
                        type="monotone"
                        dataKey="sessions"
                        name="Total Sessions"
                        stroke="#2563eb"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="uniqueStudents"
                        name="Unique Students"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                        strokeDasharray="4 2"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                    No session data available yet
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Computer Status Grid ── */}
          <div className="bg-card rounded-2xl shadow-sm border flex flex-col">
            <div className="p-6 border-b flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold font-display">Computer Status</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  <span className="text-green-600 font-semibold">{availableCount} Free</span>
                  <span className="mx-1">•</span>
                  <span className="text-red-500 font-semibold">{inUseCount} In Use</span>
                  <span className="mx-1">•</span>
                  <span>{totalPCs} Total</span>
                </p>
              </div>
              <button
                onClick={() => { setShowPCSettings(v => !v); setPcInput(totalPCs.toString()); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors"
                title="Configure PC count"
              >
                <Settings className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {showPCSettings && (
              <div className="px-6 py-3 border-b bg-muted/30 flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Total PCs:</span>
                <input type="number" value={pcInput} onChange={(e) => setPcInput(e.target.value)}
                  min="1" max="100"
                  className="w-20 h-8 px-2 rounded-lg border border-border bg-background text-sm focus:outline-none" />
                <button onClick={savePCCount} className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
                  Save
                </button>
              </div>
            )}

            <div className="px-4 pt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" /> Free</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" /> In Use</span>
            </div>

            <div className="p-4 flex-1 overflow-auto">
              <div className="grid grid-cols-5 gap-2">
                {pcGrid.map((comp) => (
                  <div
                    key={comp.computerNumber}
                    className={cn(
                      "aspect-square rounded-xl flex flex-col items-center justify-center relative group transition-all cursor-default",
                      comp.isInUse
                        ? "bg-red-500 text-white shadow-md shadow-red-500/30"
                        : "bg-green-500 text-white shadow-sm shadow-green-500/20"
                    )}
                    title={comp.isInUse && comp.currentSession ? comp.currentSession.name : `PC ${comp.computerNumber} — Available`}
                  >
                    <Monitor className="w-4 h-4 mb-0.5 opacity-90" />
                    <span className="font-bold text-xs">{comp.computerNumber}</span>
                    {comp.isInUse && comp.currentSession && (
                      <div className="absolute inset-0 bg-red-600/95 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 p-1.5 text-center">
                        <span className="text-[9px] leading-tight line-clamp-3 text-white font-medium">{comp.currentSession.name}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function KpiCard({ title, value, icon: Icon, color }: any) {
  return (
    <div className="bg-card p-6 rounded-2xl shadow-sm border border-border flex items-center gap-5 hover:shadow-md transition-shadow">
      <div className={cn("w-14 h-14 rounded-xl flex items-center justify-center text-white shadow-inner", color)}>
        <Icon className="w-7 h-7" />
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
        <p className="text-3xl font-display font-bold text-foreground">{value}</p>
      </div>
    </div>
  );
}