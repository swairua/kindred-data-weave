import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useContext } from "react";
import { LayoutDashboard, FlaskConical, FileText, Hammer, LogOut, Layers, ChevronRight, Sigma, Users, Settings as SettingsIcon, PackageOpen, Package, Wrench, User } from "lucide-react";
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
import { useProject } from "@/context/ProjectContext";
import { generateFormulasReferencePDF } from "@/lib/formulasReferencePdfGenerator";
import { toast } from "sonner";
import { useNavigationLoading } from "@/context/NavigationLoadingContext";
import { Loader2 } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import type { ApiUser } from "@/lib/api";

export type NavigationView = "dashboard" | "tests" | "coring" | "reports" | "results" | "projects" | "admin" | "users" | "settings" | "reception" | "profile";

interface NavigationProps {
  currentView: NavigationView;
  onViewChange: (view: NavigationView) => void;
  onLogout?: () => void;
  userName?: string;
  userEmail?: string;
  user?: ApiUser; // Optional user prop for pages that don't use ProtectedLayout
}

const Navigation = ({
  currentView,
  onViewChange,
  onLogout,
  userName,
  userEmail,
  user: propsUser,
}: NavigationProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setOpenMobile, isMobile } = useSidebar();
  const project = useProject();
  const { isNavigating, navigationProgress, startNavigation, completeNavigation } = useNavigationLoading();
  
  // Use user from props if provided, otherwise fall back to SessionContext
  const session = useSession();
  const user = propsUser || session?.user;
  const { hasPermission, isLoading: permissionsLoading } = useUserPermissions(user);

  // Map navigation items to their required table permissions
  const getTableForView = (view: NavigationView): string => {
    switch (view) {
      case "reception":
        return "reception_consignments";
      case "tests":
        return "test_definitions";
      case "results":
        return "test_results";
      case "projects":
        return "projects";
      case "users":
        return "users";
      case "settings":
        return "settings";
      case "admin":
        return "users"; // admin page requires user management permission
      case "profile":
        return ""; // Profile accessible to all authenticated users
      default:
        return "";
    }
  };

  // Filter navigation items based on user permissions
  const filterNavItems = (items: NavItem[]): NavItem[] => {
    if (permissionsLoading) return []; // Show nothing while loading
    return items.filter((item) => {
      const tableName = getTableForView(item.id);
      if (!tableName) return true; // Allow items without specific table requirements
      return hasPermission(tableName);
    });
  };

  // Handle browser back/forward navigation
  useEffect(() => {
    const handleLocationChange = () => {
      startNavigation();
      // Complete after a short delay to allow the new route to render
      const timer = setTimeout(completeNavigation, 300);
      return () => clearTimeout(timer);
    };
    handleLocationChange();
  }, [location.pathname, location.search, location.hash, startNavigation, completeNavigation]);

  const handleNavigation = (view: NavigationProps["currentView"], path: string) => {
    startNavigation();
    onViewChange(view);
    navigate(path);
    if (isMobile) setOpenMobile(false);
    // Complete navigation after route change
    setTimeout(completeNavigation, 300);
  };

  /** The single entry point for the calculations & formulas reference PDF. */
  const handleFormulasDownload = async () => {
    try {
      await generateFormulasReferencePDF({ labOrganization: project.labOrganization });
      toast.success("Formulas reference PDF downloaded");
    } catch {
      toast.error("Formulas reference PDF download failed");
    }
    if (isMobile) setOpenMobile(false);
  };

  type NavItem = {
    id: NavigationProps["currentView"];
    label: string;
    icon: typeof LayoutDashboard;
    path: string;
  };
  const labItems: NavItem[] = [
    { id: "reception", label: "Reception", icon: PackageOpen, path: "/reception" },
    { id: "tests", label: "Testing", icon: FlaskConical, path: project.currentProjectId ? `/tests?projectId=${project.currentProjectId}` : "/record" },
    { id: "coring", label: "Coring", icon: Hammer, path: project.currentProjectId ? `/tests?projectId=${project.currentProjectId}#coring` : "/tests#coring" },
    { id: "results", label: "Test Results", icon: FileText, path: "/results" },
    { id: "projects", label: "Projects", icon: Layers, path: project.currentProjectId ? `/projects/${project.currentProjectId}` : "/projects" },
  ];

  const systemItems: NavItem[] = [
    { id: "users", label: "Users", icon: Users, path: "/users" },
    { id: "settings", label: "Settings", icon: SettingsIcon, path: "/settings" },
  ];

  // Filter items based on permissions
  const filteredLabItems = filterNavItems(labItems);
  const filteredSystemItems = filterNavItems(systemItems);

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
              disabled={isNavigating && !isActive}
              isActive={isActive}
              tooltip={item.label}
              className={`
                relative h-10 rounded-full px-3 transition-colors
                ${isActive
                  ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                  : "bg-sidebar-background text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }
                ${isNavigating && !isActive ? "opacity-50 cursor-wait" : ""}
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
    <>
      {isNavigating && (
        <div className="fixed top-0 left-0 right-0 z-50 h-1.5 bg-transparent">
          <div
            className="h-full bg-primary transition-all duration-200 ease-out"
            style={{ width: `${navigationProgress}%` }}
            role="progressbar"
            aria-valuenow={navigationProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      )}
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
            {renderItems(filteredLabItems)}
            <SidebarMenu className="space-y-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => void handleFormulasDownload()}
                  disabled={isNavigating}
                  tooltip="Formulas reference"
                  className="relative h-10 rounded-full px-3 transition-colors text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <Sigma className="h-[18px] w-[18px] flex-shrink-0" />
                  <span className="text-sm font-medium group-data-[collapsible=icon]:hidden">
                    Formulas reference
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </div>

          <div>
            <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground group-data-[collapsible=icon]:hidden">
              System
            </div>
            {renderItems(filteredSystemItems)}
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

            <Button
              variant="ghost"
              size="sm"
              disabled={isNavigating}
              className="w-full justify-start gap-2 mt-2 h-9 text-muted-foreground hover:text-primary hover:bg-primary/10 group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:mt-0"
              onClick={() => handleNavigation("profile", "/profile")}
            >
              <User className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm group-data-[collapsible=icon]:hidden">Profile</span>
            </Button>

            {onLogout && (
              <Button
                variant="ghost"
                size="sm"
                disabled={isNavigating}
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
    </>
  );
};

export default Navigation;
