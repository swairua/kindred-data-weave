import { useNavigate, useLocation } from "react-router-dom";
import { Plus, LayoutDashboard, FlaskConical, FileText, Hammer, LogOut, Zap, TestTubeDiagonal } from "lucide-react";
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
    <Sidebar collapsible="icon" variant="sidebar" className="bg-gradient-to-b from-slate-900 to-slate-950 border-r border-slate-800">
      {/* Sidebar Header with Branding */}
      <SidebarHeader className="border-b border-slate-800 bg-gradient-to-r from-blue-600 to-indigo-600 py-6">
        <div className="flex items-center gap-3 px-2">
          <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
            <TestTubeDiagonal className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-sm text-white tracking-tight truncate">CMTC Lab</h2>
            <p className="text-xs text-blue-100 truncate">Materials Testing</p>
          </div>
        </div>
      </SidebarHeader>

      {/* Sidebar Content */}
      <SidebarContent className="py-6">
        {/* Primary Actions */}
        <div className="px-2 mb-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={handleNewProject}
                className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white border-0 shadow-lg mb-2 group"
                tooltip="Create a new project"
              >
                <Plus className="h-5 w-5 text-white" />
                <span className="font-semibold">New Project</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>

        <div className="px-2 mb-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Navigation</div>
        </div>

        {/* Main Navigation */}
        <SidebarMenu className="space-y-1">
          {navItems.filter(item => !item.isAction).map((item) => {
            const Icon = item.icon;
            const isActive = item.active;
            return (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  onClick={item.onClick}
                  isActive={isActive}
                  tooltip={item.label}
                  className={`
                    transition-all duration-200
                    ${isActive
                      ? "bg-gradient-to-r from-blue-500/20 to-indigo-500/20 text-blue-400 border-l-2 border-blue-500"
                      : "text-slate-300 hover:text-white hover:bg-slate-800"
                    }
                  `}
                >
                  <Icon className={`h-5 w-5 ${isActive ? "text-blue-400" : ""}`} />
                  <span className={isActive ? "font-semibold" : "font-medium"}>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      {/* Sidebar Footer */}
      {(userName || userEmail) && (
        <SidebarFooter className="border-t border-slate-800 bg-gradient-to-t from-slate-900/50 to-transparent">
          <SidebarSeparator className="bg-slate-800" />

          {/* User Info Card */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg p-3 space-y-2 mx-2">
            {userName && (
              <p className="text-sm font-semibold text-white truncate flex items-center gap-2">
                <Zap className="h-3 w-3 text-blue-400" />
                {userName}
              </p>
            )}
            {userEmail && (
              <p className="text-xs text-slate-400 truncate">{userEmail}</p>
            )}
          </div>

          {onLogout && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 px-2 text-slate-300 hover:text-red-400 hover:bg-red-500/10 transition-colors mx-2 mb-2"
              onClick={() => {
                onLogout();
                // Close mobile drawer after logout
                if (isMobile) {
                  setOpenMobile(false);
                }
              }}
            >
              <LogOut className="h-4 w-4" />
              <span className="text-sm">Logout</span>
            </Button>
          )}
        </SidebarFooter>
      )}
    </Sidebar>
  );
};

export default Navigation;
