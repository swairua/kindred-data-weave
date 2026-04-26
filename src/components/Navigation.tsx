import { useNavigate, useLocation } from "react-router-dom";
import { Plus, LayoutDashboard, FlaskConical, FileText, Hammer, LogOut } from "lucide-react";
import { useEffect } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

interface NavigationProps {
  currentView: "dashboard" | "tests" | "reports" | "admin";
  onViewChange: (view: "dashboard" | "tests" | "reports" | "admin") => void;
  onStartNewProject: () => void;
  onLogout?: () => void;
  userName?: string;
  userEmail?: string;
}

const Navigation = ({
  currentView,
  onViewChange,
  onStartNewProject,
  onLogout,
  userName,
  userEmail,
}: NavigationProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setOpenMobile, isMobile, toggleSidebar, state } = useSidebar();

  // Auto-collapse sidebar on tests page for better space utilization
  useEffect(() => {
    const isTestsPage = location.pathname === "/tests";
    if (isTestsPage && state === "expanded") {
      toggleSidebar();
    }
  }, [location.pathname, state, toggleSidebar]);

  const handleNavigation = (view: "dashboard" | "tests" | "reports" | "admin", path: string) => {
    onViewChange(view);
    navigate(path);
    // Close mobile drawer after navigation
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const handleNewProject = () => {
    onStartNewProject();
    // Close mobile drawer after action
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const navItems = [
    {
      id: "new-project",
      label: "New Project",
      icon: Plus,
      onClick: handleNewProject,
      isAction: true,
    },
    {
      id: "dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      onClick: () => handleNavigation("dashboard", "/"),
      active: currentView === "dashboard",
    },
    {
      id: "tests",
      label: "Tests",
      icon: FlaskConical,
      onClick: () => handleNavigation("tests", "/tests"),
      active: currentView === "tests",
    },
    {
      id: "reports",
      label: "Reports",
      icon: FileText,
      onClick: () => handleNavigation("reports", "/reports"),
      active: currentView === "reports",
    },
    {
      id: "admin",
      label: "Admin",
      icon: Hammer,
      onClick: () => handleNavigation("admin", "/admin"),
      active: currentView === "admin",
    },
  ];

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="border-b">
        <h2 className="font-bold text-sm tracking-tight px-2">CMTC Lab</h2>
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  onClick={item.onClick}
                  isActive={item.active}
                  tooltip={item.label}
                  className={item.isAction ? "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent" : ""}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      {(userName || userEmail) && (
        <SidebarFooter>
          <SidebarSeparator />
          <div className="text-xs space-y-1 px-2 py-2">
            {userName && (
              <p className="font-medium text-sidebar-foreground truncate">
                {userName}
              </p>
            )}
            {userEmail && (
              <p className="text-sidebar-foreground/70 truncate">{userEmail}</p>
            )}
          </div>
          {onLogout && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 px-2"
              onClick={() => {
                onLogout();
                // Close mobile drawer after logout
                if (isMobile) {
                  setOpenMobile(false);
                }
              }}
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </Button>
          )}
        </SidebarFooter>
      )}
    </Sidebar>
  );
};

export default Navigation;
