import { useState, useMemo, useEffect } from "react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { useGetAllSessions } from "@workspace/api-client-react";
import { formatMinutes } from "@/lib/utils";
import {
  ChevronLeft, ChevronRight, Download, CalendarDays,
  ArrowUpDown, ArrowUp, ArrowDown, FileText, FileSpreadsheet,
  Inbox, X, Loader2, LogOut, Trash2, Monitor, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { useAdminAuth } from "@/hooks/use-auth";

// ─── Dynamic settings hook ────────────────────────────────────────────────────
function useSystemSettings() {
  const { authHeaders } = useAdminAuth();
  const [courses, setCourses] = useState<string[]>([]);
  const [yearLevels, setYearLevels] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/admin/settings/system", { headers: authHeaders as any })
      .then((r) => r.json())
      .then((d) => {
        setCourses(d.courses ?? []);
        setYearLevels(d.yearLevels ?? []);
      })
      .catch(() => {
        setCourses(["BSA","BSED","BSHM","BSIE","BSIT","BSP","BSTM","KS","LS"]);
        setYearLevels(["1","2","3","4","5"]);
      });
  }, []);

  return { courses, yearLevels };
}
type SortField = "name" | "degree" | "yearLevel" | "loginTime" | "logoutTime" | "durationMinutes";
type SortDir = "asc" | "desc";

const DEGREE_COLORS: Record<string, string> = {
  BSA:  "bg-yellow-100 text-yellow-800",
  BSED: "bg-green-100 text-green-800",
  BSHM: "bg-orange-100 text-orange-800",
  BSIE: "bg-cyan-100 text-cyan-800",
  BSIT: "bg-blue-100 text-blue-800",
  BSP:  "bg-purple-100 text-purple-800",
  BSTM: "bg-pink-100 text-pink-800",
  KS:   "bg-teal-100 text-teal-800",
  LS:   "bg-rose-100 text-rose-800",
};
const getDegreeColor = (d: string) => DEGREE_COLORS[d] ?? "bg-gray-100 text-gray-700";

