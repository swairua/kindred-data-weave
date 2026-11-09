import { Outlet, useLocation } from "react-router-dom";
import { toast } from "sonner";
import Navigation, { type NavigationView } from "@/components/Navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useSession } from "@/context/SessionContext";

const viewForPath = (pathname: string, hash: string): NavigationView => {
  if (pathname.startsWith("/reception") || pathname.startsWith("/storage") || pathname.startsWith("/equipment")) {
    return "reception";
  }
  if (pathname.startsWith("/tests") && hash === "#coring") return "coring";
  if (pathname.startsWith("/projects")) return "projects";
  if (pathname.startsWith("/results")) return "results";
  if (pathname.startsWith("/users")) return "users";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/reports")) return "reports";
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/profile")) return "profile";
  return "tests";
};

const ProtectedLayout = () => {
  const { pathname, hash } = useLocation();
  const { user, logout } = useSession();

  const handleLogout = async () => {
    await logout();
    toast.success("Logged out");
  };

  return (
    <SidebarProvider>
      <Navigation
        currentView={viewForPath(pathname, hash)}
        onViewChange={() => {}}
        onLogout={handleLogout}
        user={user}
        userName={user.name}
        userEmail={user.email}
      />
      <SidebarInset>
        <div key={pathname} className="animate-page-in">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default ProtectedLayout;
