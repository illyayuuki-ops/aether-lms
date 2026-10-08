/// <reference types="vite/client" />
import { useState, useEffect, useRef, type ReactNode } from "react";

// ─── Windows Notification Helper ─────────────────────────────────────────────

async function requestNotificationPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
}

function sendNotification(title: string, body: string, urgent = false) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const n = new Notification(title, {
    body,
    icon: "/images/logo.png",
    requireInteraction: urgent,
    silent: false,
  });
  if (!urgent) setTimeout(() => n.close(), 8000);
}
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import {
  Monitor, Clock, LogOut, AlertTriangle, ShieldCheck,
  Loader2, Eye, EyeOff, Lock, UserPlus, KeyRound, ArrowLeft,
  CheckCircle, Minimize2, Maximize2, LayoutDashboard, BookOpen,
} from "lucide-react";
import { useKioskSession } from "@/hooks/use-kiosk-session";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn, logZodError } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { setKioskDesktopMode, onKioskDesktopModeChanged, onKioskEndSession, isElectronKiosk } from "@/lib/electron-kiosk";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const studentIdSchema = z
  .string()
  .regex(/^\d{2}-\d{5}$/, "Student ID must be in YY-NNNNN format (e.g. 24-12913)");

const loginSchema = z.object({
  studentId: studentIdSchema,
  password: z.string().min(1, "Password is required"),
});

