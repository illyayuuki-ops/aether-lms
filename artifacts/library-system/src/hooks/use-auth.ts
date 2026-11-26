import { useState } from "react";

export function useAdminAuth() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("admin_token"));
  const [role,  setRole]  = useState<string | null>(() => localStorage.getItem("admin_role"));

  const login = (newToken: string, newRole?: string, newUsername?: string) => {
    localStorage.setItem("admin_token", newToken);
    localStorage.setItem("admin_role",  newRole    ?? "librarian");
    localStorage.setItem("admin_username", newUsername ?? "");
    setToken(newToken);
    setRole(newRole ?? null);
  };

  const logout = () => {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_role");
    localStorage.removeItem("admin_username");
    setToken(null);
    setRole(null);
    window.location.href = "/admin/login";
  };

  // Only the Bearer token is needed. The server derives the caller's role
  // from the signed token — sending a role header was both unnecessary and a
  // privilege-escalation footgun (the server used to trust it).
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  return { token, role, isAuthenticated: !!token, login, logout, authHeaders };
}