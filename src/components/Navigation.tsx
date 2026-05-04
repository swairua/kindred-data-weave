import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, FlaskConical, FileText, Hammer, LogOut, Layers, ChevronRight } from "lucide-react";
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
  const { setOpenMobile, isMobile } = useSidebar();

  const handleNavigation = (view: NavigationProps["currentView"], path: string) => {
    onViewChange(view);
    navigate(path);
    if (isMobile) setOpenMobile(false);
  };

  type NavItem = {
    id: NavigationProps["currentView"];
    label: string;
    icon: typeof LayoutDashboard;
    path: string;
  };
  const labItems: NavItem[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/" },
    { id: "tests", label: "Record test", icon: FlaskConical, path: "/record" },
    { id: "reports", label: "Reports", icon: FileText, path: "/reports" },
  ];
  const systemItems: NavItem[] = [
    { id: "admin", label: "Admin", icon: Hammer, path: "/admin" },
  ];

  const initials = (userName || userEmail || "?")
    .split(/[\s@]+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const renderItems = (items: NavItem[]) => (
    <SidebarMenu className="space-y-1">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = currentView === item.id;
        return (
          <SidebarMenuItem key={item.id}>
            <SidebarMenuButton
              onClick={() => handleNavigation(item.id, item.path)}
              isActive={isActive}
              tooltip={item.label}
              className={`
                relative h-10 rounded-full px-3 transition-colors
                ${isActive
                  ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }
              `}
            >
              <Icon className={`h-[18px] w-[18px] flex-shrink-0 ${isActive ? "text-primary-foreground" : ""}`} />
              <span className="text-sm font-medium group-data-[collapsible=icon]:hidden">
                {item.label}
              </span>
              {isActive && (
                <ChevronRight className="h-4 w-4 ml-auto text-primary-foreground/80 group-data-[collapsible=icon]:hidden" />
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );

  return (
    <Sidebar collapsible="icon" variant="sidebar" className="border-r" style={{ backgroundColor: "#F4F3EF", borderColor: "#E3E1D9" }}>
      <SidebarHeader className="px-4 py-5 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-3">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 shadow-sm">
            <Layers className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
            <h2 className="font-semibold text-[15px] text-sidebar-foreground tracking-tight leading-tight">
              Cransfield
            </h2>
            <p className="text-[11px] text-muted-foreground leading-tight">
              Geotechnical Lab
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3 gap-4">
        <div>
          <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground group-data-[collapsible=icon]:hidden">
            Lab
          </div>
          {renderItems(labItems)}
        </div>

        <div>
          <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground group-data-[collapsible=icon]:hidden">
            System
          </div>
          {renderItems(systemItems)}
        </div>
      </SidebarContent>

      {(userName || userEmail || onLogout) && (
        <SidebarFooter className="border-t border-sidebar-border p-3 group-data-[collapsible=icon]:p-2">
          <div className="flex items-center gap-2.5 rounded-xl bg-card px-2.5 py-2 border border-sidebar-border group-data-[collapsible=icon]:hidden">
            <div className="h-8 w-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xs font-semibold flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              {userName && (
                <p className="text-xs font-semibold text-foreground truncate leading-tight">{userName}</p>
              )}
              {userEmail && (
                <p className="text-[11px] text-muted-foreground truncate leading-tight">{userEmail}</p>
              )}
            </div>
          </div>

          {onLogout && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 mt-2 h-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:mt-0"
              onClick={() => {
                onLogout();
                if (isMobile) setOpenMobile(false);
              }}
            >
              <LogOut className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm group-data-[collapsible=icon]:hidden">Sign out</span>
            </Button>
          )}
        </SidebarFooter>
      )}
    </Sidebar>
  );
};

export default Navigation;
