import { useEffect, useState, useCallback } from "react";
import { listRecords } from "@/lib/api";
import type { ApiUser } from "@/lib/api";

interface UserPermission {
  user_id: number;
  table_name: string;
}

// Check if user is admin (id=1 is the default admin user)
const isAdminUser = (userId: number): boolean => {
  return userId === 1;
};

export const useUserPermissions = (user: ApiUser | null) => {
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  const loadPermissions = useCallback(async () => {
    if (!user) {
      setPermissions(new Set());
      return;
    }

    // Admin user has access to everything
    if (isAdminUser(user.id)) {
      setPermissions(new Set()); // Empty set means all access for admin
      return;
    }

    setIsLoading(true);
    try {
      const response = await listRecords<UserPermission>("user_allowed_tables", { limit: 1000 });
      const data = response.data || [];
      const permSet = new Set<string>();
      data.forEach((perm) => {
        if (perm.user_id === user.id) {
          permSet.add(perm.table_name);
        }
      });
      setPermissions(permSet);
    } catch (error) {
      console.error("Failed to load user permissions:", error);
      setPermissions(new Set());
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  const hasPermission = useCallback((tableName: string): boolean => {
    // Admin user has access to everything
    const userId = user?.id;
    if (isAdminUser(userId ?? 0)) return true;
    
    // Admin tables are always accessible
    const adminTables = ["users", "user_allowed_tables"];
    if (adminTables.includes(tableName)) return true;
    return permissions.has(tableName);
  }, [permissions, user]);

  return { permissions, hasPermission, isLoading, refreshPermissions: loadPermissions };
};

export default useUserPermissions;