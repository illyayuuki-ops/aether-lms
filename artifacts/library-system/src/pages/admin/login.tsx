import { useState } from "react";
import { useLocation } from "wouter";
import { Shield, Lock, User, Eye, EyeOff, ArrowLeft, KeyRound, CheckCircle, Loader2 } from "lucide-react";
import { useAdminLogin } from "@workspace/api-client-react";
import { useAdminAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputCls = "w-full h-14 pl-12 pr-12 rounded-xl bg-background border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all text-base";
const labelCls = "text-sm font-medium text-muted-foreground ml-1 block mb-1.5";

// ─── Mode types ───────────────────────────────────────────────────────────────

type Mode = "login" | "forgot" | "setup";

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminLogin() {
  const [mode, setMode] = useState<Mode>("login");

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <Link href="/">
        <Button variant="ghost" className="absolute top-6 left-6 gap-2 text-muted-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to Kiosk
        </Button>
      </Link>

      <div className="w-full max-w-md bg-card rounded-3xl shadow-xl border border-border/60 p-8 md:p-10">
        {mode === "login"  && <LoginForm  onForgot={() => setMode("forgot")} onSetup={() => setMode("setup")} />}
        {mode === "forgot" && <ForgotForm onBack={() => setMode("login")} />}
        {mode === "setup"  && <SetupForm  onDone={() => setMode("login")} />}
      </div>
    </div>
  );
}

// ─── Login Form ───────────────────────────────────────────────────────────────

function LoginForm({ onForgot, onSetup }: { onForgot: () => void; onSetup: () => void }) {
  const [username, setUsername]         = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [, setLocation]                 = useLocation();
  const { login }                       = useAdminAuth();
  const loginMutation                   = useAdminLogin();
  const { toast }                       = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) { toast({ title: "Username required", variant: "destructive" }); return; }
    if (!password)        { toast({ title: "Password required", variant: "destructive" }); return; }

    loginMutation.mutate(
      { data: { username: username.trim(), password } },
      {
        onSuccess: (res) => {
          const r = res as any;
          login(res.token, r.role ?? "librarian");
          localStorage.setItem("admin_username", r.username ?? username.trim());
          toast({ title: `Welcome, ${r.username ?? username}!` });
          setLocation("/admin");
        },
        onError: () => {
          toast({ title: "Access Denied", description: "Incorrect username or password.", variant: "destructive" });
        },
      }
    );
  };

  return (
    <>
      <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
        <Shield className="w-8 h-8 text-primary" />
      </div>

      <h1 className="text-3xl font-display font-bold text-center text-foreground mb-2">Admin Portal</h1>
      <p className="text-center text-muted-foreground mb-4 text-sm">
        Sign in with your admin credentials to continue.
      </p>

      {/* Librarian instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6 text-sm text-blue-800 space-y-1">
        <p className="font-semibold text-blue-900">📋 Librarian Guide:</p>
        <p>• After logging in, go to <strong>Settings → PC Mappings</strong> to assign IP addresses to each PC</p>
        <p>• Use <strong>Lock All PCs</strong> in the sidebar to lock all student computers at once</p>
        <p>• Press <strong>Ctrl+M</strong> to force-close the kiosk app on the librarian PC</p>
        <p>• Press <strong>Ctrl+Q</strong> to quit the kiosk app (when unlocked)</p>
        <p>• Press <strong>Ctrl+R</strong> to reload the kiosk screen without ending the session</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Username */}
        <div>
          <label className={labelCls}>Username</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <User className="w-5 h-5 text-muted-foreground" />
            </div>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputCls}
              placeholder="Enter your username"
              autoComplete="username"
              autoFocus
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label className={labelCls}>Password</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Lock className="w-5 h-5 text-muted-foreground" />
            </div>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
              placeholder="••••••••"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute inset-y-0 right-0 pr-4 flex items-center text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <Button
          type="submit"
          className="w-full h-14 text-base rounded-xl mt-2"
          disabled={!password || !username.trim() || loginMutation.isPending}
        >
          {loginMutation.isPending
            ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Signing in...</span>
            : "Log In"}
        </Button>
      </form>

      <div className="flex flex-col items-center gap-3 mt-6">
        <button
          onClick={onForgot}
          className="text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          Forgot your password?
        </button>
        <button
          onClick={onSetup}
          className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          First time setup (no admins yet)
        </button>
      </div>
    </>
  );
}

// ─── Forgot Password Form ─────────────────────────────────────────────────────

