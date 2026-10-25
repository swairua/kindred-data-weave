import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FlaskConical, Package, FileText, Layers, Wrench, ChevronRight } from "lucide-react";
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
  { id: "reports", label: "Reports", icon: FileText, path: "/reports" },
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
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-8 w-8 rounded bg-teal-500 text-white">
            <FlaskConical className="h-5 w-5" />
          </div>
          <span className="font-semibold text-lg tracking-tight">Cransfield LIMS</span>
        </div>

        {/* Tabs */}
        <div className="hidden md:flex items-center gap-1">
          {labItems.map((item) => {
            const isActive = item.id === currentView;
            return (
              <button
                key={item.id}
                onClick={() => handleViewChange(item)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-teal-600 text-white shadow-md"
                    : "text-gray-300 hover:text-white hover:bg-gray-800"
                }`}
              >
                <item.icon className={`h-4 w-4 mr-2 ${isActive ? "text-white" : "text-gray-400"}`} />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Right side - user context + actions */}
        <div className="flex items-center gap-3">
          {user || (userName || userEmail) ? (
            <div className="hidden md:flex items-center gap-2 text-right">
              <div>
                <p className="text-sm font-medium text-white leading-tight">{user?.name || userName}</p>
                <p className="text-xs text-gray-400 leading-tight">{user?.email || userEmail}</p>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
              >
                <span className="h-3 w-3 text-gray-400">⏻</span>
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          ) : null}

          <button
            className="md:hidden p-2 text-gray-300 hover:text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Menu"
          >
            <span className="h-0.5 w-6 bg-white/50"></span>
            <span className="h-0.5 w-6 bg-white/50"></span>
            <span className="h-0.5 w-6 bg-white/50"></span>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-gray-900 border-t border-gray-800">
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
