import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SessionContext } from "@/context/SessionContext";
import { fetchCurrentUser, logoutUser, type ApiUser } from "@/lib/api";

type SessionStatus = "checking" | "authenticated" | "unauthenticated" | "error";

export const SessionGuard = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<SessionStatus>("checking");
  const [user, setUser] = useState<ApiUser | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    fetchCurrentUser().then((currentUser) => {
      if (!active) return;
      setUser(currentUser);
      setStatus(currentUser ? "authenticated" : "unauthenticated");
    }).catch((error: unknown) => {
      if (!active) return;
      console.warn("[SessionGuard] Session check failed:", error instanceof Error ? error.message : error);
      setStatus("error");
    });
    return () => { active = false; };
  }, [attempt]);

  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } catch (error) {
      console.warn("[SessionGuard] Logout request failed:", error instanceof Error ? error.message : error);
    }
    setUser(null);
    setStatus("checking");
    navigate("/login", { replace: true });
  }, [navigate]);

  if (status === "checking") {
    return (
      <div className="min-h-svh flex items-center justify-center bg-background" role="status">
        <p className="text-sm text-muted-foreground">Checking your session…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-svh flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <p className="text-sm text-muted-foreground">We couldn’t verify your session. Check your connection and try again.</p>
          <Button type="button" variant="outline" onClick={() => {
            setStatus("checking");
            setAttempt((current) => current + 1);
          }}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated" || !user) {
    const next = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return (
    <SessionContext.Provider value={{ user, logout }}>
      <Outlet />
    </SessionContext.Provider>
  );
};
