import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, FlaskConical, FileText, Hammer, LogOut, Zap, TestTubeDiagonal, ChevronRight } from "lucide-react";
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
  onLogout?: () => void;
  userName?: string;
  userEmail?: string;
}

const Navigation = ({
  currentView,
  onViewChange,
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

  const navItems = [
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
    <Sidebar collapsible="icon" variant="sidebar" className="bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 border-r border-slate-700/50 shadow-2xl">
      {/* Sidebar Header with Branding */}
      <SidebarHeader className="border-b border-slate-700/50 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 py-5 px-3 data-[state=collapsed]:py-3 data-[state=collapsed]:px-2 transition-all duration-300">
        <div className="flex items-center gap-3 group">
          <div className="h-10 w-10 rounded-lg bg-white/20 backdrop-blur flex items-center justify-center flex-shrink-0 ring-2 ring-blue-400/30 transition-all duration-300">
            <TestTubeDiagonal className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1 min-w-0 overflow-hidden group-data-[state=collapsed]:hidden">
            <h2 className="font-bold text-sm text-white tracking-tight truncate">CMTC Lab</h2>
            <p className="text-xs text-blue-100/70 truncate">Materials Testing</p>
          </div>
        </div>
      </SidebarHeader>

      {/* Sidebar Content */}
      <SidebarContent className="py-5 px-2 space-y-4">
        <div className="px-2 pt-2">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Navigation</div>
        </div>

        {/* Main Navigation */}
        <SidebarMenu className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.active;
            return (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  onClick={item.onClick}
                  isActive={isActive}
                  tooltip={item.label}
                  className={`
                    transition-all duration-300 relative overflow-hidden group
                    ${isActive
                      ? "bg-gradient-to-r from-blue-500/30 to-indigo-500/20 text-blue-300 border-l-2 border-blue-400 shadow-md data-[state=collapsed]:bg-gradient-to-br data-[state=collapsed]:from-blue-500/40 data-[state=collapsed]:to-indigo-500/30 data-[state=collapsed]:border-0 data-[state=collapsed]:rounded-lg data-[state=collapsed]:shadow-lg"
                      : "text-slate-300 hover:text-white hover:bg-slate-800/60 border-l-2 border-transparent data-[state=collapsed]:hover:bg-slate-800/80 data-[state=collapsed]:border-0 data-[state=collapsed]:rounded-lg"
                    }
                  `}
                >
                  {/* Background gradient animation for active state */}
                  {isActive && (
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-0 group-hover:opacity-5 transition-opacity duration-300" />
                  )}

                  <Icon className={`h-5 w-5 flex-shrink-0 transition-colors duration-300 ${isActive ? "text-blue-300" : "text-slate-400 group-hover:text-blue-300"}`} />
                  <span className={`text-sm transition-all duration-300 ${isActive ? "font-semibold" : "font-medium"}`}>
                    {item.label}
                  </span>

                  {isActive && (
                    <ChevronRight className="h-4 w-4 ml-auto text-blue-300 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      {/* Sidebar Footer */}
      {(userName || userEmail) && (
        <SidebarFooter className="border-t border-slate-700/50 bg-gradient-to-t from-slate-950 via-slate-900 to-slate-900/50 py-4 px-2 data-[state=collapsed]:py-3 data-[state=collapsed]:px-2 transition-all duration-300">
          <SidebarSeparator className="bg-slate-700/30 data-[state=collapsed]:my-2" />

          {/* User Info Card */}
          <div className="bg-gradient-to-br from-slate-800/70 to-slate-900/70 rounded-lg p-3 space-y-2 mx-2 mt-2 border border-slate-700/50 backdrop-blur transition-all duration-300 hover:border-slate-600/70 hover:from-slate-800 hover:to-slate-900 data-[state=collapsed]:hidden">
            {userName && (
              <p className="text-sm font-semibold text-white truncate flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
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
              className="w-full justify-start gap-2 px-2 text-slate-300 hover:text-red-300 hover:bg-red-500/15 transition-all duration-300 mx-2 mb-2 h-9 group data-[state=collapsed]:w-10 data-[state=collapsed]:h-10 data-[state=collapsed]:p-0 data-[state=collapsed]:mx-auto data-[state=collapsed]:mb-0 data-[state=collapsed]:flex data-[state=collapsed]:items-center data-[state=collapsed]:justify-center data-[state=collapsed]:rounded-lg"
              onClick={() => {
                onLogout();
                // Close mobile drawer after logout
                if (isMobile) {
                  setOpenMobile(false);
                }
              }}
            >
              <LogOut className="h-4 w-4 flex-shrink-0 group-hover:animate-pulse" />
              <span className="text-sm data-[state=collapsed]:hidden">Logout</span>
            </Button>
          )}
        </SidebarFooter>
      )}
    </Sidebar>
  );
};

export default Navigation;
