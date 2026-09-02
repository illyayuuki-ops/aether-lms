import { useState, useRef, useCallback, useEffect } from "react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { useListStudents, useCreateStudent, useUpdateStudent, useDeleteStudent } from "@workspace/api-client-react";
import {
  UserPlus, Pencil, Trash2, Search, ChevronLeft, ChevronRight,
  X, Upload, AlertTriangle, CheckCircle, Loader2, FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useAdminAuth } from "@/hooks/use-auth";

// ─── PH Education Category System ────────────────────────────────────────────
// Based on actual school enrollment data (2025-2026):
//   College:  BEED, BSA, BSBA, BSED, BSHM, BSIE, BSIT, BSMA, BSP, BSTM → yr 1-4
//   SHS:      SHS  (strand in major: STEM, HUMSS, ABM, TVL-HE, TVL-ICT)  → yr 11-12
//   JHS:      JHS                                                          → yr 9-10
//   MS:       MS (Middle School, grades 6-8) ─┐
//   LS:       LS (Lower School, grades 1-5)  ─┤→ "Elementary / Kinder"
//   KS:       KS (Kinder, grades 1-2)        ─┘
//
// DEFAULT display: Grade 4 and up only.
// After import, newly found year levels auto-sync to settings so lower grades
// appear automatically without any manual configuration.

type EduLevel = "College" | "Senior High School" | "Junior High School" | "Elementary / Kinder" | "Other";

const LEVEL_ORDER: EduLevel[] = [
  "College", "Senior High School", "Junior High School", "Elementary / Kinder", "Other",
];

const LEVEL_STYLES: Record<EduLevel, { header: string; badge: string }> = {
  "College":             { header: "bg-blue-600",    badge: "bg-blue-100 text-blue-800" },
  "Senior High School":  { header: "bg-violet-600",  badge: "bg-violet-100 text-violet-800" },
  "Junior High School":  { header: "bg-amber-600",   badge: "bg-amber-100 text-amber-800" },
  "Elementary / Kinder": { header: "bg-emerald-600", badge: "bg-emerald-100 text-emerald-800" },
  "Other":               { header: "bg-gray-500",    badge: "bg-gray-100 text-gray-700" },
};

// SHS strands from actual data (stored in major column, not degree)
const SHS_STRANDS_LIST = ["STEM","HUMSS","ABM","TVL-HE","TVL-ICT","TVL-IA","GAS","SPORTS","ARTS & DESIGN"];

// Exact degree codes from actual enrollment XLS
const COLLEGE_DEGREES = new Set(["BEED","BSA","BSBA","BSED","BSHM","BSIE","BSIT","BSMA","BSP","BSTM"]);
const ELEM_KINDER_SET = new Set(["KS","LS","MS","KINDER","KINDERGARTEN"]);

// DEFAULT year ranges — Grade 4 and up, shown before any import runs
const DEFAULT_YEAR_RANGES: Record<EduLevel, string[]> = {
  "College":             ["1","2","3","4"],
  "Senior High School":  ["11","12"],
  "Junior High School":  ["9","10"],
  "Elementary / Kinder": ["4","5","6","7","8"],
  "Other":               [],
};

// Full possible ranges per level (intersected with settings DB after import)
const FULL_YEAR_RANGES: Record<EduLevel, string[]> = {
  "College":             ["1","2","3","4"],
  "Senior High School":  ["11","12"],
  "Junior High School":  ["9","10"],
  "Elementary / Kinder": ["1","2","3","4","5","6","7","8"],
  "Other":               [],
};

function getLevel(degree: string): EduLevel {
  const d = degree.trim().toUpperCase();
  if (COLLEGE_DEGREES.has(d))       return "College";
  if (/^(BS[A-Z]+|BEED)/.test(d))  return "College";
  if (ELEM_KINDER_SET.has(d))       return "Elementary / Kinder";
  if (/^(GRADE\s*[1-6]|G[1-6])$/.test(d)) return "Elementary / Kinder";
  if (d === "JHS") return "Junior High School";
  if (/^(GRADE\s*[7-9]|GRADE\s*10|G[7-9]|G10)$/.test(d)) return "Junior High School";
  if (d === "SHS") return "Senior High School";
  if (SHS_STRANDS_LIST.some(s => d === s || d.startsWith(s + "-") || d.startsWith(s + " "))) return "Senior High School";
  return "Other";
}

// Shows strand for SHS: "SHS - STEM", "SHS - ABM", etc.
function getDegreeLabel(degree: string, major?: string | null): string {
  if (degree === "SHS" && major && major !== "NONE" && major.trim() !== "") {
    return `SHS - ${major.trim()}`;
  }
  return degree;
}

