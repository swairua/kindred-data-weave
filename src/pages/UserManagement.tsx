import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Users, Loader2, ChevronLeft, ChevronRight, Lock, Plus, Edit2, Trash2 } from "lucide-react";
import Navigation from "@/components/Navigation";
import { listRecords, createRecord, deleteRecord, updateRecord } from "@/lib/api";
import { toast } from "sonner";

interface ApiUser {
  id: number;
  name: string;
  email: string;
  created_at?: string;
  updated_at?: string;
}

interface UserAllowedTable {
  id: number;
  user_id: number;
  table_name: string;
  created_at?: string;
}

const AVAILABLE_TABLES = [
  'projects',
  'test_definitions',
  'test_results',
  'atterberg_instances',
  'atterberg_rows',
  'admin_images',
  'admin_images_audit',
  'users',
];

// Helper function to check if a user is an admin
const isAdminUser = (userId: number): boolean => {
  return userId === 1;
};

const UserManagement = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [userPermissions, setUserPermissions] = useState<Map<number, Set<string>>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Permission dialog state
  const [selectedUser, setSelectedUser] = useState<ApiUser | null>(null);
  const [isPermissionDialogOpen, setIsPermissionDialogOpen] = useState(false);
  const [permissionChanges, setPermissionChanges] = useState<Map<string, boolean>>(new Map());
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);

  // Create/Edit dialog state
  const [isCreateEditDialogOpen, setIsCreateEditDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", password: "" });
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Delete dialog state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<ApiUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const itemsPerPage = 10;

  // Fetch users and their permissions from API
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        
        // Load all users
        const usersResponse = await listRecords<ApiUser>("users", { limit: 100 });
        setUsers(usersResponse.data || []);

        // Load all user permissions
        const permissionsResponse = await listRecords<UserAllowedTable>("user_allowed_tables", { limit: 1000 });
        const permissionsData = permissionsResponse.data || [];
        
        // Build a map of user_id -> Set of table names
        const permMap = new Map<number, Set<string>>();
        permissionsData.forEach((perm) => {
          if (!permMap.has(perm.user_id)) {
            permMap.set(perm.user_id, new Set());
          }
          permMap.get(perm.user_id)!.add(perm.table_name);
        });
        setUserPermissions(permMap);
      } catch (error) {
        console.error("Failed to load users or permissions:", error);
        toast.error("Failed to load users");
        setUsers([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // Filter users based on search query
  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const searchLower = searchQuery.toLowerCase();
      return (
        user.name?.toLowerCase().includes(searchLower) ||
        user.email?.toLowerCase().includes(searchLower)
      );
    });
  }, [users, searchQuery]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

  const handleLogout = () => {
    toast.success("Logged out");
    navigate("/login", { replace: true });
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = "Name is required";
    }

    if (!formData.email.trim()) {
      errors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = "Please enter a valid email address";
    }

    // Check for duplicate email (excluding current user in edit mode)
    const isDuplicateEmail = users.some(
      (u) => u.email?.toLowerCase() === formData.email.toLowerCase() &&
             (!isEditMode || u.id !== selectedUser?.id)
    );
    if (isDuplicateEmail) {
      errors.email = "This email is already in use";
    }

    // Validate password for new users only
    if (!isEditMode && !formData.password.trim()) {
      errors.password = "Password is required";
    } else if (!isEditMode && formData.password.trim().length < 6) {
      errors.password = "Password must be at least 6 characters";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const openCreateDialog = () => {
    setIsEditMode(false);
    setSelectedUser(null);
    setFormData({ name: "", email: "", password: "" });
    setFormErrors({});
    setIsCreateEditDialogOpen(true);
  };

  const openEditDialog = (user: ApiUser) => {
    setIsEditMode(true);
    setSelectedUser(user);
    setFormData({ name: user.name || "", email: user.email || "", password: "" });
    setFormErrors({});
    setIsCreateEditDialogOpen(true);
  };

  const closeCreateEditDialog = () => {
    setIsCreateEditDialogOpen(false);
    setFormData({ name: "", email: "", password: "" });
    setFormErrors({});
  };

  const saveUser = async () => {
    if (!validateForm()) return;

    try {
      setIsSavingUser(true);

      if (isEditMode && selectedUser) {
        // Update existing user
        await updateRecord("users", selectedUser.id, {
          name: formData.name.trim(),
          email: formData.email.trim(),
        });

        // Update local state
        const updatedUsers = users.map((u) =>
          u.id === selectedUser.id
            ? { ...u, name: formData.name.trim(), email: formData.email.trim() }
            : u
        );
        setUsers(updatedUsers);
        toast.success(`User "${formData.name}" updated successfully`);
      } else {
        // Create new user
        const newUser = await createRecord<ApiUser>("users", {
          name: formData.name.trim(),
          email: formData.email.trim(),
          password: formData.password.trim(),
        });

        // Add to local state
        if (newUser.data) {
          setUsers([...users, newUser.data]);
          toast.success(`User "${formData.name}" created successfully`);
        }
      }

      closeCreateEditDialog();
    } catch (error) {
      console.error("Failed to save user:", error);
      toast.error("Failed to save user");
    } finally {
      setIsSavingUser(false);
    }
  };

  const openDeleteDialog = (user: ApiUser) => {
    setUserToDelete(user);
    setIsDeleteDialogOpen(true);
  };

  const deleteUser = async () => {
    if (!userToDelete) return;

    try {
      setIsDeleting(true);
      await deleteRecord("users", userToDelete.id);

      // Update local state
      setUsers(users.filter((u) => u.id !== userToDelete.id));

      toast.success(`User "${userToDelete.name}" deleted successfully`);
      setIsDeleteDialogOpen(false);
      setUserToDelete(null);
    } catch (error) {
      console.error("Failed to delete user:", error);
      toast.error("Failed to delete user");
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "-";
    try {
      const date = new Date(dateString);
      return date.toLocaleString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  const getUserTableCount = (userId: number) => {
    return userPermissions.get(userId)?.size || 0;
  };

  const openPermissionDialog = (user: ApiUser) => {
    setSelectedUser(user);
    const currentTables = userPermissions.get(user.id) || new Set();
    const changes = new Map<string, boolean>();
    AVAILABLE_TABLES.forEach((table) => {
      changes.set(table, currentTables.has(table));
    });
    setPermissionChanges(changes);
    setIsPermissionDialogOpen(true);
  };

  const savePermissions = async () => {
    if (!selectedUser) return;

    try {
      setIsSavingPermissions(true);
      const currentTables = userPermissions.get(selectedUser.id) || new Set();
      
      // Find tables that need to be added or removed
      const tablesToAdd: string[] = [];
      const tablesToRemove: string[] = [];

      permissionChanges.forEach((isSelected, tableName) => {
        const hasPermission = currentTables.has(tableName);
        
        if (isSelected && !hasPermission) {
          tablesToAdd.push(tableName);
        } else if (!isSelected && hasPermission) {
          tablesToRemove.push(tableName);
        }
      });

      // Add new permissions
      for (const tableName of tablesToAdd) {
        await createRecord("user_allowed_tables", {
          user_id: selectedUser.id,
          table_name: tableName,
        });
      }

      // Remove old permissions - we need to find the record ID first
      for (const tableName of tablesToRemove) {
        // Find the record ID by looking at the permissions response
        const permissionsResponse = await listRecords<UserAllowedTable>("user_allowed_tables", { limit: 1000 });
        const recordToDelete = (permissionsResponse.data || []).find(
          (p) => p.user_id === selectedUser.id && p.table_name === tableName
        );
        if (recordToDelete) {
          await deleteRecord("user_allowed_tables", recordToDelete.id);
        }
      }

      // Update local state
      const newPermSet = new Set<string>(
        Array.from(permissionChanges.entries())
          .filter(([, isSelected]) => isSelected)
          .map(([tableName]) => tableName)
      );
      
      const newPermMap = new Map(userPermissions);
      newPermMap.set(selectedUser.id, newPermSet);
      setUserPermissions(newPermMap);

      toast.success(`Permissions updated for ${selectedUser.name}`);
      setIsPermissionDialogOpen(false);
    } catch (error) {
      console.error("Failed to save permissions:", error);
      toast.error("Failed to save permissions");
    } finally {
      setIsSavingPermissions(false);
    }
  };

  return (
    <SidebarProvider>
      <Navigation
        currentView="admin"
        onViewChange={() => {}}
        onLogout={handleLogout}
      />
      <SidebarInset>
        <div className="flex flex-col min-h-screen bg-background">
          {/* Header */}
          <header className="border-b bg-card sticky top-0 z-10">
            <div className="flex items-center justify-between h-14 px-4 gap-2">
              <div className="flex items-center gap-2">
                <SidebarTrigger />
                <div>
                  <h1 className="text-lg font-semibold">User Management</h1>
                  <p className="text-xs text-muted-foreground">
                    Manage system users and their table access permissions
                  </p>
                </div>
              </div>
              <Button
                onClick={openCreateDialog}
                size="sm"
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Create User
              </Button>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 overflow-auto">
            <div className="p-6">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Users</CardTitle>
                      <CardDescription>
                        {filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""} found
                        {totalPages > 1 && ` • Page ${currentPage} of ${totalPages}`}
                      </CardDescription>
                    </div>
                  </div>

                  {/* Search */}
                  <div className="mt-6 max-w-xs">
                    <Input
                      placeholder="Search by name or email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-10"
                    />
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : users.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                        <Users className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="text-lg font-medium text-foreground mb-1">
                        No users found
                      </p>
                      <p className="text-sm text-muted-foreground max-w-sm">
                        There are no users in the system yet.
                      </p>
                    </div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                        <Users className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="text-lg font-medium text-foreground mb-1">
                        No matching users
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Try adjusting your search query.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/40 hover:bg-muted/40">
                              <TableHead className="font-semibold">NAME</TableHead>
                              <TableHead className="font-semibold">EMAIL</TableHead>
                              <TableHead className="font-semibold">ALLOWED TABLES</TableHead>
                              <TableHead className="font-semibold">CREATED</TableHead>
                              <TableHead className="font-semibold text-right">ACTIONS</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {paginatedUsers.map((user) => (
                              <TableRow
                                key={user.id}
                                className="border-b last:border-0 hover:bg-muted/50"
                              >
                                <TableCell className="font-medium">
                                  {user.name || "-"}
                                </TableCell>
                                <TableCell>{user.email || "-"}</TableCell>
                                <TableCell className="text-sm">
                                  <div className="flex items-center gap-2">
                                    <Lock className="h-4 w-4 text-muted-foreground" />
                                    {getUserTableCount(user.id)}/{AVAILABLE_TABLES.length}
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm">
                                  {formatDate(user.created_at)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center gap-2 justify-end">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openPermissionDialog(user)}
                                    >
                                      Manage Access
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openEditDialog(user)}
                                      className="gap-1"
                                    >
                                      <Edit2 className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openDeleteDialog(user)}
                                      disabled={isAdminUser(user.id)}
                                      className={`gap-1 ${
                                        isAdminUser(user.id)
                                          ? "text-muted-foreground opacity-50 cursor-not-allowed"
                                          : "text-destructive hover:text-destructive"
                                      }`}
                                      title={isAdminUser(user.id) ? "Cannot delete admin user" : undefined}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Pagination Controls */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between pt-2">
                          <p className="text-sm text-muted-foreground">
                            Showing {startIndex + 1} to {Math.min(endIndex, filteredUsers.length)} of {filteredUsers.length}
                          </p>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                              disabled={currentPage === 1}
                              className="gap-1"
                            >
                              <ChevronLeft className="h-4 w-4" />
                              Previous
                            </Button>
                            <div className="flex items-center gap-1">
                              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                                <Button
                                  key={page}
                                  variant={page === currentPage ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => setCurrentPage(page)}
                                  className="w-8 h-8 p-0"
                                >
                                  {page}
                                </Button>
                              ))}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                              disabled={currentPage === totalPages}
                              className="gap-1"
                            >
                              Next
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </SidebarInset>

      {/* Permission Management Dialog */}
      <Dialog open={isPermissionDialogOpen} onOpenChange={setIsPermissionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Access for {selectedUser?.name}</DialogTitle>
            <DialogDescription>
              Select which database tables this user can access
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {isAdminUser(selectedUser?.id || 0) && (
              <p className="text-sm text-muted-foreground bg-muted p-3 rounded mb-4">
                Admin access is managed separately. Permissions cannot be modified here.
              </p>
            )}
            {AVAILABLE_TABLES.map((tableName) => (
              <div key={tableName} className="flex items-center space-x-2">
                <Checkbox
                  id={`table-${tableName}`}
                  checked={permissionChanges.get(tableName) || false}
                  onCheckedChange={(checked) => {
                    const newChanges = new Map(permissionChanges);
                    newChanges.set(tableName, checked as boolean);
                    setPermissionChanges(newChanges);
                  }}
                  disabled={isSavingPermissions || isAdminUser(selectedUser?.id || 0)}
                />
                <label
                  htmlFor={`table-${tableName}`}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  {tableName.replace(/_/g, " ")}
                </label>
              </div>
            ))}
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button
              variant="outline"
              onClick={() => setIsPermissionDialogOpen(false)}
              disabled={isSavingPermissions}
            >
              Cancel
            </Button>
            <Button
              onClick={savePermissions}
              disabled={isSavingPermissions}
            >
              {isSavingPermissions ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create/Edit User Dialog */}
      <Dialog open={isCreateEditDialogOpen} onOpenChange={setIsCreateEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isEditMode ? "Edit User" : "Create New User"}
            </DialogTitle>
            <DialogDescription>
              {isEditMode
                ? "Update user information"
                : "Add a new user to the system"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="user-name">Name *</Label>
              <Input
                id="user-name"
                placeholder="Enter full name"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  if (formErrors.name) {
                    setFormErrors({ ...formErrors, name: "" });
                  }
                }}
                disabled={isSavingUser}
                className={formErrors.name ? "border-red-500" : ""}
              />
              {formErrors.name && (
                <p className="text-sm text-red-500">{formErrors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-email">Email *</Label>
              <Input
                id="user-email"
                type="email"
                placeholder="Enter email address"
                value={formData.email}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value });
                  if (formErrors.email) {
                    setFormErrors({ ...formErrors, email: "" });
                  }
                }}
                disabled={isSavingUser || (isEditMode && isAdminUser(selectedUser?.id || 0))}
                className={formErrors.email ? "border-red-500" : ""}
                title={isEditMode && isAdminUser(selectedUser?.id || 0) ? "Admin email cannot be changed" : undefined}
              />
              {formErrors.email && (
                <p className="text-sm text-red-500">{formErrors.email}</p>
              )}
              {isEditMode && isAdminUser(selectedUser?.id || 0) && (
                <p className="text-sm text-muted-foreground">Admin email cannot be changed</p>
              )}
            </div>

            {!isEditMode && (
              <div className="space-y-2">
                <Label htmlFor="user-password">Password *</Label>
                <Input
                  id="user-password"
                  type="password"
                  placeholder="Enter password"
                  value={formData.password}
                  onChange={(e) => {
                    setFormData({ ...formData, password: e.target.value });
                    if (formErrors.password) {
                      setFormErrors({ ...formErrors, password: "" });
                    }
                  }}
                  disabled={isSavingUser}
                  className={formErrors.password ? "border-red-500" : ""}
                />
                {formErrors.password && (
                  <p className="text-sm text-red-500">{formErrors.password}</p>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button
              variant="outline"
              onClick={closeCreateEditDialog}
              disabled={isSavingUser}
            >
              Cancel
            </Button>
            <Button
              onClick={saveUser}
              disabled={isSavingUser}
            >
              {isSavingUser ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : isEditMode ? (
                "Update User"
              ) : (
                "Create User"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-semibold">{userToDelete?.name}</span>?
              This action cannot be undone. All associated data will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2 justify-end pt-4">
            <AlertDialogCancel disabled={isDeleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteUser}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete User"
              )}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
};

export default UserManagement;
