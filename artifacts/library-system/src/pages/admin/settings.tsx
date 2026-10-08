import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { useAdminAuth } from "@/hooks/use-auth";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import {
  Loader2, Clock, BookOpen, GraduationCap, Plus, X, Save,
  Monitor, Wifi, RefreshCw, Trash2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type SystemSettings = {
  inactivityLimitMinutes: number;
  sessionTimeLimitMinutes: number;
  totalComputers: number;
  courses: string[];
  yearLevels: string[];
};

interface PcMapping {
  pcNumber: number;
  ipAddress: string;
  label?: string | null;
}

type Tab = "time" | "courses" | "years" | "pc";

// ─── Shared input style ───────────────────────────────────────────────────────

const inputCls =
  "w-full h-11 px-4 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm";

// ─── PC Mapping Tab ───────────────────────────────────────────────────────────

function PcMappingTab({ authHeaders }: { authHeaders: Record<string, string> }) {
  const { toast } = useToast();
  const [mappings, setMappings]   = useState<PcMapping[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [newPc, setNewPc]         = useState("");
  const [newIp, setNewIp]         = useState("");
  const [newLabel, setNewLabel]   = useState("");
  const [formError, setFormError] = useState("");

  const fetchMappings = async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/admin/settings/pc-mappings", { headers: authHeaders });
      const data = resp.ok ? await resp.json() : { mappings: [] };
      setMappings((data.mappings ?? []).sort((a: PcMapping, b: PcMapping) => a.pcNumber - b.pcNumber));
    } catch {
      toast({ title: "Failed to load PC mappings", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMappings(); }, []);

  const handleAdd = async () => {
    setFormError("");
    const pc = parseInt(newPc);
    if (!newPc || isNaN(pc) || pc < 1 || pc > 100) {
      setFormError("PC number must be between 1 and 100.");
      return;
    }
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(newIp)) {
      setFormError("Invalid IP format. Example: 192.168.1.102");
      return;
    }

    // Validate each octet is 0-255
    const octets = newIp.split(".").map(Number);
    if (octets.some(o => o < 0 || o > 255)) {
      setFormError("Each IP number must be between 0 and 255.");
      return;
    }
    setSaving(true);
    try {
      const resp = await fetch("/api/admin/settings/pc-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ pcNumber: pc, ipAddress: newIp, label: newLabel || null }),
      });
      if (!resp.ok) {
        const e = await resp.json();
        setFormError(e.message ?? "Failed to save.");
        return;
      }
      toast({ title: `PC ${pc} mapped to ${newIp}.` });
      setNewPc(""); setNewIp(""); setNewLabel("");
      fetchMappings();
    } catch {
      setFormError("Connection error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (pcNumber: number) => {
    try {
      await fetch(`/api/admin/settings/pc-mappings/${pcNumber}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      toast({ title: `PC ${pcNumber} mapping removed.` });
      fetchMappings();
    } catch {
      toast({ title: "Failed to remove mapping.", variant: "destructive" });
    }
  };

  // Detects this PC's own IP from the server, auto-fills the IP field
  const handleDetect = async () => {
    setDetecting(true);
    try {
      const resp = await fetch("/api/admin/settings/pc-mappings/detect");
      const data = await resp.json();
      if (data.pcNumber && !data.isFallback) {
        toast({ title: `This PC is already mapped as PC ${data.pcNumber} (${data.ipAddress})` });
      } else if (data.detectedIp) {
        setNewIp(data.detectedIp);
        toast({ title: `Detected IP: ${data.detectedIp} — enter the PC number and save.` });
      } else {
        toast({ title: "Could not detect IP. Enter it manually.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Detection failed. Check server connection.", variant: "destructive" });
    } finally {
      setDetecting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">

      {/* Description + detect button */}
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground max-w-md">
          Assign each kiosk PC's IP address to a PC number. The system uses this to
          automatically identify which PC a student is logging in from.
        </p>
        <Button
          variant="outline" size="sm"
          onClick={handleDetect}
          disabled={detecting}
          className="gap-2 rounded-xl shrink-0"
        >
          {detecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
          Detect This PC's IP
        </Button>
      </div>

      {/* Add / update form */}
      <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground">Add / Update PC Mapping</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              PC Number <span className="text-destructive">*</span>
            </label>
            <input
              type="number" min={1} max={100}
              value={newPc}
              onChange={(e) => { setNewPc(e.target.value); setFormError(""); }}
              placeholder="e.g. 2"
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              IP Address <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={newIp}
              onChange={(e) => {
                // Only allow numbers and dots
                const val = e.target.value.replace(/[^0-9.]/g, "");
                setNewIp(val);
                setFormError("");
              }}
              placeholder="e.g. 192.168.1.102"
              className={inputCls}
              maxLength={15}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Label (optional)</label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Near window"
              className={inputCls}
            />
          </div>
        </div>
        {formError && <p className="text-sm text-destructive">{formError}</p>}
        <Button
          onClick={handleAdd}
          disabled={saving || !newPc || !newIp}
          className="gap-2 rounded-xl"
        >
          {saving
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
            : <><Plus className="w-4 h-4" /> Add Mapping</>}
        </Button>
      </div>

      {/* Mappings list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-foreground">
            {mappings.length} PC{mappings.length !== 1 ? "s" : ""} mapped
          </p>
          <Button
            variant="ghost" size="sm"
            onClick={fetchMappings}
            className="gap-1 text-xs rounded-lg h-8"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
          </div>
        ) : mappings.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
            No PCs mapped yet. Click "Detect This PC's IP" on each kiosk then add the mapping above.
          </div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-4 px-4 py-2 bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <span>PC #</span>
              <span>IP Address</span>
              <span>Label</span>
              <span className="text-right">Remove</span>
            </div>
            {mappings.map((m) => (
              <div
                key={m.pcNumber}
                className="grid grid-cols-4 px-4 py-3 items-center border-t border-border hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Monitor className="w-4 h-4 text-primary" />
                  </div>
                  <span className="font-bold text-foreground">PC {m.pcNumber}</span>
                </div>
                <span className="font-mono text-sm">{m.ipAddress}</span>
                <span className="text-sm text-muted-foreground truncate">{m.label ?? "—"}</span>
                <div className="flex justify-end">
                  <Button
                    size="icon" variant="ghost"
                    className="h-8 w-8 rounded-lg"
                    onClick={() => handleDelete(m.pcNumber)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* How-to guide */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1.5">
        <p className="font-semibold">How to map all 20 kiosk PCs:</p>
        <p>1. On each kiosk PC, open the admin panel → Settings → PC Mapping tab</p>
        <p>2. Click <strong>"Detect This PC's IP"</strong> — it auto-fills the IP field</p>
        <p>3. Type the PC number (1, 2, 3...) → click <strong>Add Mapping</strong></p>
        <p>4. Or find IP manually: open Command Prompt → type <code className="bg-blue-100 px-1 rounded font-mono">ipconfig</code> → use the IPv4 address</p>
      </div>
    </div>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────

export default function SettingsPage() {
  const { authHeaders } = useAdminAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<Tab>("time");
  const [settings, setSettings]   = useState<SystemSettings | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [newCourse, setNewCourse] = useState("");
  const [newYear, setNewYear]     = useState("");

  useEffect(() => {
    fetch("/api/admin/settings/system", { headers: authHeaders as any })
      .then((r) => r.json())
      .then((d) => { setSettings(d); setLoading(false); })
      .catch(() => {
        toast({ title: "Failed to load settings", variant: "destructive" });
        setLoading(false);
      });
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const resp = await fetch("/api/admin/settings/system", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(authHeaders as any) },
        body: JSON.stringify(settings),
      });
      if (!resp.ok) throw new Error();
      toast({ title: "Settings saved successfully." });
    } catch {
      toast({ title: "Failed to save settings", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addCourse = () => {
    const v = newCourse.trim().toUpperCase();
    if (!v || !settings) return;
    if (settings.courses.includes(v)) {
      toast({ title: "Course already exists", variant: "destructive" });
      return;
    }
    setSettings({ ...settings, courses: [...settings.courses, v] });
    setNewCourse("");
  };

  const removeCourse = (i: number) => {
    if (!settings) return;
    setSettings({ ...settings, courses: settings.courses.filter((_, idx) => idx !== i) });
  };

  const addYear = () => {
    const v = newYear.trim();
    if (!v || !settings) return;
    if (settings.yearLevels.includes(v)) {
      toast({ title: "Year level already exists", variant: "destructive" });
      return;
    }
    // Insert numerically sorted
    const updated = [...settings.yearLevels, v].sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
    setSettings({ ...settings, yearLevels: updated });
    setNewYear("");
  };

  const removeYear = (i: number) => {
    if (!settings) return;
    setSettings({ ...settings, yearLevels: settings.yearLevels.filter((_, idx) => idx !== i) });
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "time",    label: "Time Limits", icon: <Clock className="w-4 h-4" /> },
    { id: "courses", label: "Courses",     icon: <BookOpen className="w-4 h-4" /> },
    { id: "years",   label: "Year Levels", icon: <GraduationCap className="w-4 h-4" /> },
    { id: "pc",      label: "PC Mapping",  icon: <Monitor className="w-4 h-4" /> },
  ];

  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto space-y-6">

        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">System Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure session limits, courses, year levels, and PC IP mappings.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground gap-3">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading settings...
          </div>
        ) : !settings ? (
          <div className="text-center py-24 text-destructive">Failed to load settings. Reload the page.</div>
        ) : (
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">

            {/* Tab bar */}
            <div className="flex border-b border-border bg-muted/30 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-5 py-4 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                    activeTab === tab.id
                      ? "border-primary text-primary bg-background"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── TIME LIMITS TAB ── */}
            {activeTab === "time" && (
              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground block">
                    Inactivity Timeout
                    <span className="text-muted-foreground font-normal ml-1">(minutes)</span>
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Student is auto-logged out after this many minutes of no mouse/keyboard activity.
                  </p>
                  <input
                    type="number" min={1} max={120}
                    value={settings.inactivityLimitMinutes}
                    onChange={(e) => setSettings({ ...settings, inactivityLimitMinutes: Number(e.target.value) })}
                    className={inputCls + " max-w-xs"}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground block">
                    Max Session Duration
                    <span className="text-muted-foreground font-normal ml-1">(minutes)</span>
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Maximum time a student can stay logged in per session regardless of activity.
                  </p>
                  <input
                    type="number" min={1} max={480}
                    value={settings.sessionTimeLimitMinutes}
                    onChange={(e) => setSettings({ ...settings, sessionTimeLimitMinutes: Number(e.target.value) })}
                    className={inputCls + " max-w-xs"}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground block">
                    Total Computers
                    <span className="text-muted-foreground font-normal ml-1">(kiosk PCs)</span>
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Number of computers shown on the dashboard grid and validated against at login.
                    Must match the number of physical kiosk PCs in the library.
                  </p>
                  <input
                    type="number" min={1} max={100}
                    value={settings.totalComputers}
                    onChange={(e) => setSettings({ ...settings, totalComputers: Number(e.target.value) })}
                    className={inputCls + " max-w-xs"}
                  />
                </div>

                <div className="pt-4 border-t border-border flex justify-end">
                  <Button onClick={save} disabled={saving} className="gap-2 rounded-xl">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? "Saving..." : "Save Time Limits"}
                  </Button>
                </div>
              </div>
            )}

            {/* ── COURSES TAB ── */}
            {activeTab === "courses" && (
              <div className="p-6 space-y-5">
                <p className="text-sm text-muted-foreground">
                  These courses appear in student registration, the admin student form, and all filters.
                  Course codes are stored in uppercase (e.g. BSIT, SHS, JHS).
                </p>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCourse}
                    onChange={(e) => setNewCourse(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCourse()}
                    placeholder="e.g. BSCS or SHS"
                    className={inputCls}
                  />
                  <Button onClick={addCourse} className="gap-2 rounded-xl shrink-0" disabled={!newCourse.trim()}>
                    <Plus className="w-4 h-4" /> Add
                  </Button>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {settings.courses.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">No courses yet. Add one above.</p>
                  )}
                  {settings.courses.map((c, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3 rounded-xl bg-secondary/40 border border-border group">
                      <span className="text-sm font-medium text-foreground font-mono">{c}</span>
                      <button
                        onClick={() => removeCourse(i)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-border flex justify-end">
                  <Button onClick={save} disabled={saving} className="gap-2 rounded-xl">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? "Saving..." : "Save Courses"}
                  </Button>
                </div>
              </div>
            )}

            {/* ── YEAR LEVELS TAB ── */}
            {activeTab === "years" && (
              <div className="p-6 space-y-5">
                <p className="text-sm text-muted-foreground">
                  Year/grade levels used across the system. Enter numbers only (e.g. 4, 9, 11).
                  They are sorted numerically automatically. New grades appear here after import.
                </p>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newYear}
                    onChange={(e) => setNewYear(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addYear()}
                    placeholder="e.g. 4 or 11"
                    className={inputCls}
                  />
                  <Button onClick={addYear} className="gap-2 rounded-xl shrink-0" disabled={!newYear.trim()}>
                    <Plus className="w-4 h-4" /> Add
                  </Button>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {settings.yearLevels.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">No year levels yet. Add one above.</p>
                  )}
                  {settings.yearLevels.map((y, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3 rounded-xl bg-secondary/40 border border-border group">
                      <span className="text-sm font-medium text-foreground">Grade / Year {y}</span>
                      <button
                        onClick={() => removeYear(i)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-border flex justify-end">
                  <Button onClick={save} disabled={saving} className="gap-2 rounded-xl">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? "Saving..." : "Save Year Levels"}
                  </Button>
                </div>
              </div>
            )}

            {/* ── PC MAPPING TAB ── */}
            {activeTab === "pc" && (
              <PcMappingTab authHeaders={authHeaders as Record<string, string>} />
            )}

          </div>
        )}
      </div>
    </AdminLayout>
  );
}