import { useState } from "react";
import { useAdminAuth } from "@/hooks/use-auth";
import { AdminLayout } from "@/components/layout/admin-layout";
import { useListAdmins } from "@workspace/api-client-react";
import {
  ShieldPlus, Pencil, Trash2, X, Eye, EyeOff,
  ShieldCheck, Shield, Clock, Loader2, ShieldAlert, ShieldOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { formatDateTime } from "@/lib/utils";

interface AdminForm {
  username: string;
  password: string;
  secretCode: string;
  role: "librarian" | "super_admin";
  isActive: boolean;
}

const emptyForm: AdminForm = { username: "", password: "", secretCode: "", role: "librarian", isActive: true };

function RoleBadge({ role }: { role: string }) {
  if (role === "super_admin") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-accent/10 text-accent border border-accent/20">
        <ShieldCheck className="w-3 h-3" /> Super Admin
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-secondary text-muted-foreground border border-border">
      <Shield className="w-3 h-3" /> Librarian
    </span>
  );
}

function LastLoginCell({ lastLoginAt }: { lastLoginAt?: string | null }) {
  if (!lastLoginAt) return <span className="text-muted-foreground/50 text-xs italic">Never</span>;
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Clock className="w-3 h-3 shrink-0" />
      {formatDateTime(lastLoginAt)}
    </div>
  );
}

