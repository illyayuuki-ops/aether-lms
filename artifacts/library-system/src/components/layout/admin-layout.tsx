import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAdminAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard, Users, Monitor, History, LogOut, Library,
  GraduationCap, ShieldCheck, Settings, BarChart2, Lock, LockOpen,
  Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [location] = useLocation();
  const { logout, token } = useAdminAuth();
  const [isLocked, setIsLocked] = useState(false);
  const [allLocked, setAllLocked] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);

  const toggleLock = () => {
    const kiosk = (window as any).aetherKiosk;
    if (isLocked) {
      kiosk?.unlock?.();
      setIsLocked(false);
    } else {
      kiosk?.lock?.();
      setIsLocked(true);
    }
  };

  const broadcastLock = async (command: "lock" | "unlock") => {
    setBroadcasting(true);
    try {
      await fetch("/api/kiosk/broadcast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ command }),
      });
      setAllLocked(command === "lock");
    } catch (e) {
      console.error("Broadcast failed:", e);
    } finally {
      setBroadcasting(false);
    }
  };

  const navItems = [
    { href: "/admin",          label: "Dashboard",       icon: LayoutDashboard },
    { href: "/admin/sessions", label: "Active Sessions", icon: Monitor },
    { href: "/admin/history",  label: "Session History", icon: History },
    { href: "/admin/students", label: "Students",        icon: GraduationCap },
    { href: "/admin/admins",   label: "Admin Accounts",  icon: ShieldCheck },
    { href: "/admin/analytics",label: "Analytics",       icon: BarChart2 },
    { href: "/admin/settings", label: "Settings",        icon: Settings },
  ];

  const pageTitles: Record<string, string> = {
    "/admin":           "Dashboard",
    "/admin/sessions":  "Active Sessions",
    "/admin/history":   "Session History",
    "/admin/students":  "Student Registry",
    "/admin/admins":    "Admin Accounts",
    "/admin/analytics": "Analytics",
    "/admin/settings":  "Settings",
  };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-72 bg-primary text-primary-foreground flex flex-col shadow-2xl z-10">
        <div className="p-6 flex items-center gap-3 border-b border-primary-foreground/10">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shadow-inner">
            <Library className="w-6 h-6 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-display font-bold text-lg leading-tight">L-CMS</span>
            <span className="text-xs text-primary-foreground/60">Admin Panel</span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200 cursor-pointer",
                    isActive
                      ? "bg-accent text-white shadow-lg shadow-accent/20"
                      : "text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-white"
                  )}
                >
                  <item.icon className={cn("w-5 h-5", isActive ? "text-white" : "text-primary-foreground/50")} />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-primary-foreground/10 space-y-2">
          {/* Lock All / Unlock All PCs — broadcasts to all connected kiosks */}
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start gap-3 font-semibold",
              allLocked
                ? "text-green-300 hover:text-green-200 hover:bg-green-500/10"
                : "text-red-300 hover:text-red-200 hover:bg-red-500/10"
            )}
            onClick={() => broadcastLock(allLocked ? "unlock" : "lock")}
            disabled={broadcasting}
          >
            <Radio className="w-5 h-5" />
            {broadcasting ? "Sending..." : allLocked ? "Unlock All PCs" : "Lock All PCs"}
          </Button>

          {/* Lock / Unlock this screen only */}
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start gap-3 font-semibold",
              isLocked
                ? "text-green-300 hover:text-green-200 hover:bg-green-500/10"
                : "text-amber-300 hover:text-amber-200 hover:bg-amber-500/10"
            )}
            onClick={toggleLock}
          >
            {isLocked
              ? <><LockOpen className="w-5 h-5" /> Unlock Screen</>
              : <><Lock className="w-5 h-5" /> Lock Screen</>
            }
          </Button>

          <Button
            variant="ghost"
            className="w-full justify-start gap-3"
            onClick={logout}
          >
            <LogOut className="w-5 h-5" />
            Log Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden h-screen">
        <header className="h-20 bg-card border-b flex items-center px-8 shadow-sm shrink-0">
          <h1 className="text-2xl font-display font-bold text-foreground">
            {pageTitles[location] || "Admin Panel"}
          </h1>
        </header>
        <div className="flex-1 overflow-auto p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}