function ForgotForm({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();

  const [step, setStep]               = useState<"lookup" | "reset" | "done">("lookup");
  const [username, setUsername]       = useState("");
  const [secretCode, setSecretCode]   = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPw, setConfirmPw]     = useState("");
  const [showNew, setShowNew]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading]     = useState(false);
  const [error, setError]             = useState("");

  const handleLookup = async () => {
    if (!username.trim() || !secretCode.trim()) { setError("Both fields are required."); return; }
    setIsLoading(true); setError("");
    try {
      const resp = await fetch("/api/admin/auth/verify-secret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), secretCode: secretCode.trim() }),
      });
      if (!resp.ok) { setError("Username or secret code is incorrect."); return; }
      setStep("reset");
    } catch { setError("Cannot connect to server."); }
    finally { setIsLoading(false); }
  };

  const handleReset = async () => {
    if (newPassword.length < 4) { setError("Password must be at least 4 characters."); return; }
    if (newPassword !== confirmPw) { setError("Passwords do not match."); return; }
    setIsLoading(true); setError("");
    try {
      const resp = await fetch("/api/admin/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), secretCode: secretCode.trim(), newPassword }),
      });
      if (!resp.ok) { setError("Failed to reset password. Please try again."); return; }
      setStep("done");
    } catch { setError("Cannot connect to server."); }
    finally { setIsLoading(false); }
  };

  return (
    <>
      <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
        <KeyRound className="w-8 h-8 text-amber-500" />
      </div>

      <h1 className="text-2xl font-display font-bold text-center text-foreground mb-2">Reset Password</h1>

      {step === "lookup" && (
        <>
          <p className="text-center text-muted-foreground mb-6 text-sm">
            Enter your username and the secret code you set when your account was created.
          </p>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Username</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className="w-5 h-5 text-muted-foreground" />
                </div>
                <input type="text" value={username} onChange={(e) => { setUsername(e.target.value); setError(""); }}
                  className={inputCls} placeholder="Your username" autoFocus />
              </div>
            </div>
            <div>
              <label className={labelCls}>Secret Code</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <KeyRound className="w-5 h-5 text-muted-foreground" />
                </div>
                <input type="text" value={secretCode} onChange={(e) => { setSecretCode(e.target.value); setError(""); }}
                  className={inputCls} placeholder="Your secret code" />
              </div>
            </div>
            {error && <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-2">{error}</p>}
            <Button className="w-full h-14 rounded-xl" onClick={handleLookup} disabled={isLoading}>
              {isLoading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Verifying...</> : "Continue →"}
            </Button>
          </div>
        </>
      )}

      {step === "reset" && (
        <>
          <p className="text-center text-muted-foreground mb-6 text-sm">
            Identity verified. Set your new password.
          </p>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>New Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="w-5 h-5 text-muted-foreground" />
                </div>
                <input type={showNew ? "text" : "password"} value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setError(""); }}
                  className={inputCls} placeholder="At least 4 characters" autoFocus />
                <button type="button" onClick={() => setShowNew(v => !v)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-muted-foreground hover:text-foreground">
                  {showNew ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <div>
              <label className={labelCls}>Confirm Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="w-5 h-5 text-muted-foreground" />
                </div>
                <input type={showConfirm ? "text" : "password"} value={confirmPw}
                  onChange={(e) => { setConfirmPw(e.target.value); setError(""); }}
                  className={inputCls} placeholder="Re-enter password" />
                <button type="button" onClick={() => setShowConfirm(v => !v)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-muted-foreground hover:text-foreground">
                  {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-2">{error}</p>}
            <Button className="w-full h-14 rounded-xl" onClick={handleReset} disabled={isLoading}>
              {isLoading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Resetting...</> : "Reset Password"}
            </Button>
          </div>
        </>
      )}

      {step === "done" && (
        <div className="text-center py-4">
          <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold mb-2">Password Reset!</h3>
          <p className="text-muted-foreground text-sm mb-6">You can now log in with your new password.</p>
          <Button className="w-full h-14 rounded-xl" onClick={onBack}>Back to Login</Button>
        </div>
      )}

      {step !== "done" && (
        <button onClick={onBack} className="w-full text-center text-sm text-muted-foreground hover:text-foreground mt-4 transition-colors flex items-center justify-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Login
        </button>
      )}
    </>
  );
}

// ─── First-Time Setup Form ────────────────────────────────────────────────────
// Only usable when there are zero admins in the DB

function SetupForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();

  const [username, setUsername]       = useState("");
  const [password, setPassword]       = useState("");
  const [confirmPw, setConfirmPw]     = useState("");
  const [secretCode, setSecretCode]   = useState("");
  const [setupCode, setSetupCode]     = useState("");
  const [showPw, setShowPw]           = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSecret, setShowSecret]   = useState(false);
  const [isLoading, setIsLoading]     = useState(false);
  const [error, setError]             = useState("");
  const [done, setDone]               = useState(false);

  const handleSetup = async () => {
    if (!username.trim())    { setError("Username is required."); return; }
    if (username.length < 3) { setError("Username must be at least 3 characters."); return; }
    if (password.length < 4) { setError("Password must be at least 4 characters."); return; }
    if (password !== confirmPw) { setError("Passwords do not match."); return; }
    if (!secretCode.trim())  { setError("Secret code is required for password recovery."); return; }
    if (!setupCode.trim())   { setError("Setup code is required."); return; }
    setError(""); setIsLoading(true);

    try {
      const resp = await fetch("/api/admin/auth/first-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
          secretCode: secretCode.trim(),
          setupCode: setupCode.trim(),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) { setError(data.message ?? "Setup failed."); return; }
      setDone(true);
      toast({ title: "Admin account created! You can now log in." });
    } catch { setError("Cannot connect to server."); }
    finally { setIsLoading(false); }
  };

  if (done) {
    return (
      <div className="text-center py-4">
        <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-bold mb-2">Setup Complete!</h3>
        <p className="text-muted-foreground text-sm mb-6">Your admin account has been created. Log in to continue.</p>
        <Button className="w-full h-14 rounded-xl" onClick={onDone}>Go to Login</Button>
      </div>
    );
  }

  return (
    <>
      <div className="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
        <Shield className="w-8 h-8 text-green-600" />
      </div>
      <h1 className="text-2xl font-display font-bold text-center text-foreground mb-1">First-Time Setup</h1>
      <p className="text-center text-muted-foreground mb-6 text-sm">
        Create the first Super Admin account. Requires the setup code from your <code className="bg-muted px-1 rounded text-xs">.env</code> file.
      </p>

      <div className="space-y-4">
        {/* Setup code from .env */}
        <div>
          <label className={labelCls}>Setup Code <span className="text-xs text-muted-foreground">(from SETUP_CODE in .env)</span></label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <KeyRound className="w-5 h-5 text-muted-foreground" />
            </div>
            <input type="text" value={setupCode} onChange={(e) => { setSetupCode(e.target.value); setError(""); }}
              className={inputCls} placeholder="Enter SETUP_CODE from .env" />
          </div>
        </div>

        {/* Username */}
        <div>
          <label className={labelCls}>Username</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <User className="w-5 h-5 text-muted-foreground" />
            </div>
            <input type="text" value={username} onChange={(e) => { setUsername(e.target.value); setError(""); }}
              className={inputCls} placeholder="e.g. admin" />
          </div>
        </div>

        {/* Password */}
        <div>
          <label className={labelCls}>Password</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Lock className="w-5 h-5 text-muted-foreground" />
            </div>
            <input type={showPw ? "text" : "password"} value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              className={inputCls} placeholder="At least 4 characters" />
            <button type="button" onClick={() => setShowPw(v => !v)}
              className="absolute inset-y-0 right-0 pr-4 flex items-center text-muted-foreground hover:text-foreground">
              {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Confirm password */}
        <div>
          <label className={labelCls}>Confirm Password</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Lock className="w-5 h-5 text-muted-foreground" />
            </div>
            <input type={showConfirm ? "text" : "password"} value={confirmPw}
              onChange={(e) => { setConfirmPw(e.target.value); setError(""); }}
              className={inputCls} placeholder="Re-enter password" />
            <button type="button" onClick={() => setShowConfirm(v => !v)}
              className="absolute inset-y-0 right-0 pr-4 flex items-center text-muted-foreground hover:text-foreground">
              {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Secret code for future password recovery */}
        <div>
          <label className={labelCls}>
            Recovery Secret Code
            <span className="text-xs text-muted-foreground ml-1">— remember this, you'll need it to reset your password</span>
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <KeyRound className="w-5 h-5 text-muted-foreground" />
            </div>
            <input type={showSecret ? "text" : "password"} value={secretCode}
              onChange={(e) => { setSecretCode(e.target.value); setError(""); }}
              className={inputCls} placeholder="Create a secret recovery code" />
            <button type="button" onClick={() => setShowSecret(v => !v)}
              className="absolute inset-y-0 right-0 pr-4 flex items-center text-muted-foreground hover:text-foreground">
              {showSecret ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-2">{error}</p>}

        <Button className="w-full h-14 rounded-xl bg-green-600 hover:bg-green-700 text-white" onClick={handleSetup} disabled={isLoading}>
          {isLoading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Creating...</> : "Create Admin Account"}
        </Button>
      </div>

      <button onClick={onDone} className="w-full text-center text-sm text-muted-foreground hover:text-foreground mt-4 transition-colors flex items-center justify-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back to Login
      </button>
    </>
  );
}