export default function AdminsPage() {
  const { toast } = useToast();
  // FIX: get authHeaders from useAdminAuth so we can attach them to every request
  const { authHeaders } = useAdminAuth();

  const loggedInUsername = localStorage.getItem("admin_username") ?? "";
  const loggedInRole     = localStorage.getItem("admin_role")     ?? "librarian";
  const isSuperAdmin     = loggedInRole === "super_admin";

  const [protectSuperAdmins, setProtectSuperAdmins] = useState(true);
  const [showModal,       setShowModal]       = useState(false);
  const [editingId,       setEditingId]       = useState<number | null>(null);
  const [form,            setForm]            = useState<AdminForm>(emptyForm);
  const [formError,       setFormError]       = useState("");
  const [showPassword,    setShowPassword]    = useState(false);
  const [showSecretCode,  setShowSecretCode]  = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleteTargetName,setDeleteTargetName]= useState("");
  const [isDeleting,      setIsDeleting]      = useState(false);
  const [isSaving,        setIsSaving]        = useState(false);
  const [togglingId,      setTogglingId]      = useState<number | null>(null);

  const { data, isLoading, refetch } = useListAdmins();

  const openCreate = () => {
    setEditingId(null); setForm(emptyForm); setFormError("");
    setShowPassword(false); setShowSecretCode(false); setShowModal(true);
  };

  const openEdit = (a: any) => {
    setEditingId(a.id);
    setForm({ username: a.username, password: "", secretCode: "", role: a.role ?? "librarian", isActive: a.isActive });
    setFormError(""); setShowPassword(false); setShowSecretCode(false); setShowModal(true);
  };

  // FIX: toggle active uses direct fetch with authHeaders (not api-client-react mutation)
  const handleToggleActive = async (a: any) => {
    setTogglingId(a.id);
    try {
      const token = localStorage.getItem("admin_token");
      const resp = await fetch(`/api/admin/admins/${a.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({ isActive: !a.isActive }),
      });
      if (resp.ok) {
        toast({ title: a.isActive ? `${a.username} deactivated.` : `${a.username} activated.` });
        refetch();
      } else {
        toast({ title: "Failed to update status.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Connection error.", variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
  };

  // handleSave uses a direct fetch so it can send the Bearer token explicitly.
  // Authorization is decided server-side from that token.
  const handleSave = async () => {
    if (form.username.trim().length < 3) { setFormError("Username must be at least 3 characters."); return; }
    if (editingId === null && form.password.length < 8) { setFormError("Password must be at least 8 characters."); return; }
    if (editingId === null && form.secretCode.trim().length < 6) { setFormError("Secret code must be at least 6 characters."); return; }
    setFormError("");
    setIsSaving(true);

    const token = localStorage.getItem("admin_token");
    const headers = {
      "Content-Type": "application/json",
      "Authorization": token ? `Bearer ${token}` : "",
    };

    try {
      if (editingId !== null) {
        // Edit existing admin
        const payload: any = { username: form.username, role: form.role, isActive: form.isActive };
        if (form.password)   payload.password   = form.password;
        if (form.secretCode) payload.secretCode = form.secretCode;

        const resp = await fetch(`/api/admin/admins/${editingId}`, {
          method: "PUT", headers, body: JSON.stringify(payload),
        });
        const result = await resp.json();
        if (!resp.ok) {
          setFormError(result?.message || "Failed to update admin.");
        } else {
          toast({ title: "Admin account updated." });
          setShowModal(false);
          refetch();
        }
      } else {
        // Create new admin
        const payload: any = {
          username: form.username,
          password: form.password,
          role: form.role,
          isActive: form.isActive,
          secretCode: form.secretCode,
        };

        const resp = await fetch("/api/admin/admins", {
          method: "POST", headers, body: JSON.stringify(payload),
        });
        const result = await resp.json();
        if (!resp.ok) {
          setFormError(result?.message || "Failed to create admin.");
        } else {
          toast({ title: "Admin account created." });
          setShowModal(false);
          refetch();
        }
      }
    } catch {
      setFormError("Connection error. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = (a: any) => {
    if (!isSuperAdmin) {
      toast({ title: "Permission Denied", description: "Only Super Admins can delete accounts.", variant: "destructive" });
      return;
    }
    if (protectSuperAdmins && a.role === "super_admin") {
      toast({ title: "Deletion Blocked", description: "Turn off Super Admin protection first.", variant: "destructive" });
      return;
    }
    setDeleteConfirmId(a.id);
    setDeleteTargetName(a.username);
  };

  const handleDelete = async (id: number) => {
    setIsDeleting(true);
    try {
      const token = localStorage.getItem("admin_token");
      const resp  = await fetch(`/api/admin/admins/${id}`, {
        method: "DELETE",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({ protectSuperAdmins }),
      });
      const result = await resp.json();
      if (!resp.ok) {
        toast({ title: "Failed to delete.", description: result?.message || "Please try again.", variant: "destructive" });
      } else {
        toast({ title: "Admin account removed." });
        refetch();
      }
    } catch {
      toast({ title: "Connection error.", variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setDeleteConfirmId(null);
    }
  };

  const inputCls = "w-full h-11 px-4 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm";

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6 h-full">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-muted-foreground text-sm">
              Manage librarian accounts that can access the admin dashboard.
            </p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs text-muted-foreground">Logged in as:</span>
              <span className="text-xs font-semibold text-foreground">{loggedInUsername || "—"}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isSuperAdmin ? "bg-accent/10 text-accent" : "bg-secondary text-muted-foreground"}`}>
                {isSuperAdmin ? "Super Admin" : "Librarian"}
              </span>
              {!isSuperAdmin && (
                <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                  Read-only — cannot create/edit/delete
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {isSuperAdmin && (
              <button
                onClick={() => setProtectSuperAdmins(v => !v)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all
                  ${protectSuperAdmins
                    ? "bg-accent/10 border-accent/30 text-accent hover:bg-accent/20"
                    : "bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/20"}`}
              >
                {protectSuperAdmins
                  ? <><ShieldAlert className="w-4 h-4" /> Super Admin Protection: ON</>
                  : <><ShieldOff   className="w-4 h-4" /> Super Admin Protection: OFF</>}
              </button>
            )}
            {isSuperAdmin && (
              <Button onClick={openCreate} className="gap-2 rounded-xl shrink-0">
                <ShieldPlus className="w-4 h-4" /> Add Admin
              </Button>
            )}
          </div>
        </div>

        {isSuperAdmin && !protectSuperAdmins && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            <ShieldOff className="w-4 h-4 shrink-0" />
            <span><strong>Protection is OFF.</strong> Super Admin accounts can now be deleted. Re-enable when done.</span>
          </div>
        )}

        {/* Table */}
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-5 py-4 font-semibold text-muted-foreground">Username</th>
                <th className="text-left px-5 py-4 font-semibold text-muted-foreground">Role</th>
                <th className="text-left px-5 py-4 font-semibold text-muted-foreground">Status</th>
                <th className="text-left px-5 py-4 font-semibold text-muted-foreground">Last Login</th>
                <th className="text-left px-5 py-4 font-semibold text-muted-foreground">Created</th>
                <th className="text-right px-5 py-4 font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading...
                </td></tr>
              ) : !data?.admins?.length ? (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">
                  No admin accounts found.{" "}
                  {isSuperAdmin && <button onClick={openCreate} className="text-primary underline">Add one.</button>}
                </td></tr>
              ) : (
                data.admins.map((a: any) => {
                  const isProtectedSuperAdmin = protectSuperAdmins && a.role === "super_admin";
                  const isCurrentUser = a.username === loggedInUsername;
                  return (
                    <tr key={a.id} className={`border-b border-border/50 transition-colors ${a.isActive ? "hover:bg-muted/20" : "opacity-60 hover:bg-muted/10"}`}>
                      <td className="px-5 py-3 font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full inline-block ${a.isActive ? "bg-green-400" : "bg-muted-foreground/30"}`} />
                          {a.username}
                          {isCurrentUser && (
                            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">You</span>
                          )}
                          {isProtectedSuperAdmin && isSuperAdmin && (
                            <span title="Protected"><ShieldAlert className="w-3.5 h-3.5 text-accent/60" /></span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3"><RoleBadge role={a.role ?? "librarian"} /></td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => isSuperAdmin && handleToggleActive(a)}
                          disabled={togglingId === a.id || !isSuperAdmin}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all
                            ${isSuperAdmin ? "hover:opacity-80 active:scale-95 cursor-pointer" : "cursor-default"}
                            ${a.isActive ? "bg-green-100 text-green-700 border-green-200" : "bg-red-100 text-red-600 border-red-200"}`}
                        >
                          {togglingId === a.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <span className={`w-1.5 h-1.5 rounded-full ${a.isActive ? "bg-green-500" : "bg-red-400"}`} />}
                          {a.isActive ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="px-5 py-3"><LastLoginCell lastLoginAt={a.lastLoginAt} /></td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">{formatDateTime(a.createdAt)}</td>
                      <td className="px-5 py-3">
                        {isSuperAdmin ? (
                          <div className="flex gap-2 justify-end">
                            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={() => openEdit(a)}>
                              <Pencil className="w-4 h-4 text-muted-foreground" />
                            </Button>
                            <Button
                              size="icon" variant="ghost"
                              className={`h-8 w-8 rounded-lg ${isProtectedSuperAdmin ? "opacity-30 cursor-not-allowed" : ""}`}
                              onClick={() => confirmDelete(a)}
                              title={isProtectedSuperAdmin ? "Super Admin protection is ON" : "Delete admin"}
                            >
                              {isProtectedSuperAdmin
                                ? <ShieldAlert className="w-4 h-4 text-muted-foreground" />
                                : <Trash2      className="w-4 h-4 text-destructive" />}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground text-right block pr-2">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Admin Form Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-md p-6 relative">
            <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-display font-bold mb-5">
              {editingId !== null ? "Edit Admin Account" : "Add Admin Account"}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Username <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm(f => ({ ...f, username: e.target.value }))}
                  placeholder="e.g. librarian01"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Password <span className="text-destructive">*</span>
                  {editingId !== null && <span className="text-muted-foreground/60 ml-1 font-normal">(leave blank to keep current)</span>}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Minimum 4 characters"
                    className={inputCls + " pr-12"}
                  />
                  <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Recovery Secret Code
                  {editingId === null
                    ? <span className="text-destructive ml-1">*</span>
                    : <span className="text-muted-foreground/60 ml-1 font-normal">(leave blank to keep current)</span>}
                </label>
                {/* FIX: added eye toggle for secret code field */}
                <div className="relative">
                  <input
                    type={showSecretCode ? "text" : "password"}
                    value={form.secretCode}
                    onChange={(e) => setForm(f => ({ ...f, secretCode: e.target.value }))}
                    placeholder="A word/phrase only you know — for password recovery"
                    className={inputCls + " pr-12"}
                  />
                  <button type="button" onClick={() => setShowSecretCode(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showSecretCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1 ml-1">Used to reset password if forgotten.</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Role</label>
                <select value={form.role} onChange={(e) => setForm(f => ({ ...f, role: e.target.value as any }))} className={inputCls}>
                  <option value="librarian">Librarian</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <input id="adminIsActive" type="checkbox" checked={form.isActive} onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))} className="w-4 h-4 rounded border-border" />
                <label htmlFor="adminIsActive" className="text-sm font-medium text-foreground cursor-pointer">Account is active</label>
              </div>
              {formError && <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-2">{formError}</p>}
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button className="flex-1 rounded-xl" onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : editingId !== null ? "Save Changes" : "Create Admin"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirmId !== null && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-sm p-6 text-center">
            <Trash2 className="w-10 h-10 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-bold mb-2">Remove Admin Account?</h2>
            <p className="text-muted-foreground text-sm mb-1">You are about to delete <strong className="text-foreground">{deleteTargetName}</strong>.</p>
            <p className="text-muted-foreground text-sm mb-6">They will no longer be able to access the dashboard.</p>
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