const selfServiceSchema = z
  .object({
    newPassword: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

const changePasswordSchema = z
  .object({
    newPassword: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type LoginFormValues = z.infer<typeof loginSchema>;
type SelfServiceValues = z.infer<typeof selfServiceSchema>;
type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
type KioskMode = "login" | "register" | "forgot";

// ─── Instructions Sheet — pull-out student guide on the left side ────────────

function InstructionsSheet({ forceOpen, onClose }: { forceOpen?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  const handleClose = () => {
    setOpen(false);
    onClose?.();
  };

  const steps: { title: string; body: ReactNode }[] = [
    { title: "1. Log in", body: <>Enter your <strong>Student ID</strong> (format <span className="font-mono">YY-NNNNN</span>, e.g. <span className="font-mono">24-12913</span>) and your password, then press <strong>Start Session</strong>.</> },
    { title: "2. First time?", body: <>Your default password is your <strong>Student ID</strong>. You will be asked to set a personal password on your first login.</> },
    { title: "3. Use the computer", body: <>After logging in, click <strong>Go to Desktop</strong>. A small floating badge stays on the side of the screen while you work.</> },
    { title: "4. End your session", body: <>When you are done, click <strong>End Session</strong> on the floating badge (or return to the session screen and log out).</> },
    { title: "5. Stay active", body: <>Sessions end automatically after a period of <strong>inactivity</strong>, so keep working or log out when finished.</> },
    { title: "Forgot your password?", body: <>Use the <strong>Forgot your password?</strong> link below the login form, or ask the librarian for help.</> },
  ];

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(v); }}>
      {!isElectronKiosk() && (
        <SheetTrigger asChild>
          <button
            className="fixed left-0 top-1/2 -translate-y-1/2 z-50 flex items-center gap-2 pl-3 pr-4 py-3 rounded-r-2xl bg-white/10 backdrop-blur-md border border-l-0 border-white/20 text-white/70 hover:text-white hover:bg-white/20 transition-all shadow-lg"
            aria-label="Open instructions"
          >
            <BookOpen className="w-5 h-5" />
            <span className="text-sm font-medium [writing-mode:vertical-rl] rotate-180 tracking-wide">Instructions</span>
          </button>
        </SheetTrigger>
      )}
      <SheetContent side="left" className="bg-[#101a2e] border-white/10 text-white overflow-y-auto w-[340px] sm:max-w-[340px]" onClose={handleClose}>
        <SheetHeader>
          <SheetTitle className="text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-accent" /> How to Use This PC
          </SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          {steps.map((s) => (
            <div key={s.title} className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <p className="text-sm font-semibold text-white mb-1">{s.title}</p>
              <p className="text-sm text-white/60 leading-relaxed">{s.body}</p>
            </div>
          ))}
          <p className="text-xs text-white/30 text-center pt-2">Need more help? Ask the librarian at the front desk.</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const inputCls = "w-full h-12 bg-white/10 border border-white/20 rounded-xl px-4 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-accent transition-all";
const labelCls = "text-sm font-medium text-white/80 ml-1";

function formatStudentId(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 7);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function KioskPage() {
  const { session, elapsedSeconds, isWarning, login, logout, isLoggingOut } = useKioskSession();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    requestNotificationPermission();
    return () => clearInterval(timer);
  }, []);

  if (session) {
    return (
      <>
        <ActiveSessionView
          session={session}
          elapsedSeconds={elapsedSeconds}
          isWarning={isWarning}
          onLogout={logout}
          isLoggingOut={isLoggingOut}
          currentTime={currentTime}
        />
        <InstructionsSheet forceOpen={showInstructions} onClose={() => setShowInstructions(false)} />
      </>
    );
  }

  return (
    <>
      <LoginView onLogin={(s) => { login(s); setShowInstructions(true); }} currentTime={currentTime} />
      <InstructionsSheet forceOpen={showInstructions} onClose={() => setShowInstructions(false)} />
    </>
  );
}

// ─── Self-Service Panel ───────────────────────────────────────────────────────

function SelfServicePanel({
  mode,
  onBack,
  onSuccess,
}: {
  mode: "register" | "forgot";
  onBack: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<"lookup" | "set_password" | "done">("lookup");
  const [studentId, setStudentId] = useState("");
  const [foundStudent, setFoundStudent] = useState<any>(null);
  const [isLooking, setIsLooking] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isRegister = mode === "register";

  const form = useForm<SelfServiceValues>({
    resolver: zodResolver(selfServiceSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStudentId(formatStudentId(e.target.value));
    setLookupError("");
  };

  const handleLookup = async () => {
    const id = studentId.trim();
    if (!id) { setLookupError("Please enter your Student ID."); return; }
    if (!/^\d{2}-\d{5}$/.test(id)) {
      setLookupError("Format must be YY-NNNNN (e.g. 24-12913)");
      return;
    }
    setLookupError("");
    setIsLooking(true);
    try {
      const resp = await fetch(
        `${import.meta.env.BASE_URL}api/sessions/lookup?studentId=${encodeURIComponent(id)}`
      );
      const data = await resp.json();
      if (!resp.ok) {
        setLookupError("Student ID not found. Please ask the librarian to add you first.");
        return;
      }
      if (!data.isActive) {
        setLookupError("Your account is inactive. Please contact the librarian.");
        return;
      }
      setFoundStudent(data);
      setStep("set_password");
    } catch {
      setLookupError("Cannot connect to server. Please try again.");
    } finally {
      setIsLooking(false);
    }
  };

  const handleSetPassword = async (values: SelfServiceValues) => {
    if (!foundStudent) return;
    setIsSaving(true);
    try {
      const resp = await fetch(
        `${import.meta.env.BASE_URL}api/sessions/change-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: foundStudent.studentId,
            newPassword: values.newPassword,
          }),
        }
      );
      if (!resp.ok) {
        toast({ title: "Error", description: "Failed to save password. Try again.", variant: "destructive" });
        return;
      }
      setStep("done");
    } catch {
      toast({ title: "Connection Error", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full max-w-md glass-panel-dark rounded-3xl p-8 shadow-2xl relative overflow-hidden">
      <div className={cn(
        "absolute top-0 left-0 w-full h-1",
        isRegister ? "bg-gradient-to-r from-green-400 to-accent" : "bg-gradient-to-r from-amber-400 to-orange-400"
      )} />

      <div className="flex items-center gap-3 mb-6">
        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", isRegister ? "bg-green-500/20" : "bg-amber-500/20")}>
          {isRegister ? <UserPlus className="w-6 h-6 text-green-300" /> : <KeyRound className="w-6 h-6 text-amber-300" />}
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">{isRegister ? "Student Registration" : "Forgot Password"}</h2>
          <p className="text-white/50 text-sm">{isRegister ? "Set up your library account" : "Reset your password"}</p>
        </div>
      </div>

      {step === "lookup" && (
        <div className="space-y-4">
          <p className="text-white/60 text-sm">
            {isRegister
              ? "Enter your Student ID. You must already be in the system — ask the librarian if unsure."
              : "Enter your Student ID to verify your identity, then set a new password."}
          </p>
          <div className="space-y-1">
            <label className={labelCls}>Student ID</label>
            <input
              type="text"
              value={studentId}
              onChange={handleIdChange}
              onKeyDown={(e) => e.key === "Enter" && handleLookup()}
              placeholder="e.g. 24-12913"
              className={inputCls + " font-mono tracking-widest"}
              autoComplete="off"
              autoFocus
              maxLength={8}
            />
            <p className="text-white/30 text-xs ml-1">Format: YY-NNNNN (year + 5-digit ID)</p>
            {lookupError && <p className="text-red-400 text-xs ml-1 mt-1">{lookupError}</p>}
          </div>
          <Button
            className={cn("w-full h-12 text-white rounded-xl", isRegister ? "bg-green-500 hover:bg-green-600" : "bg-amber-500 hover:bg-amber-600")}
            onClick={handleLookup}
            disabled={isLooking}
          >
            {isLooking ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Looking up...</span> : "Continue →"}
          </Button>
          <button onClick={onBack} className="w-full flex items-center justify-center gap-2 text-white/40 hover:text-white/70 text-sm transition-colors mt-1">
            <ArrowLeft className="w-4 h-4" /> Back to Login
          </button>
        </div>
      )}

      {step === "set_password" && foundStudent && (
        <div className="space-y-4">
          <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
            <div>
              <p className="text-white font-semibold text-sm">{foundStudent.name}</p>
              <p className="text-white/50 text-xs">{foundStudent.studentId} • {foundStudent.degree} Yr {foundStudent.yearLevel}</p>
            </div>
          </div>
          <p className="text-white/60 text-sm">
            {isRegister ? "Create your personal password." : "Choose a new password for your account."}
          </p>
          <form onSubmit={form.handleSubmit(handleSetPassword)} className="space-y-3">
            <div className="space-y-1">
              <label className={labelCls}>New Password</label>
              <div className="relative">
                <input {...form.register("newPassword")} type={showNew ? "text" : "password"} className={cn(inputCls, "pr-12")} placeholder="At least 6 characters" />
                <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80">
                  {showNew ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {form.formState.errors.newPassword && <p className="text-red-400 text-xs ml-1">{form.formState.errors.newPassword.message}</p>}
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Confirm Password</label>
              <div className="relative">
                <input {...form.register("confirmPassword")} type={showConfirm ? "text" : "password"} className={cn(inputCls, "pr-12")} placeholder="Re-enter your password" />
                <button type="button" onClick={() => setShowConfirm(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80">
                  {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {form.formState.errors.confirmPassword && <p className="text-red-400 text-xs ml-1">{form.formState.errors.confirmPassword.message}</p>}
            </div>
            <Button
              type="submit"
              className={cn("w-full h-12 text-white rounded-xl mt-2", isRegister ? "bg-green-500 hover:bg-green-600" : "bg-amber-500 hover:bg-amber-600")}
              disabled={isSaving}
            >
              {isSaving ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Saving...</span> : isRegister ? "Complete Registration" : "Reset Password"}
            </Button>
          </form>
          <button onClick={() => setStep("lookup")} className="w-full flex items-center justify-center gap-2 text-white/40 hover:text-white/70 text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </div>
      )}

      {step === "done" && (
        <div className="text-center space-y-5">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
            <CheckCircle className="w-9 h-9 text-green-400" />
          </div>
          <div>
            <h3 className="text-white text-xl font-bold mb-2">
              {isRegister ? "Registration Complete!" : "Password Reset!"}
            </h3>
            <p className="text-white/60 text-sm">
              {isRegister
                ? "Your account is ready. Log in with your Student ID and new password."
                : "Done! You can now log in with your new password."}
            </p>
          </div>
          <Button className="w-full h-12 bg-accent hover:bg-accent/90 text-white rounded-xl" onClick={onSuccess}>
            Go to Login
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Login View ───────────────────────────────────────────────────────────────

function LoginView({ onLogin, currentTime }: { onLogin: (s: any) => void; currentTime: Date }) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<KioskMode>("login");

  const [detectedPcNumber, setDetectedPcNumber] = useState<number | null>(null);
  const [pcDetectionStatus, setPcDetectionStatus] = useState<"loading" | "found" | "not_found">("loading");

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [pendingSession, setPendingSession] = useState<any>(null);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { studentId: "", password: "" },
  });

  const cpForm = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  useEffect(() => {
    const detectPc = async () => {
      try {
        const resp = await fetch(`${import.meta.env.BASE_URL}api/admin/settings/pc-mappings/detect`);
        const data = await resp.json();
        if (resp.ok && data.pcNumber) {
          setDetectedPcNumber(data.pcNumber);
          setPcDetectionStatus("found");
        } else {
          setPcDetectionStatus("not_found");
        }
      } catch {
        setPcDetectionStatus("not_found");
      }
    };
    detectPc();
  }, []);

  const handleLoginSuccess = (result: any) => {
    if (result.mustChangePassword) {
      setPendingSession(result);
      setShowChangePassword(true);
    } else {
      onLogin(result);
      toast({ title: "Session Started", description: `Welcome, ${result.name}!` });
    }
  };

  const handleStudentIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatStudentId(e.target.value);
    form.setValue("studentId", formatted, { shouldValidate: form.formState.isSubmitted });
  };

  const onSubmit = async (data: LoginFormValues) => {
    if (!detectedPcNumber) {
      toast({ title: "PC Not Assigned", description: "Ask the librarian to configure this PC.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const resp = await fetch(`${import.meta.env.BASE_URL}api/sessions/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: data.studentId.trim(),
          password: data.password,
          computerNumber: detectedPcNumber,
        }),
      });
      const result = await resp.json();
      if (!resp.ok) {
        toast({ title: "Login Failed", description: result.message || "Invalid credentials.", variant: "destructive" });
        return;
      }
      handleLoginSuccess(result);
    } catch {
      toast({ title: "Connection Error", description: "Cannot connect to server.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const onChangePassword = async (data: ChangePasswordValues) => {
    if (!pendingSession) return;
    setIsSavingPassword(true);
    try {
      const resp = await fetch(`${import.meta.env.BASE_URL}api/sessions/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: pendingSession.studentId,
          newPassword: data.newPassword,
        }),
      });
      if (!resp.ok) {
        toast({ title: "Error", description: "Failed to save password.", variant: "destructive" });
        return;
      }
      setShowChangePassword(false);
      onLogin(pendingSession);
      toast({ title: "Password Set!", description: `Welcome, ${pendingSession.name}!` });
    } catch {
      toast({ title: "Error", description: "Something went wrong.", variant: "destructive" });
    } finally {
      setIsSavingPassword(false);
    }
  };

  const formattedDate = currentTime.toLocaleDateString([], {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  if (mode === "register" || mode === "forgot") {
    return (
      <div className="min-h-screen relative flex items-center justify-center overflow-hidden bg-primary">
        <div className="absolute inset-0 z-0">
          <img src={`${import.meta.env.BASE_URL}images/kiosk-bg.png`} alt="" className="w-full h-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-br from-primary/90 to-primary/40 mix-blend-multiply" />
        </div>
        <div className="relative z-10 w-full max-w-md px-6">
          <SelfServicePanel mode={mode} onBack={() => setMode("login")} onSuccess={() => setMode("login")} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden bg-primary">
      <div className="absolute inset-0 z-0">
        <img src={`${import.meta.env.BASE_URL}images/kiosk-bg.png`} alt="" className="w-full h-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/90 to-primary/40 mix-blend-multiply" />
      </div>

      <Link href="/admin/login">
        <div className="absolute top-6 right-6 w-12 h-12 rounded-full cursor-pointer z-50 hover:bg-white/10 flex items-center justify-center transition-colors">
          <ShieldCheck className="w-5 h-5 text-white/30 hover:text-white/80" />
        </div>
      </Link>

      <InstructionsSheet />

      {showChangePassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1a2235] border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-accent/20 flex items-center justify-center">
                <Lock className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Set Your Password</h2>
                <p className="text-white/50 text-sm">Welcome, {pendingSession?.name}! Please set a personal password.</p>
              </div>
            </div>
            <form onSubmit={cpForm.handleSubmit(onChangePassword)} className="space-y-4">
              <div className="space-y-1">
                <label className={labelCls}>New Password</label>
                <div className="relative">
                  <input {...cpForm.register("newPassword")} type={showNew ? "text" : "password"} className={cn(inputCls, "pr-12")} placeholder="At least 6 characters" />
                  <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80">
                    {showNew ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {cpForm.formState.errors.newPassword && <p className="text-red-400 text-xs ml-1">{cpForm.formState.errors.newPassword.message}</p>}
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Confirm Password</label>
                <div className="relative">
                  <input {...cpForm.register("confirmPassword")} type={showConfirm ? "text" : "password"} className={cn(inputCls, "pr-12")} placeholder="Re-enter your password" />
                  <button type="button" onClick={() => setShowConfirm(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80">
                    {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {cpForm.formState.errors.confirmPassword && <p className="text-red-400 text-xs ml-1">{cpForm.formState.errors.confirmPassword.message}</p>}
              </div>
              <Button type="submit" className="w-full h-12 text-lg bg-accent hover:bg-accent/90 text-white rounded-xl mt-2" disabled={isSavingPassword}>
                {isSavingPassword ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Saving...</span> : "Set Password & Start Session"}
              </Button>
            </form>
          </div>
        </div>
      )}

      <div className="relative z-10 w-full max-w-5xl px-6 flex flex-col md:flex-row gap-12 items-center">
        <div className="flex-1 text-white text-center md:text-left">
          <div className="inline-flex flex-col items-start gap-1 px-4 py-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 mb-8">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-sm font-medium tracking-wide">
                System Online • {currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <span className="text-xs text-white/60 ml-5">{formattedDate}</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-display font-bold leading-tight mb-4">
            L-CMS
          </h1>
          <p className="text-lg md:text-xl text-white/70 max-w-xl font-light mb-2">LCCT Computer Management System</p>
          <p className="text-sm text-white/50">Enter your Student ID and Password to begin your session.</p>
        </div>

        <div className="w-full max-w-md flex flex-col gap-3">
          <div className="glass-panel-dark rounded-3xl p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent to-blue-400" />
            <div className="flex items-center justify-center mb-6">
              <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-14 h-14 opacity-90" />
            </div>

            <div className={cn(
              "mb-4 px-4 py-3 rounded-xl flex items-center gap-3 text-sm border",
              pcDetectionStatus === "found"
                ? "bg-green-500/10 border-green-500/30 text-green-300"
                : pcDetectionStatus === "not_found"
                ? "bg-red-500/10 border-red-500/30 text-red-300"
                : "bg-white/5 border-white/10 text-white/40"
            )}>
              <Monitor className="w-4 h-4 shrink-0" />
              {pcDetectionStatus === "loading" && (
                <span className="flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Detecting PC...</span>
              )}
              {pcDetectionStatus === "found" && (
                <span>PC <strong>#{detectedPcNumber?.toString().padStart(2, "0")}</strong> detected automatically</span>
              )}
              {pcDetectionStatus === "not_found" && (
                <span>PC not configured — contact the librarian</span>
              )}
            </div>

            <form onSubmit={form.handleSubmit(onSubmit, (err) => logZodError(err, "Login"))} className="space-y-4">
              <div className="space-y-1">
                <label className={labelCls}>Student ID</label>
                <input
                  {...form.register("studentId")}
                  onChange={handleStudentIdChange}
                  className={inputCls + " font-mono tracking-widest"}
                  placeholder="e.g. 24-12913"
                  autoComplete="off"
                  maxLength={8}
                />
                <p className="text-white/30 text-xs ml-1">Format: YY-NNNNN</p>
                {form.formState.errors.studentId && (
                  <p className="text-red-400 text-xs ml-1">{form.formState.errors.studentId.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Password</label>
                <div className="relative">
                  <input
                    {...form.register("password")}
                    type={showPassword ? "text" : "password"}
                    className={cn(inputCls, "pr-12")}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {form.formState.errors.password && <p className="text-red-400 text-xs ml-1">{form.formState.errors.password.message}</p>}
                <p className="text-white/30 text-xs ml-1">Default password is your Student ID.</p>
              </div>
              <Button
                type="submit"
                className="w-full h-12 mt-2 text-lg bg-accent hover:bg-accent/90 text-white rounded-xl shadow-[0_0_20px_rgba(37,99,235,0.3)]"
                disabled={isLoading || pcDetectionStatus === "loading"}
              >
                {isLoading
                  ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Verifying...</span>
                  : "Start Session"}
              </Button>
            </form>

            <button onClick={() => setMode("forgot")} className="w-full text-center text-white/40 hover:text-white/70 text-sm mt-4 transition-colors">
              Forgot your password?
            </button>
          </div>

          {/* Developer credits */}
          <p className="text-center text-white/20 text-xs pt-1">
            Developed by: Pababero, John Raphael • Alemania, Julia Cassandra • Galit, Jake Mathew • Piamonte, Nash Steven
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Active Session View ──────────────────────────────────────────────────────

function ActiveSessionView({ session, elapsedSeconds, isWarning, onLogout, isLoggingOut, currentTime }: any) {
  const INACTIVITY_LIMIT_SECS = (session.inactivityLimitMinutes ?? 10) * 60;
  const warningNotifSent = useRef(false);
  const logoutNotifSent  = useRef(false);

  // ── Desktop mode — hides the session card so student can use the PC ──────
  const [isDesktopMode, setIsDesktopMode] = useState(false);

  useEffect(() => { requestNotificationPermission(); }, []);

  useEffect(() => {
    setKioskDesktopMode(isDesktopMode, { name: session.name, computerNumber: session.computerNumber });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktopMode]);

  // Electron shell events — badge "End Session" button + desktop-mode exits
  const onLogoutRef = useRef(onLogout);
  onLogoutRef.current = onLogout;
  useEffect(() => {
    const offDesktop = onKioskDesktopModeChanged((enabled) => setIsDesktopMode(enabled));
    const offEnd = onKioskEndSession(() => onLogoutRef.current());
    return () => { offDesktop(); offEnd(); };
  }, []);

  useEffect(() => {
    if (isWarning && !warningNotifSent.current) {
      warningNotifSent.current = true;
      sendNotification(
        "⚠️ Inactivity Warning — L-CMS",
        "You will be logged out in 1 minute due to inactivity. Move your mouse to stay logged in.",
        true
      );
    }
    if (!isWarning) warningNotifSent.current = false;
  }, [isWarning]);

  useEffect(() => {
    if (isLoggingOut && !logoutNotifSent.current) {
      logoutNotifSent.current = true;
      sendNotification(
        "🔒 Session Ended — L-CMS",
        "Your library session has ended due to inactivity. Please log in again to continue.",
        false
      );
    }
  }, [isLoggingOut]);

  // When warning fires while in desktop mode — force show the session card
  useEffect(() => {
    if (isWarning && isDesktopMode) {
      setIsDesktopMode(false);
    }
  }, [isWarning]);

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const formattedDate = currentTime.toLocaleDateString([], {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  // ── Desktop Mode UI — the Electron shell minimizes the kiosk window and
  // shows a native floating badge, so render nothing here. In a plain
  // browser we keep the in-page floating badge as a fallback.
  if (isDesktopMode && isElectronKiosk()) {
    return null;
  }

  if (isDesktopMode) {
    return (
      <div className="fixed inset-0 z-50 pointer-events-none">
        {/* Inactivity warning still shows even in desktop mode */}
{isWarning && (
           <div className="absolute top-0 left-0 w-full bg-warning text-warning-foreground py-3 px-4 flex items-center justify-center gap-3 font-bold text-base shadow-md pointer-events-auto">
             <AlertTriangle className="w-5 h-5" />
             Warning: You will be logged out in 1 minute due to inactivity. Please move your mouse.
           </div>
         )}

        {/* Floating session badge — bottom right corner */}
        <div className="absolute bottom-6 right-6 pointer-events-auto">
          <div className="bg-primary/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl p-4 flex items-center gap-4 min-w-[280px]">
            {/* Session info */}
<div className="flex-1 min-w-0">
               <div className="flex items-center gap-2 mb-0.5">
                 <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
                 <p className="text-white text-xs font-semibold truncate">{session.name}</p>
               </div>
               <p className="text-white/80 font-semibold text-xs">
                 PC {session.computerNumber.toString().padStart(2, "0")} •{" "}
                 <span className="font-mono text-accent">{formatTime(elapsedSeconds)}</span>
               </p>
             </div>

            {/* Return to session button */}
            <Button
              size="sm"
              onClick={() => setIsDesktopMode(false)}
              className="gap-1.5 rounded-xl bg-accent hover:bg-accent/90 text-white shrink-0 text-xs px-3 h-8"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Session
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Normal Session View ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-accent/5 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[120px]" />

      {isWarning && (
        <div className="absolute top-0 left-0 w-full bg-warning text-warning-foreground py-3 px-4 flex items-center justify-center gap-3 font-bold text-base shadow-md z-50 animate-in slide-in-from-top">
          <AlertTriangle className="w-5 h-5" />
          Warning: You will be logged out in 1 minute due to inactivity. Please move your mouse.
        </div>
      )}

      <div className="w-full max-w-3xl bg-card rounded-3xl shadow-2xl border border-border/50 overflow-hidden relative z-10">
        <div className="bg-primary p-8 text-primary-foreground flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/20">
              <Monitor className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white/80 tracking-wider uppercase mb-1">L-CMS — Active Session</h2>
              <p className="text-3xl font-display font-bold">PC — {session.computerNumber.toString().padStart(2, "0")}</p>
            </div>
          </div>
          <div className="text-center md:text-right">
            <p className="text-sm font-semibold text-white/80 mb-1">Current Time</p>
            <p className="text-2xl font-mono">{currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>
            <p className="text-xs text-white/40 mt-1">{formattedDate}</p>
          </div>
        </div>

        <div className="p-8 md:p-12 flex flex-col md:flex-row gap-12">
          <div className="flex-1 space-y-5">
<div>
               <p className="text-sm font-semibold text-foreground mb-1">Student</p>
               <p className="text-2xl font-semibold text-foreground">{session.name}</p>
               <p className="text-foreground">{session.studentId} • {session.degree} Year {session.yearLevel}</p>
             </div>
             <div className="pt-4 border-t border-border">
               <div className="grid grid-cols-2 gap-4">
                 <div className="bg-secondary/50 p-4 rounded-xl">
                   <p className="text-xs font-semibold text-foreground">Started At</p>
                   <p className="font-semibold">{new Date(session.loginTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                 </div>
                 <div className="bg-secondary/50 p-4 rounded-xl">
                   <p className="text-xs font-semibold text-foreground">Auto-logout After</p>
                   <p className="font-semibold">{session.inactivityLimitMinutes ?? 10} min idle</p>
                 </div>
               </div>
             </div>

            {/* ── Go to Desktop button ── */}
            <div className="pt-2">
              <button
                onClick={() => setIsDesktopMode(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-xl bg-accent hover:bg-accent/90 transition-all text-base font-bold text-white shadow-[0_0_20px_rgba(37,99,235,0.35)]"
              >
                <LayoutDashboard className="w-5 h-5" />
                Go to Desktop
                <span className="text-xs font-medium text-white/80 ml-1">— click here to use this computer</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center shrink-0">
            <div className="relative w-48 h-48 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90 absolute inset-0">
                <circle cx="96" cy="96" r="88" className="stroke-muted fill-none stroke-[8]" />
                <circle
                  cx="96" cy="96" r="88"
                  className="fill-none stroke-[8] stroke-accent transition-all duration-1000"
                  strokeDasharray={2 * Math.PI * 88}
                  strokeDashoffset={(2 * Math.PI * 88) * (1 - ((elapsedSeconds % INACTIVITY_LIMIT_SECS) / INACTIVITY_LIMIT_SECS))}
                  strokeLinecap="round"
                />
              </svg>
              <div className="text-center z-10 flex flex-col items-center">
                <Clock className="w-6 h-6 mb-2 text-foreground" />
                <span className="text-4xl font-display font-bold font-mono tracking-tighter text-foreground">
                  {formatTime(elapsedSeconds)}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground mt-1">Elapsed</span>
              </div>
            </div>
            <Button
              size="lg"
              variant="destructive"
              className="mt-8 w-full rounded-2xl gap-2 font-bold text-lg"
              onClick={onLogout}
              disabled={isLoggingOut}
            >
              <LogOut className="w-5 h-5" />
              {isLoggingOut ? "Ending..." : "End Session"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
