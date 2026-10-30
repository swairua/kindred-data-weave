import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FlaskConical, Package, FileText, Layers, Wrench, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/context/SessionContext";
import { toast } from "sonner";

type NavItem = {
  id: string;
  label: string;
  icon: React.ElementType;
  path: string;
};

const labItems: NavItem[] = [
  { id: "reception", label: "Reception", icon: Package, path: "/reception" },
  { id: "tests", label: "Testing", icon: FileText, path: "/testing" },
  { id: "projects", label: "Jobs & clients", icon: Layers, path: "/projects" },
  { id: "storage", label: "Storage", icon: Package, path: "/storage" },
  { id: "equipment", label: "Equipment", icon: Wrench, path: "/equipment" },
];

interface TopNavbarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  userName?: string;
  userEmail?: string;
  onLogout?: () => void;
}

const TopNavbar = ({ currentView, onViewChange, userName, userEmail, onLogout }: TopNavbarProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useSession();

  const handleViewChange = (item: NavItem) => {
    onViewChange(item.id);
    navigate(item.path);
  };

  const handleLogout = async () => {
    if (onLogout) {
      await onLogout();
    } else {
      await logout();
      toast.success("Logged out");
    }
  };

  const activeItem = labItems.find((item) => item.id === currentView);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900 text-white shadow-lg">
      <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex shrink-0 items-center justify-center h-8 w-8 rounded bg-teal-500 text-white">
            <FlaskConical className="h-5 w-5" />
          </div>
          <span className="font-semibold text-base sm:text-lg tracking-tight leading-tight truncate">Cransfield LIMS</span>
        </div>

        {/* Tabs */}
        <div className="hidden lg:flex items-center gap-1 xl:gap-2">
          {labItems.map((item) => {
            const isActive = item.id === currentView;
            return (
              <button
                key={item.id}
                onClick={() => handleViewChange(item)}
                className={`inline-flex items-center whitespace-nowrap px-3 xl:px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-teal-600 text-white shadow-md"
                    : "text-gray-300 hover:text-white hover:bg-gray-800"
                }`}
              >
                <item.icon className={`h-4 w-4 shrink-0 mr-2 ${isActive ? "text-white" : "text-gray-400"}`} />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Right side - user context + actions */}
        <div className="flex items-center gap-3">
          {user || (userName || userEmail) ? (
            <div className="hidden lg:flex items-center gap-3 xl:gap-4">
              <div className="text-right">
                <p className="text-sm font-medium text-white leading-tight whitespace-nowrap">{user?.name || userName}</p>
                <p className="hidden xl:block text-xs text-gray-400 leading-tight whitespace-nowrap">{user?.email || userEmail}</p>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
              >
                <span className="h-3 w-3 text-gray-400">⏻</span>
                <span>Logout</span>
              </button>
            </div>
          ) : null}

          <button
            className="lg:hidden p-2 text-gray-300 hover:text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Menu"
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-gray-900 border-t border-gray-800 max-h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="px-4 py-4 space-y-2">
            {labItems.map((item) => {
              const isActive = item.id === currentView;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    handleViewChange(item);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left ${
                    isActive
                      ? "bg-teal-600/20 text-teal-200"
                      : "text-gray-300 hover:bg-gray-800 hover:text-white"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                  {isActive && (
                    <span className="ml-auto text-xs font-medium text-teal-400">Active</span>
                  )}
                </button>
              );
            })}
            <div className="pt-4 border-t border-gray-800">
              {(user || userName || userEmail) && (
                <div className="px-3 pb-3">
                  <p className="text-sm font-medium text-white">{user?.name || userName}</p>
                  <p className="text-xs text-gray-400 break-all">{user?.email || userEmail}</p>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
              >
                <span className="h-3 w-3 text-gray-400">⏻</span>
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default TopNavbar;
