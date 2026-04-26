import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, LayoutDashboard, FlaskConical, FileText, Hammer, LogOut } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";

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

  const handleNavigation = (view: "dashboard" | "tests" | "reports" | "admin", path: string) => {
    onViewChange(view);
    navigate(path);
  };

  const navItems = [
    {
      id: "new-project",
      label: "New Project",
      icon: Plus,
      onClick: onStartNewProject,
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
      onClick: () => handleNavigation("admin", "/"),
      active: currentView === "admin",
    },
  ];

  return (
    <Sidebar className="border-r">
      {/* Header */}
      <SidebarHeader className="border-b">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold tracking-tight">CMTC Lab</h2>
        </div>
      </SidebarHeader>

      {/* Navigation Menu */}
      <SidebarContent>
        <SidebarMenu>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  asChild
                  isActive={item.isAction ? false : item.active}
                  variant={item.isAction ? "default" : "default"}
                  size="default"
                  tooltip={item.label}
                  onClick={item.onClick}
                  className={item.isAction ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}
                >
                  <button className="w-full justify-start gap-2">
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      {/* Footer with User Info */}
      {(userName || userEmail) && (
        <SidebarFooter className="border-t">
          <div className="space-y-2">
            <div className="text-xs space-y-0.5 px-2 py-2">
              <p className="font-medium text-foreground truncate">{userName}</p>
              <p className="text-muted-foreground text-xs truncate">{userEmail}</p>
            </div>
            {onLogout && (
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={onLogout}
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </Button>
            )}
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
};

export default Navigation;
