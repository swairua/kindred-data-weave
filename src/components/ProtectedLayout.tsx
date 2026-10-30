import { Outlet, useLocation } from "react-router-dom";
import { toast } from "sonner";
import Navigation, { type NavigationView } from "@/components/Navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useSession } from "@/context/SessionContext";

const viewForPath = (pathname: string): NavigationView => {
  if (pathname.startsWith("/reception") || pathname.startsWith("/storage") || pathname.startsWith("/equipment")) {
    return "reception";
  }
  if (pathname.startsWith("/projects")) return "projects";
  return "tests";
};

const ProtectedLayout = () => {
  const { pathname } = useLocation();
  const { user, logout } = useSession();

  const handleLogout = async () => {
    await logout();
    toast.success("Logged out");
  };

  return (
    <SidebarProvider>
      <Navigation
        currentView={viewForPath(pathname)}
        onViewChange={() => {}}
        onLogout={handleLogout}
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