function formatTime(date: string | null | undefined) {
  if (!date) return "—";
  return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateOnly(date: string | null | undefined) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

// Generate school years dynamically
const currentYear = new Date().getFullYear();
const schoolYears = Array.from({ length: 5 }, (_, i) => `${currentYear - 2 + i}-${currentYear - 1 + i}`);

function exportToCSV(sessions: any[]) {
  const headers = ["Name", "Student ID", "Degree", "Year Level", "PC #", "Date", "Time In", "Time Out", "Duration", "Status"];
  const rows = sessions.map((s) => [
    s.name, s.studentId, s.degree, s.yearLevel, s.computerNumber,
    formatDateOnly(s.loginTime), formatTime(s.loginTime), formatTime(s.logoutTime),
    s.durationMinutes ? formatMinutes(s.durationMinutes) : s.isActive ? "Ongoing" : "—",
    s.isActive ? "Active" : s.logoutReason === "inactivity" ? "Auto-Logout" : "Completed",
  ]);
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sessions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportToHTML(sessions: any[], title: string) {
  const rows = sessions.map((s) => `<tr ${s.isActive ? 'style="background:#e8f5e9"' : ""}>
    <td>${s.name}</td><td>${s.studentId}</td><td>${s.degree}</td>
    <td>${s.yearLevel}</td><td>#${s.computerNumber}</td>
    <td>${formatDateOnly(s.loginTime)}</td><td>${formatTime(s.loginTime)}</td>
    <td>${formatTime(s.logoutTime)}</td>
    <td>${s.durationMinutes ? formatMinutes(s.durationMinutes) : s.isActive ? "Ongoing" : "—"}</td>
    <td>${s.isActive ? "Active" : s.logoutReason === "inactivity" ? "Auto-Logout" : "Completed"}</td>
  </tr>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>
    @page { size: A4 landscape; margin: 15mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 10px; margin: 0; padding: 0; color: #333; }
    h2 { color: #1e3a5f; font-size: 14px; margin: 0 0 4px 0; }
    .meta { color: #666; font-size: 9px; margin-bottom: 12px; }
    table { border-collapse: collapse; width: 100%; table-layout: fixed; }
    th { background: #1e3a5f; color: white; padding: 6px 8px; text-align: left; font-size: 9px; word-wrap: break-word; }
    td { padding: 5px 8px; border-bottom: 1px solid #ddd; word-wrap: break-word; font-size: 9px; }
    tr:nth-child(even) { background: #f9f9f9; }
    th:nth-child(1), td:nth-child(1) { width: 18%; }
    th:nth-child(2), td:nth-child(2) { width: 10%; }
    th:nth-child(3), td:nth-child(3) { width: 10%; }
    th:nth-child(4), td:nth-child(4) { width: 5%; }
    th:nth-child(5), td:nth-child(5) { width: 5%; }
    th:nth-child(6), td:nth-child(6) { width: 10%; }
    th:nth-child(7), td:nth-child(7) { width: 8%; }
    th:nth-child(8), td:nth-child(8) { width: 8%; }
    th:nth-child(9), td:nth-child(9) { width: 8%; }
    th:nth-child(10), td:nth-child(10) { width: 10%; }
  </style></head><body>
  <h2>L-CMS — ${title}</h2>
  <p class="meta">Exported: ${new Date().toLocaleString()} | Total: ${sessions.length} records</p>
  <table><thead><tr><th>Name</th><th>Student ID</th><th>Degree</th><th>Year</th><th>PC#</th><th>Date</th><th>Time In</th><th>Time Out</th><th>Duration</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

function downloadWord(sessions: any[], title: string) {
  const blob = new Blob([exportToHTML(sessions, title)], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sessions-${new Date().toISOString().slice(0, 10)}.doc`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadPDF(sessions: any[], title: string) {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(exportToHTML(sessions, title));
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 500);
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />;
  return sortDir === "asc" ? <ArrowUp className="w-3 h-3 ml-1 text-accent" /> : <ArrowDown className="w-3 h-3 ml-1 text-accent" />;
}

function ExportModal({ sessions, title, onClose }: { sessions: any[]; title: string; onClose: () => void }) {
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const handleExport = (type: "csv" | "word" | "pdf") => {
    setIsExporting(type);
    setTimeout(() => {
      if (type === "csv") exportToCSV(sessions);
      if (type === "word") downloadWord(sessions, title);
      if (type === "pdf") downloadPDF(sessions, title);
      setIsExporting(null);
      onClose();
    }, 300);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-secondary/30">
          <div>
            <h3 className="font-semibold">Export — {title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{sessions.length} records will be exported</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-auto max-h-64 border-b">
          <table className="w-full text-xs text-left">
            <thead className="sticky top-0 bg-secondary/60 text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-2">Name</th><th className="px-4 py-2">Degree / Year</th>
                <th className="px-4 py-2">PC #</th><th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Time In</th><th className="px-4 py-2">Time Out</th>
                <th className="px-4 py-2">Duration</th><th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sessions.slice(0, 50).map((s) => (
                <tr key={s.sessionId} className={s.isActive ? "bg-green-50" : "hover:bg-secondary/20"}>
                  <td className="px-4 py-2 font-medium">{s.name}</td>
                  <td className="px-4 py-2">{s.degree} Yr {s.yearLevel}</td>
                  <td className="px-4 py-2 font-mono">#{s.computerNumber}</td>
                  <td className="px-4 py-2">{formatDateOnly(s.loginTime)}</td>
                  <td className="px-4 py-2">{formatTime(s.loginTime)}</td>
                  <td className="px-4 py-2">{formatTime(s.logoutTime)}</td>
                  <td className="px-4 py-2">{s.durationMinutes ? formatMinutes(s.durationMinutes) : s.isActive ? <span className="text-blue-500">Ongoing</span> : "—"}</td>
                  <td className="px-4 py-2">{s.isActive ? <span className="text-green-600">Active</span> : s.logoutReason === "inactivity" ? "Auto-Logout" : "Completed"}</td>
                </tr>
              ))}
              {sessions.length > 50 && (
                <tr><td colSpan={8} className="px-4 py-2 text-center text-muted-foreground italic">... and {sessions.length - 50} more records</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 flex flex-col sm:flex-row gap-3 justify-end bg-secondary/10">
          <Button variant="outline" onClick={onClose} className="sm:order-first">Cancel</Button>
          <Button variant="outline" className="gap-2 border-green-500/30 text-green-600 hover:bg-green-500/10" onClick={() => handleExport("csv")} disabled={!!isExporting}>
            {isExporting === "csv" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} Export as Excel / CSV
          </Button>
          <Button variant="outline" className="gap-2 border-blue-500/30 text-blue-600 hover:bg-blue-500/10" onClick={() => handleExport("word")} disabled={!!isExporting}>
            {isExporting === "word" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Export as Word
          </Button>
          <Button className="gap-2 bg-accent hover:bg-accent/90 text-white" onClick={() => handleExport("pdf")} disabled={!!isExporting}>
            {isExporting === "pdf" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Export as PDF
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
// Used for BOTH Active Sessions (/admin/sessions) and Session History (/admin/history)
// Auto-detects which view based on the current URL path.

export default function AdminSessions() {
  const { toast } = useToast();
  const { courses, yearLevels } = useSystemSettings();

  // Auto-detect page type from URL — no tabs needed
  const isHistoryPage = window.location.pathname.includes("history");
  const pageTitle = isHistoryPage ? "Session History" : "Active Sessions";

  const [page, setPage] = useState(1);
  const [degreeFilter, setDegreeFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("loginTime");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showExport, setShowExport] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [forceLogoutId, setForceLogoutId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isForceLoggingOut, setIsForceLoggingOut] = useState(false);
  
  // New State variables for the export dropdowns
  const [schoolYear, setSchoolYear] = useState(`${currentYear}-${currentYear + 1}`);
  const [semester, setSemester] = useState("1st Semester");

  const { data, isLoading, refetch } = useGetAllSessions({
    page, limit: 50,
    // Filter server-side — the API now supports isActive/yearLevel so the
    // 50-row page isn't pre-filtered client-side (which made history look
    // like it only contained the latest sessions).
    ...(isHistoryPage ? { isActive: false } : { isActive: true }),
    ...(degreeFilter ? { gradeLevel: degreeFilter } : {}),
    ...(yearFilter ? { yearLevel: yearFilter } : {}),
    ...(dateFilter ? { startDate: dateFilter, endDate: dateFilter } : {}),
  });

  const sessions = useMemo(() => {
    const list = data?.sessions ?? [];
    return [...list].sort((a, b) => {
      let aVal: any, bVal: any;
      switch (sortField) {
        case "name": aVal = a.name?.toLowerCase(); bVal = b.name?.toLowerCase(); break;
        case "degree": aVal = (a as any).degree; bVal = (b as any).degree; break;
        case "yearLevel": aVal = Number((a as any).yearLevel); bVal = Number((b as any).yearLevel); break;
        case "loginTime": aVal = new Date(a.loginTime).getTime(); bVal = new Date(b.loginTime).getTime(); break;
        case "logoutTime":
          aVal = a.logoutTime ? new Date(a.logoutTime).getTime() : 0;
          bVal = b.logoutTime ? new Date(b.logoutTime).getTime() : 0;
          break;
        case "durationMinutes": aVal = a.durationMinutes ?? 0; bVal = b.durationMinutes ?? 0; break;
        default: aVal = 0; bVal = 0;
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const handleDelete = async (id: number) => {
    setIsDeleting(true);
    try {
      const token = localStorage.getItem("admin_token");
      const resp = await fetch(`/api/admin/sessions/${id}`, {
        method: "DELETE",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (resp.ok) { toast({ title: "Session record deleted." }); setDeleteConfirmId(null); refetch(); }
      else toast({ title: "Failed to delete session.", variant: "destructive" });
    } catch { toast({ title: "Connection error.", variant: "destructive" }); }
    finally { setIsDeleting(false); }
  };

  const handleForceLogout = async (id: number) => {
    setIsForceLoggingOut(true);
    try {
      const token = localStorage.getItem("admin_token");
      const resp = await fetch(`/api/sessions/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ sessionId: id, reason: "manual" }),
      });
      if (resp.ok) { toast({ title: "Student has been logged out." }); setForceLogoutId(null); refetch(); }
      else toast({ title: "Failed to force logout.", variant: "destructive" });
    } catch { toast({ title: "Connection error.", variant: "destructive" }); }
    finally { setIsForceLoggingOut(false); }
  };

  const thCls = "px-4 py-3 font-semibold cursor-pointer select-none hover:text-foreground transition-colors text-xs uppercase tracking-wide";

  return (
    <AdminLayout>
      <div className="flex flex-col gap-4 h-full animate-in fade-in">
        <div className="bg-card rounded-2xl shadow-sm border border-border flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="p-4 border-b flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center bg-secondary/20">
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <select className="px-3 py-2 bg-background border rounded-lg text-sm focus:outline-none" value={degreeFilter} onChange={(e) => { setDegreeFilter(e.target.value); setPage(1); }}>
                <option value="">All Courses</option>
                {courses.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select className="px-3 py-2 bg-background border rounded-lg text-sm focus:outline-none" value={yearFilter} onChange={(e) => { setYearFilter(e.target.value); setPage(1); }}>
                <option value="">All Year Levels</option>
                {yearLevels.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <div className="relative">
                <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input type="date" className="pl-9 pr-3 py-2 bg-background border rounded-lg text-sm focus:outline-none" value={dateFilter} onChange={(e) => { setDateFilter(e.target.value); setPage(1); }} />
              </div>
              {(degreeFilter || yearFilter || dateFilter) && (
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { setDegreeFilter(""); setYearFilter(""); setDateFilter(""); setPage(1); }}>
                  Clear filters
                </Button>
              )}
            </div>
            
            <div className="flex gap-2 items-center">
              <select
                value={schoolYear}
                onChange={(e) => setSchoolYear(e.target.value)}
                className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground focus:outline-none"
              >
                {schoolYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground focus:outline-none"
              >
                <option>1st Semester</option>
                <option>2nd Semester</option>
                <option>Summer</option>
              </select>
              <Button variant="outline" className="gap-2 shrink-0" onClick={() => setShowExport(true)} disabled={sessions.length === 0}>
                <Download className="w-4 h-4" /> Export
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            {!isLoading && sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-4">
                {!isHistoryPage ? (
                  <>
                    <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center">
                      <Monitor className="w-10 h-10 opacity-20" />
                    </div>
                    <p className="font-semibold text-lg text-foreground">No Active Sessions</p>
                    <p className="text-sm opacity-70">The library is currently empty. Students will appear here when they log in.</p>
                  </>
                ) : (
                  <>
                    <Inbox className="w-12 h-12 opacity-20" />
                    <p className="font-semibold text-base">No session history found</p>
                    <p className="text-sm opacity-70">{degreeFilter || yearFilter || dateFilter ? "Try adjusting your filters." : "No sessions recorded yet."}</p>
                  </>
                )}
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 sticky top-0 z-10">
                  <tr>
                    <th className={thCls} onClick={() => handleSort("name")}><span className="flex items-center">Student <SortIcon field="name" sortField={sortField} sortDir={sortDir} /></span></th>
                    <th className={thCls} onClick={() => handleSort("degree")}><span className="flex items-center">Degree <SortIcon field="degree" sortField={sortField} sortDir={sortDir} /></span></th>
                    <th className={thCls} onClick={() => handleSort("yearLevel")}><span className="flex items-center">Year <SortIcon field="yearLevel" sortField={sortField} sortDir={sortDir} /></span></th>
                    <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wide">PC #</th>
                    <th className={thCls} onClick={() => handleSort("loginTime")}><span className="flex items-center">Time In <SortIcon field="loginTime" sortField={sortField} sortDir={sortDir} /></span></th>
                    <th className={thCls} onClick={() => handleSort("logoutTime")}><span className="flex items-center">Time Out <SortIcon field="logoutTime" sortField={sortField} sortDir={sortDir} /></span></th>
                    <th className={thCls} onClick={() => handleSort("durationMinutes")}><span className="flex items-center">Duration <SortIcon field="durationMinutes" sortField={sortField} sortDir={sortDir} /></span></th>
                    <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wide text-right">{isHistoryPage ? "Status / Action" : "Action"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoading ? (
                    <tr><td colSpan={8} className="text-center py-16 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Loading...</td></tr>
                  ) : (
                    sessions.map((session) => (
                      <tr key={session.sessionId} className={cn("transition-colors",
                        session.isActive ? "bg-green-50/50 hover:bg-green-50 border-l-2 border-l-green-500" : "hover:bg-secondary/20"
                      )}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{session.name}</div>
                          <div className="text-xs text-muted-foreground">{session.studentId}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getDegreeColor((session as any).degree)}`}>
                            {(session as any).degree || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-sm">Yr {(session as any).yearLevel || "—"}</td>
                        <td className="px-4 py-3 font-mono font-medium">#{session.computerNumber}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm">{formatDateOnly(session.loginTime)}</div>
                          <div className="text-xs text-muted-foreground">{formatTime(session.loginTime)}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {session.logoutTime ? (
                            <><div className="text-sm">{formatDateOnly(session.logoutTime)}</div><div className="text-xs text-muted-foreground">{formatTime(session.logoutTime)}</div></>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {session.durationMinutes
                            ? <span className="font-medium">{formatMinutes(session.durationMinutes)}</span>
                            : session.isActive
                              ? <span className="text-blue-500 font-medium text-xs animate-pulse">Ongoing</span>
                              : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {session.isActive ? (
                            <Button size="sm" variant="destructive" className="gap-1.5 text-xs h-8" onClick={() => setForceLogoutId(session.sessionId)}>
                              <LogOut className="w-3 h-3" /> Force Logout
                            </Button>
                          ) : (
                            <div className="flex items-center gap-2 justify-end">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground border border-border">
                                {session.logoutReason === "inactivity" ? "Auto-Logout" : "Completed"}
                              </span>
                              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg" onClick={() => setDeleteConfirmId(session.sessionId)}>
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          <div className="p-4 border-t flex items-center justify-between bg-background">
            <p className="text-sm text-muted-foreground">
              Showing <span className="font-medium text-foreground">{sessions.length}</span> of{" "}
              <span className="font-medium text-foreground">{data?.total ?? 0}</span> records
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft className="w-4 h-4" /></Button>
              <span className="px-3 py-1 text-sm text-muted-foreground flex items-center">Page {page}</span>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={!data || data.sessions.length < 50}><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>
        </div>
      </div>

      {showExport && <ExportModal sessions={sessions} title={`${pageTitle} (${semester} AY ${schoolYear})`} onClose={() => setShowExport(false)} />}

      {forceLogoutId !== null && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-sm p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-orange-500" />
            </div>
            <h2 className="text-lg font-bold mb-2">Force Logout?</h2>
            <p className="text-muted-foreground text-sm mb-6">This will immediately end the student's session.</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setForceLogoutId(null)}>Cancel</Button>
              <Button className="flex-1 rounded-xl bg-orange-500 hover:bg-orange-600 text-white" onClick={() => handleForceLogout(forceLogoutId)} disabled={isForceLoggingOut}>
                {isForceLoggingOut ? "Logging out..." : "Force Logout"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmId !== null && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-sm p-6 text-center">
            <Trash2 className="w-10 h-10 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-bold mb-2">Delete Session Record?</h2>
            <p className="text-muted-foreground text-sm mb-6">This will permanently remove this session from history.</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
              <Button variant="destructive" className="flex-1 rounded-xl" onClick={() => handleDelete(deleteConfirmId)} disabled={isDeleting}>
                {isDeleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}