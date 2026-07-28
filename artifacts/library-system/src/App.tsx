import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAdminAuth } from "@/hooks/use-auth";

// Pages
import KioskPage from "./pages/kiosk/index";
import AdminLogin from "./pages/admin/login";
import AdminDashboard from "./pages/admin/dashboard";
import AdminSessions from "./pages/admin/sessions";
import AdminStudents from "./pages/admin/students";
import AdminAdmins from "./pages/admin/admins";
import SettingsPage from "./pages/admin/settings";
import AnalyticsPage from "./pages/admin/analytics";
import NotFound from "./pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated } = useAdminAuth();
  if (!isAuthenticated) return <Redirect to="/admin/login" />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      {/* Public Kiosk Route */}
      <Route path="/" component={KioskPage} />

      {/* Admin Routes */}
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin" component={() => <ProtectedRoute component={AdminDashboard} />} />
      <Route path="/admin/sessions" component={() => <ProtectedRoute component={AdminSessions} />} />
      <Route path="/admin/history" component={() => <ProtectedRoute component={AdminSessions} />} />
      <Route path="/admin/students" component={() => <ProtectedRoute component={AdminStudents} />} />
      <Route path="/admin/admins" component={() => <ProtectedRoute component={AdminAdmins} />} />
      <Route path="/admin/settings" component={() => <ProtectedRoute component={SettingsPage} />} />
      <Route path="/admin/analytics" component={() => <ProtectedRoute component={AnalyticsPage} />} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;