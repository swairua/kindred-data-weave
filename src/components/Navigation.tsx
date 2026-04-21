import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X, Plus, LayoutDashboard, FlaskConical, FileText, Hammer } from "lucide-react";

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
  const [isCollapsed, setIsCollapsed] = useState(false);

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
    <aside
      className={`${
        isCollapsed ? "w-20" : "w-64"
      } border-r bg-card transition-all duration-300 flex flex-col h-screen sticky top-0 z-20`}
    >
      {/* Toggle Button */}
      <div className="p-4 flex items-center justify-between border-b">
        <h2
          className={`font-bold text-sm tracking-tight ${
            isCollapsed ? "opacity-0 w-0" : "opacity-100"
          } transition-opacity duration-300`}
        >
          CMTC Lab
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          {isCollapsed ? (
            <Menu className="h-4 w-4" />
          ) : (
            <X className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.id}
              variant={
                item.isAction
                  ? "default"
                  : item.active
                    ? "default"
                    : "ghost"
              }
              size="sm"
              className={`w-full justify-start gap-2 ${isCollapsed ? "px-2" : ""}`}
              onClick={item.onClick}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span
                className={`${
                  isCollapsed ? "hidden" : "inline"
                } text-sm font-medium`}
              >
                {item.label}
              </span>
            </Button>
          );
        })}
      </nav>

      {/* User Info & Logout */}
      {(userName || userEmail) && (
        <div
          className={`border-t p-3 space-y-2 ${
            isCollapsed ? "text-center" : ""
          }`}
        >
          {!isCollapsed && (
            <div className="text-xs space-y-0.5 px-2">
              <p className="font-medium text-foreground truncate">
                {userName}
              </p>
              <p className="text-muted-foreground truncate">{userEmail}</p>
            </div>
          )}
          {onLogout && (
            <Button
              variant="outline"
              size="sm"
              className={`w-full ${isCollapsed ? "px-2" : ""}`}
              onClick={onLogout}
              title={isCollapsed ? "Logout" : undefined}
            >
              <span className={isCollapsed ? "text-xs" : ""}>
                {isCollapsed ? "→" : "Logout"}
              </span>
            </Button>
          )}
        </div>
      )}
    </aside>
  );
};

export default Navigation;