function getDegreeColor(degree: string): string {
  return LEVEL_STYLES[getLevel(degree)]?.badge ?? "bg-gray-100 text-gray-700";
}

// Sort: degree → strand (SHS major) → year level (numeric) → name
function groupStudents(students: any[]): { level: EduLevel; students: any[] }[] {
  const groups: Record<EduLevel, any[]> = {
    "College": [], "Senior High School": [], "Junior High School": [],
    "Elementary / Kinder": [], "Other": [],
  };
  for (const s of students) groups[getLevel(s.degree ?? "")].push(s);
  for (const lv of LEVEL_ORDER) {
    groups[lv].sort((a, b) => {
      const dc = (a.degree ?? "").localeCompare(b.degree ?? "");
      if (dc !== 0) return dc;
      // For SHS: sort by strand (major) next
      const ma = (a.major && a.major !== "NONE") ? a.major : "";
      const mb = (b.major && b.major !== "NONE") ? b.major : "";
      const mc = ma.localeCompare(mb);
      if (mc !== 0) return mc;
      // Then numerically by year level
      const ya = parseInt(a.yearLevel) || 0;
      const yb = parseInt(b.yearLevel) || 0;
      if (ya !== yb) return ya - yb;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
  }
  return LEVEL_ORDER.filter((lv) => groups[lv].length > 0).map((lv) => ({ level: lv, students: groups[lv] }));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function joinName(first: string, middle: string, last: string): string {
  const f = first.trim(), m = middle.trim(), l = last.trim();
  const mi = m ? ` ${m.charAt(0).toUpperCase()}.` : "";
  if (l && f) return `${l.toUpperCase()}, ${f}${mi}`;
  return [l, f, m].filter(Boolean).join(" ");
}

function splitName(full: string): { first: string; middle: string; last: string } {
  if (!full) return { first: "", middle: "", last: "" };
  const ci = full.indexOf(",");
  if (ci === -1) return { first: full.trim(), middle: "", last: "" };
  const last = full.slice(0, ci).trim();
  const rest = full.slice(ci + 1).trim();
  const mi = rest.match(/^(.+?)\s+([A-Z])\.$/);
  if (mi) return { first: mi[1].trim(), middle: mi[2], last };
  return { first: rest, middle: "", last };
}

function formatStudentId(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 7);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentForm {
  studentId: string; firstName: string; middleName: string; lastName: string;
  degree: string; major: string; yearLevel: string; isActive: boolean;
}
const emptyForm: StudentForm = {
  studentId: "", firstName: "", middleName: "", lastName: "",
  degree: "", major: "", yearLevel: "", isActive: true,
};

interface ImportRow {
  studentId: string; name: string; degree: string;
  major: string; yearLevel: string;
  status: "ready" | "update" | "error"; error?: string;
  dbId?: number;
}

// ─── System settings hook ─────────────────────────────────────────────────────

function useSystemSettings() {
  const [courses, setCourses]       = useState<string[]>([]);
  const [yearLevels, setYearLevels] = useState<string[]>([]);
  const [loaded, setLoaded]         = useState(false);
  const { authHeaders } = useAdminAuth();

  useEffect(() => {
    fetch("/api/admin/settings/system", { headers: authHeaders as any })
      .then((r) => r.json())
      .then((d) => {
        // Sort courses by education level order for logical dropdown display
        const sorted = (d.courses ?? []).sort((a: string, b: string) => {
          const la = LEVEL_ORDER.indexOf(getLevel(a));
          const lb = LEVEL_ORDER.indexOf(getLevel(b));
          if (la !== lb) return la - lb;
          return a.localeCompare(b);
        });
        setCourses(sorted);
        // Sort year levels numerically
        const yl: string[] = (d.yearLevels ?? []);
        yl.sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
        setYearLevels(yl);
        setLoaded(true);
      })
      .catch(() => {
        // Fallback: Grade 4 and up (default before any import)
        setCourses(["BSA","BSBA","BSED","BEED","BSHM","BSIE","BSIT","BSMA","BSP","BSTM","SHS","JHS","MS","LS","KS"]);
        setYearLevels(["4","5","6","7","8","9","10","11","12"]);
        setLoaded(true);
      });
  }, []);

  return { courses, yearLevels, loaded };
}

// ─── Import Modal ─────────────────────────────────────────────────────────────

function ImportModal({ onClose, onImported, courses, onRemovedStudentsFound }: {
  onClose: () => void; onImported: () => void; courses: string[];
  onRemovedStudentsFound: (students: {id: number, name: string, studentId: string}[]) => void;
}) {
  const { toast } = useToast();
  const { authHeaders } = useAdminAuth();
  const [rows, setRows]               = useState<ImportRow[]>([]);
  const [isParsing, setIsParsing]     = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importDone, setImportDone]   = useState(false);
  const [progress, setProgress]       = useState(0);
  const [results, setResults]         = useState({ inserted: 0, updated: 0, failed: 0 });
  const fileRef = useRef<HTMLInputElement>(null);
  const RESUME_KEY = "import_resume_rows";

  // On mount: check sessionStorage for a paused import to resume
  useEffect(() => {
    const saved = sessionStorage.getItem(RESUME_KEY);
    if (saved) {
      try {
        const parsed: ImportRow[] = JSON.parse(saved);
        const pending = parsed.filter(r => r.status === "ready" || r.status === "update");
        if (pending.length > 0) {
          setRows(parsed);
          toast({ title: `Resuming import — ${pending.length} students still pending.` });
        } else {
          sessionStorage.removeItem(RESUME_KEY);
        }
      } catch { sessionStorage.removeItem(RESUME_KEY); }
    }
  }, []);

  const checkExisting = async (parsed: Omit<ImportRow, "status">[]) => {
    try {
      const resp = await fetch("/api/admin/students?limit=9999", { headers: authHeaders as any });
      const data = resp.ok ? await resp.json() : { students: [] };
      const existingMap = new Map((data.students ?? []).map((s: any) => [s.studentId, s]));
      const newIds = new Set(parsed.map(r => r.studentId));

      // Find students in DB not in the new file
      const removed = (data.students ?? [])
        .filter((s: any) => !newIds.has(s.studentId))
        .map((s: any) => ({ id: s.id, name: s.name, studentId: s.studentId }));
      if (removed.length > 0) onRemovedStudentsFound(removed);

      return parsed.map((row) => {
        if (!row.studentId) return { ...row, status: "error" as const, error: "Missing Student ID" };
        if (!row.name || row.name.length < 2) return { ...row, status: "error" as const, error: "Invalid name" };
        const ex: any = existingMap.get(row.studentId);
        if (ex) return { ...row, status: "update" as const, dbId: ex.id };
        return { ...row, status: "ready" as const };
      });
    } catch {
      return parsed.map((row) => ({ ...row, status: "ready" as const }));
    }
  };

  const parseFile = async (file: File) => {
    setIsParsing(true); setRows([]);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let parsed: Omit<ImportRow, "status">[] = [];
      if (ext === "csv") {
        const lines = (await file.text()).split("\n").filter(Boolean);
        const si = lines[0].toLowerCase().includes("student") ? 1 : 0;
        parsed = lines.slice(si).map((line) => {
          const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
          return { studentId: cols[0]??"", name: cols[1]??"", degree: cols[2]??"", major: cols[3]??"", yearLevel: cols[4]??"1" };
        });
      } else if (ext === "xlsx" || ext === "xls") {
        const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs" as any);
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const json: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
        const si = String(json[0]?.[0]??"").toLowerCase().includes("student") ? 1 : 0;
        parsed = json.slice(si).filter((r: any[]) => r[0]||r[1]).map((r: any[]) => ({
          studentId: String(r[0]??"").trim(), name: String(r[1]??"").trim(),
          degree: String(r[2]??"").trim(), major: String(r[3]??"").trim(),
          yearLevel: String(r[4]??"1").trim(),
        }));
      }
      const withStatus = await checkExisting(parsed);
      setRows(withStatus);
      sessionStorage.setItem(RESUME_KEY, JSON.stringify(withStatus));
    } catch { toast({ title: "Failed to parse file", variant: "destructive" }); }
    finally { setIsParsing(false); }
  };

  const handleImport = async () => {
    const validRows = rows.filter((r) => r.status === "ready" || r.status === "update");
    if (!validRows.length) return;
    setIsImporting(true);
    let inserted = 0, updated = 0, failed = 0;
    const total = validRows.length;
    const successfulDegrees: string[]    = [];
    const successfulYearLevels: string[] = [];

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      setProgress(Math.round((i / total) * 100));

      try {
        if (row.status === "update" && row.dbId) {
          const updateResp = await fetch(`/api/admin/students/${row.dbId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...(authHeaders as any) },
            body: JSON.stringify({
              studentId: row.studentId, name: row.name,
              degree: row.degree, major: row.major || null,
              yearLevel: row.yearLevel, isActive: true,
            }),
          });
          if (updateResp.ok) {
            updated++;
            if (row.degree)    successfulDegrees.push(row.degree);
            if (row.yearLevel) successfulYearLevels.push(row.yearLevel);
          } else { failed++; setRows((p) => p.map((r) => r.studentId === row.studentId ? { ...r, status: "error" as const, error: "Update failed" } : r)); }
        } else {
          const resp = await fetch("/api/admin/students", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(authHeaders as any) },
            body: JSON.stringify({
              studentId: row.studentId, name: row.name,
              degree: row.degree, major: row.major || null,
              yearLevel: row.yearLevel, isActive: true,
            }),
          });
          if (resp.ok) {
            inserted++;
            if (row.degree)    successfulDegrees.push(row.degree);
            if (row.yearLevel) successfulYearLevels.push(row.yearLevel);
          } else {
            failed++;
            const err = await resp.json();
            setRows((p) => p.map((r) => r.studentId === row.studentId ? { ...r, status: "error" as const, error: err.message || "Failed" } : r));
          }
        }
      } catch { failed++; }

      // Save progress to sessionStorage after each row — enables resume on PC restart
      const remaining = rows.filter(r => r.status === "ready" || r.status === "update").slice(i + 1);
      if (remaining.length > 0) {
        sessionStorage.setItem(RESUME_KEY, JSON.stringify(remaining));
      }
    }

    setProgress(100);
    setResults({ inserted, updated, failed });
    setImportDone(true);
    setIsImporting(false);
    sessionStorage.removeItem(RESUME_KEY);

    // Auto-sync all newly seen courses AND year levels to settings in one batch.
    // This is how Grade 1-3 appear automatically after the first import that includes them.
    if (successfulDegrees.length > 0 || successfulYearLevels.length > 0) {
      const uniqueDegrees = [...new Set(successfulDegrees)];
      const uniqueYears   = [...new Set(successfulYearLevels)];
      try {
        const sr = await fetch("/api/admin/settings/system", { headers: authHeaders as any });
        if (sr.ok) {
          const settings = await sr.json();
          const exCourses: string[] = settings.courses ?? [];
          const exYears:   string[] = settings.yearLevels ?? [];
          const newCourses = uniqueDegrees.filter(d => !exCourses.includes(d));
          const newYears   = uniqueYears.filter(y => !exYears.includes(y));
          if (newCourses.length > 0 || newYears.length > 0) {
            const updatedYears = [...exYears, ...newYears].sort((a,b) => (parseInt(a)||0)-(parseInt(b)||0));
            await fetch("/api/admin/settings/system", {
              method: "PUT",
              headers: { "Content-Type": "application/json", ...(authHeaders as any) },
              body: JSON.stringify({ ...settings, courses: [...exCourses, ...newCourses], yearLevels: updatedYears }),
            });
          }
        }
      } catch { /* non-critical */ }
    }

    if (inserted > 0 || updated > 0) onImported();
  };

  const readyCount  = rows.filter((r) => r.status === "ready").length;
  const updateCount = rows.filter((r) => r.status === "update").length;
  const errorCount  = rows.filter((r) => r.status === "error").length;
  const totalValid  = readyCount + updateCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-secondary/30">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-5 h-5 text-accent" />
            <div>
              <h3 className="font-semibold">Import Students</h3>
              <p className="text-xs text-muted-foreground">New → added. Existing → updated. New courses → auto-added to settings.</p>
            </div>
          </div>
          {!isImporting ? (
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary"><X className="w-4 h-4" /></button>
          ) : (
            <span className="text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200 px-3 py-1 rounded-lg">Import in progress — do not close</span>
          )}
        </div>

        {importDone ? (
          <div className="p-8 text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-3">Import Complete</h3>
            <div className="space-y-1 text-sm text-muted-foreground">
              {results.inserted > 0 && <p><span className="text-green-600 font-semibold">{results.inserted} new students</span> added.</p>}
              {results.updated > 0 && <p><span className="text-blue-600 font-semibold">{results.updated} existing students</span> updated.</p>}
              {results.failed > 0 && <p><span className="text-destructive font-semibold">{results.failed} failed.</span></p>}
            </div>
            <Button className="mt-6 rounded-xl" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <>
            {rows.length === 0 && !isParsing && (
              <div
                className="m-6 border-2 border-dashed border-border rounded-xl p-10 text-center cursor-pointer hover:border-accent/50 transition-all"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) parseFile(f); }}
              >
                <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
                <p className="font-medium">Drop file here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-3 font-mono">Columns: StudentID, Name, Course, Major (opt), Year Level</p>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); }} />
              </div>
            )}
            {isParsing && (
              <div className="flex items-center justify-center p-12 gap-3 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" /> Parsing and checking existing records...
              </div>
            )}
            {rows.length > 0 && (
              <>
                <div className="px-6 py-3 border-b bg-secondary/20 flex items-center gap-4 text-sm">
                  {readyCount > 0 && <span className="text-green-600 font-medium">{readyCount} new</span>}
                  {updateCount > 0 && <span className="text-blue-600 font-medium">{updateCount} update</span>}
                  {errorCount > 0 && <span className="text-destructive font-medium">{errorCount} errors</span>}
                  {!isImporting && (
                    <button onClick={() => { setRows([]); sessionStorage.removeItem(RESUME_KEY); }} className="ml-auto text-muted-foreground hover:text-foreground text-xs underline">Clear</button>
                  )}
                </div>

                {/* Progress bar */}
                {isImporting && (
                  <div className="px-6 py-3 border-b bg-blue-50">
                    <div className="flex items-center justify-between text-xs text-blue-700 mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Importing... progress is saved — safe to resume if interrupted
                      </span>
                      <span className="font-bold tabular-nums">{progress}%</span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-2.5">
                      <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}

                <div className="overflow-auto max-h-56">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-secondary/60 text-muted-foreground uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">Student ID</th>
                        <th className="px-4 py-2 text-left">Name</th>
                        <th className="px-4 py-2 text-left">Course</th>
                        <th className="px-4 py-2 text-left">Year</th>
                        <th className="px-4 py-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((r, i) => (
                        <tr key={i} className={r.status === "error" ? "bg-destructive/5" : r.status === "update" ? "bg-blue-50" : "hover:bg-secondary/20"}>
                          <td className="px-4 py-2 font-mono">{r.studentId||"—"}</td>
                          <td className="px-4 py-2">{r.name||"—"}</td>
                          <td className="px-4 py-2">{r.degree}</td>
                          <td className="px-4 py-2">{r.yearLevel}</td>
                          <td className="px-4 py-2">
                            {r.status === "error"  && <span className="text-destructive">{r.error}</span>}
                            {r.status === "update" && <span className="text-blue-600 font-medium">Update</span>}
                            {r.status === "ready"  && <span className="text-green-600 font-medium">New</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 border-t flex gap-3 justify-end bg-secondary/10">
                  {!isImporting && <Button variant="outline" onClick={onClose}>Cancel</Button>}
                  <Button
                    className="gap-2 bg-accent hover:bg-accent/90 text-white"
                    onClick={handleImport}
                    disabled={totalValid === 0 || isImporting}
                  >
                    {isImporting
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing {progress}%</>
                      : <><Upload className="w-4 h-4" /> Import {totalValid}</>}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Duplicate Modal ──────────────────────────────────────────────────────────

function DuplicateModal({ duplicates, onEdit, onContinue, onCancel }: {
  duplicates: any[]; onEdit: (s: any) => void; onContinue: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <div><h3 className="font-semibold">Possible Duplicate</h3><p className="text-xs text-muted-foreground">A student with a similar name already exists.</p></div>
        </div>
        <div className="p-4 space-y-2 max-h-48 overflow-auto">
          {duplicates.map((s) => (
            <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/40 border border-border">
              <div><p className="font-medium text-sm">{s.name}</p><p className="text-xs text-muted-foreground">{s.studentId} • {s.degree} Yr {s.yearLevel}</p></div>
              <Button size="sm" variant="outline" className="rounded-lg text-xs" onClick={() => onEdit(s)}>View / Edit</Button>
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-t flex gap-3 justify-end bg-secondary/10">
          <Button variant="outline" onClick={onCancel} className="rounded-xl">Cancel</Button>
          <Button onClick={onContinue} className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white">Register Anyway</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminStudents() {
  const { toast } = useToast();
  const { courses, yearLevels, loaded } = useSystemSettings();
  const { authHeaders } = useAdminAuth();

  const [page, setPage] = useState(1);
  const [search, setSearch]           = useState("");
  const [searchInput, setSearchInput] = useState("");

  // ── 3-level filter ──
  const [levelFilter, setLevelFilter]   = useState<EduLevel | "">("");
  const [degreeFilter, setDegreeFilter] = useState("");
  const [yearFilter, setYearFilter]     = useState("");

  // Courses filtered by selected education level
  const filteredCourses = levelFilter
    ? courses.filter((c) => getLevel(c) === levelFilter)
    : courses;

  // Year levels for the filter dropdown.
  // If a level is selected: intersect that level's full range with what's in the settings DB.
  // Falls back to DEFAULT_YEAR_RANGES (Grade 4+) if nothing imported yet for that level.
  const filteredYearLevels = levelFilter
    ? (() => {
        const range = FULL_YEAR_RANGES[levelFilter];
        const inSettings = yearLevels.filter(y => range.includes(y));
        return inSettings.length > 0 ? inSettings : DEFAULT_YEAR_RANGES[levelFilter];
      })()
    : yearLevels;

  const [showModal, setShowModal]                     = useState(false);
  const [editingId, setEditingId]                     = useState<number | null>(null);
  const [form, setForm]                               = useState<StudentForm>(emptyForm);
  const [formError, setFormError]                     = useState("");
  const [showDuplicate, setShowDuplicate]             = useState(false);
  const [duplicateCandidates, setDuplicateCandidates] = useState<any[]>([]);
  const [deleteConfirmId, setDeleteConfirmId]         = useState<number | null>(null);
  const [showImport, setShowImport]                   = useState(false);
  const [removedStudents, setRemovedStudents] = useState<{id: number, name: string, studentId: string}[]>([]);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const { data, isLoading, refetch } = useListStudents({
    page, limit: 50,
    ...(search       ? { search }              : {}),
    ...(degreeFilter ? { degree: degreeFilter } : {}),
    ...(yearFilter   ? { yearLevel: yearFilter } : {}),
  });

  const createMutation = useCreateStudent();
  const updateMutation = useUpdateStudent();
  const deleteMutation = useDeleteStudent();
  const totalPages = data ? Math.ceil(data.total / 50) : 1;

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, degree: filteredCourses[0] ?? "", yearLevel: filteredYearLevels[0] ?? "" });
    setFormError(""); setShowModal(true);
  };

  const openEdit = (s: any) => {
    const { first, middle, last } = splitName(s.name);
    setEditingId(s.id);
    setForm({ studentId: s.studentId, firstName: first, middleName: middle, lastName: last, degree: s.degree||"", major: s.major||"", yearLevel: s.yearLevel||"", isActive: s.isActive });
    setFormError(""); setShowModal(true); setShowDuplicate(false);
  };

  const doSave = useCallback(() => {
    const fullName = joinName(form.firstName, form.middleName, form.lastName);
    const payload  = { studentId: form.studentId.trim(), name: fullName, degree: form.degree, major: form.major||null, yearLevel: form.yearLevel, isActive: form.isActive };
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, data: payload }, {
        onSuccess: () => { toast({ title: "Student updated." }); setShowModal(false); refetch(); },
        onError: (e: any) => setFormError(e?.response?.data?.message || "Failed to update."),
      });
    } else {
      createMutation.mutate({ data: payload }, {
        onSuccess: () => { toast({ title: "Student registered." }); setShowModal(false); refetch(); },
        onError: (e: any) => setFormError(e?.response?.data?.message || "Failed to register."),
      });
    }
  }, [form, editingId]);

  const handleSave = async () => {
    if (!form.studentId.trim()) { setFormError("Student ID is required."); return; }
    if (!/^\d{2}-\d{5}$/.test(form.studentId.trim())) { setFormError("Student ID must be YY-NNNNN format (e.g. 24-12913)."); return; }
    if (!form.firstName.trim()) { setFormError("First name is required."); return; }
    if (!form.lastName.trim())  { setFormError("Last name is required."); return; }
    if (!form.degree)           { setFormError("Course is required."); return; }
    if (!form.yearLevel)        { setFormError("Year level is required."); return; }
    setFormError("");
    if (editingId === null) {
      const possible = data?.students?.filter((s: any) => s.name.toLowerCase().includes(form.lastName.toLowerCase())) ?? [];
      if (possible.length > 0) { setDuplicateCandidates(possible); setShowDuplicate(true); return; }
    }
    doSave();
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate({ id }, {
      onSuccess: () => { toast({ title: "Student removed." }); setDeleteConfirmId(null); refetch(); },
      onError: () => { toast({ title: "Failed to delete.", variant: "destructive" }); setDeleteConfirmId(null); },
    });
  };

  const handleLevelChange = (lv: EduLevel | "") => {
    setLevelFilter(lv); setDegreeFilter(""); setYearFilter(""); setPage(1);
  };

  const inputCls = "w-full h-11 px-4 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm";

  // Delete students not in new import file
  const handleRemoveOldStudents = async () => {
    for (const s of removedStudents) {
      try {
        await fetch(`/api/admin/students/${s.id}`, {
          method: "DELETE",
          headers: authHeaders as any,
        });
      } catch { }
    }
    setShowRemoveConfirm(false);
    setRemovedStudents([]);
    toast({ title: `${removedStudents.length} students removed from the system.` });
  };

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6 h-full">

        {/* ── Remove Students Confirmation Dialog ── */}
        {showRemoveConfirm && removedStudents.length > 0 && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-background rounded-2xl shadow-xl max-w-md w-full p-6">
              <h3 className="text-lg font-bold text-foreground mb-2">Remove Old Students?</h3>
              <p className="text-sm text-muted-foreground mb-4">
                <span className="font-semibold text-destructive">{removedStudents.length} student{removedStudents.length > 1 ? "s" : ""}</span> in the database are not in the new file. Do you want to remove them?
              </p>
              <div className="max-h-40 overflow-y-auto border border-border rounded-xl mb-4">
                {removedStudents.slice(0, 20).map((s) => (
                  <div key={s.id} className="px-3 py-2 text-xs border-b border-border last:border-0">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground ml-2">{s.studentId}</span>
                  </div>
                ))}
                {removedStudents.length > 20 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">...and {removedStudents.length - 20} more</div>
                )}
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => { setShowRemoveConfirm(false); setRemovedStudents([]); }}
                  className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-muted transition-colors"
                >
                  Keep All
                </button>
                <button
                  onClick={handleRemoveOldStudents}
                  className="px-4 py-2 rounded-xl bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors"
                >
                  Remove {removedStudents.length} Students
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex gap-2 flex-1 flex-wrap">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type="text" value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (setSearch(searchInput), setPage(1))}
                placeholder="Search by ID or name..."
                className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>

            {/* Filter 1: Education Level */}
            <select value={levelFilter} onChange={(e) => handleLevelChange(e.target.value as EduLevel | "")}
              className="h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none">
              <option value="">All Levels</option>
              {LEVEL_ORDER.map((lv) => <option key={lv} value={lv}>{lv}</option>)}
            </select>

            {/* Filter 2: Course (auto-filtered by level) */}
            <select value={degreeFilter} onChange={(e) => { setDegreeFilter(e.target.value); setPage(1); }}
              className="h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none"
              disabled={filteredCourses.length === 0}>
              <option value="">All Courses</option>
              {filteredCourses.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>

            {/* Filter 3: Year Level (auto-range by level) */}
            <select value={yearFilter} onChange={(e) => { setYearFilter(e.target.value); setPage(1); }}
              className="h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none">
              <option value="">All Years</option>
              {filteredYearLevels.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>

            <Button size="sm" variant="outline" onClick={() => { setSearch(searchInput); setPage(1); }} className="h-10 px-4 rounded-xl">Search</Button>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" onClick={() => setShowImport(true)} className="gap-2 rounded-xl"><Upload className="w-4 h-4" /> Import</Button>
            <Button onClick={openCreate} className="gap-2 rounded-xl" disabled={!loaded}><UserPlus className="w-4 h-4" /> Register Student</Button>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="bg-card rounded-2xl shadow-sm border border-border flex flex-col overflow-hidden">
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-5 py-4 font-semibold text-muted-foreground">Student ID</th>
                  <th className="text-left px-5 py-4 font-semibold text-muted-foreground">Name</th>
                  <th className="text-left px-5 py-4 font-semibold text-muted-foreground">Course</th>
                  <th className="text-left px-5 py-4 font-semibold text-muted-foreground">Year / Grade</th>
                  <th className="text-left px-5 py-4 font-semibold text-muted-foreground">Status</th>
                  <th className="text-right px-5 py-4 font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} className="text-center py-16 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading...</td></tr>
                ) : !data?.students?.length ? (
                  <tr><td colSpan={6} className="text-center py-16 text-muted-foreground">No students found. <button onClick={openCreate} className="text-primary underline ml-1">Register one.</button></td></tr>
                ) : (
                  groupStudents(data.students).flatMap(({ level, students: grp }) => [
                    <tr key={`hdr-${level}`}>
                      <td colSpan={6} className="px-5 py-2">
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-white text-xs font-bold uppercase tracking-widest ${LEVEL_STYLES[level].header}`}>
                          <span>{level}</span>
                          <span className="ml-auto font-normal opacity-80">{grp.length} student{grp.length !== 1 ? "s" : ""}</span>
                        </div>
                      </td>
                    </tr>,
                    ...grp.map((s: any) => (
                      <tr key={s.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3 font-mono text-foreground font-medium">{s.studentId}</td>
                        <td className="px-5 py-3 text-foreground max-w-[220px] truncate">{s.name}</td>
                        <td className="px-5 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getDegreeColor(s.degree)}`}>{getDegreeLabel(s.degree, s.major)}</span></td>
                        <td className="px-5 py-3 font-medium">{s.yearLevel}</td>
                        <td className="px-5 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${s.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>{s.isActive ? "Active" : "Inactive"}</span></td>
                        <td className="px-5 py-3">
                          <div className="flex gap-2 justify-end">
                            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={() => openEdit(s)}><Pencil className="w-4 h-4 text-muted-foreground" /></Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={() => setDeleteConfirmId(s.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                          </div>
                        </td>
                      </tr>
                    )),
                  ])
                )}
              </tbody>
            </table>
          </div>
          {data && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/20 text-sm text-muted-foreground">
              <span>{data.total.toLocaleString()} students total</span>
              <div className="flex gap-2 items-center">
                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" disabled={page<=1} onClick={() => setPage(p=>p-1)}><ChevronLeft className="w-4 h-4" /></Button>
                <span>Page {page} of {totalPages}</span>
                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" disabled={page>=totalPages} onClick={() => setPage(p=>p+1)}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Student Form Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-lg p-6 relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            <h2 className="text-xl font-display font-bold mb-5">{editingId !== null ? "Edit Student" : "Register Student"}</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Student ID <span className="text-destructive">*</span></label>
                <input type="text" value={form.studentId} maxLength={8}
                  onChange={(e) => setForm(f => ({ ...f, studentId: formatStudentId(e.target.value) }))}
                  placeholder="e.g. 24-12913" className={inputCls + " font-mono tracking-widest"} />
                <p className="text-xs text-muted-foreground mt-1 ml-1">Format: YY-NNNNN</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Full Name <span className="text-destructive">*</span></label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <input type="text" value={form.lastName} onChange={(e) => setForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Last Name" className={inputCls} />
                    <p className="text-xs text-muted-foreground mt-0.5 ml-1">Last</p>
                  </div>
                  <div>
                    <input type="text" value={form.firstName} onChange={(e) => setForm(f => ({ ...f, firstName: e.target.value }))} placeholder="First Name" className={inputCls} />
                    <p className="text-xs text-muted-foreground mt-0.5 ml-1">First</p>
                  </div>
                  <div>
                    <input type="text" value={form.middleName} maxLength={20} onChange={(e) => setForm(f => ({ ...f, middleName: e.target.value }))} placeholder="Middle (opt)" className={inputCls} />
                    <p className="text-xs text-muted-foreground mt-0.5 ml-1">Middle / M.I.</p>
                  </div>
                </div>
                {(form.firstName || form.lastName) && (
                  <p className="text-xs text-muted-foreground mt-1.5 ml-1">Stored as: <span className="font-medium text-foreground">{joinName(form.firstName, form.middleName, form.lastName)}</span></p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">Course <span className="text-destructive">*</span></label>
                  <select value={form.degree} onChange={(e) => setForm(f => ({ ...f, degree: e.target.value, yearLevel: "" }))} className={inputCls}>
                    <option value="">Select course...</option>
                    {courses.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">Year / Grade <span className="text-destructive">*</span></label>
                  <select value={form.yearLevel} onChange={(e) => setForm(f => ({ ...f, yearLevel: e.target.value }))} className={inputCls}>
                    <option value="">Select level...</option>
                    {(form.degree
                      ? (() => {
                          const level = getLevel(form.degree);
                          const fullRange = FULL_YEAR_RANGES[level];
                          if (!fullRange || fullRange.length === 0) return yearLevels;
                          const inSettings = yearLevels.filter(y => fullRange.includes(y));
                          return inSettings.length > 0 ? inSettings : DEFAULT_YEAR_RANGES[level];
                        })()
                      : yearLevels
                    ).map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input id="isActive" type="checkbox" checked={form.isActive} onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))} className="w-4 h-4 rounded border-border" />
                <label htmlFor="isActive" className="text-sm font-medium text-foreground cursor-pointer">Active student</label>
              </div>
              {formError && <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-2">{formError}</p>}
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button className="flex-1 rounded-xl" onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingId !== null ? "Save Changes" : "Register"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showDuplicate && (
        <DuplicateModal duplicates={duplicateCandidates}
          onEdit={(s) => { setShowDuplicate(false); openEdit(s); }}
          onContinue={() => { setShowDuplicate(false); doSave(); }}
          onCancel={() => setShowDuplicate(false)} />
      )}

      {deleteConfirmId !== null && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-sm p-6 text-center">
            <Trash2 className="w-10 h-10 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-bold mb-2">Remove Student?</h2>
            <p className="text-muted-foreground text-sm mb-6">This permanently deletes the student. Session history is preserved.</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
              <Button variant="destructive" className="flex-1 rounded-xl" onClick={() => handleDelete(deleteConfirmId)} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={() => refetch()}
          courses={courses}
          onRemovedStudentsFound={(students) => { setRemovedStudents(students); setShowRemoveConfirm(true); }}
        />
      )}
    </AdminLayout>
  );
}