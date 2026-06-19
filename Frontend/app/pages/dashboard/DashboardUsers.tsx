import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { ExternalLink, Search, Save, Shield, Phone, UserCheck, UserX, Lock, Clock, User as UserIcon, Trash2 } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";

import { userApi, type PlatformUserRow } from '../../api/user';
import { superadminApi } from '../../api/superadmin';
import { useAuth, IMPERSONATION_SUPER_TOKEN_BACKUP_KEY } from '../../context/AuthContext';
import { getRoleOpenPanelConfig, roleDisplayName } from '../../utils/roleOpenPanelConfig';
import { isSuperAdminRole } from '../../utils/staffRoles';
import { toast } from 'sonner';
import { EditUserModal } from '../../components/dashboard/EditUserModal';

const ASSIGNABLE_ROLES = [
  'super_admin',
  'admin',
  'counter_manager',
  'seo_manager',
  'store_manager',
  'inventory_manager',
  'employee',
  'user',
  'client',
] as const;

export function DashboardUsers() {
  const navigate = useNavigate();
  const { user, refreshSession } = useAuth();

  const isSA =
    user?.role === "super_admin" ||
    user?.role === "superadmin" ||
    user?.role === "Super Admin" ||
    user?.role === "SUPER_ADMIN";

  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<PlatformUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [openingPanelUserId, setOpeningPanelUserId] = useState<string | null>(null);
  const [togglingStatusId, setTogglingStatusId] = useState<string | null>(null);
  const [resettingPasswordId, setResettingPasswordId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<PlatformUserRow | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<PlatformUserRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);


  const limit = 15;

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await userApi.getPlatformUsers({
        page,
        limit,
        search: appliedSearch.trim() || undefined,
      }, { pageName: 'Users & roles' });
      if (!res.success || !res.data) {
        throw new Error(res.message || 'Could not load users');
      }
      setUsers(res.data.users);
      setTotal(res.data.total);
      setPages(res.data.pages);
      setPendingRole({});
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load users';
      setFetchError(msg);
      toast.error(msg);
      setUsers([]);
      setTotal(0);
      setPages(1);
    } finally {
      setLoading(false);
    }
  }, [page, appliedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleOpenRolePanel = async (u: PlatformUserRow) => {
    const cfg = getRoleOpenPanelConfig(u.role);
    if (!cfg) return;

    if (!cfg.useImpersonation) {
      navigate(cfg.path);
      return;
    }

    const cur = localStorage.getItem('eco_shop_token');
    if (cur) {
      localStorage.setItem(IMPERSONATION_SUPER_TOKEN_BACKUP_KEY, cur);
    }
    setOpeningPanelUserId(u._id);
    try {
      const res = await superadminApi.impersonate(u._id);
      if (!res.success || !res.data?.token) {
        throw new Error(res.message || 'Could not open session for this account');
      }
      localStorage.setItem('eco_shop_token', res.data.token);
      await refreshSession();
      toast.success(`Opening ${roleDisplayName(u.role)} as ${u.name}`);
      navigate(cfg.path);
    } catch (e: unknown) {
      localStorage.removeItem(IMPERSONATION_SUPER_TOKEN_BACKUP_KEY);
      toast.error(e instanceof Error ? e.message : 'Failed to open panel');
    } finally {
      setOpeningPanelUserId(null);
    }
  };

  const handleSaveRole = async (u: PlatformUserRow) => {
    const id = u._id;
    const next = pendingRole[id] ?? u.role;
    if (next === u.role) {
      toast.message('No role change');
      return;
    }
    setSavingId(id);
    try {
      const res = await userApi.patchPlatformUserRole(id, next);
      if (!res.success || !res.data) {
        throw new Error(res.message || 'Update failed');
      }
      
      const updatedUser = { ...res.data };
      if ((res as any).store) {
        updatedUser.store = (res as any).store;
        updatedUser.clientId = (res as any).store._id;
      }
      
      toast.success(res.message || 'Role updated');
      setUsers((prev) =>
        prev.map((row) => (String(row._id) === String(updatedUser._id) ? { ...row, ...updatedUser } : row)),
      );
      setPendingRole((prev) => {
        const nextMap = { ...prev };
        delete nextMap[id];
        return nextMap;
      });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not update role');
      setPendingRole((prev) => {
        const nextMap = { ...prev };
        delete nextMap[id];
        return nextMap;
      });
    } finally {
      setSavingId(null);
    }
  };
  
  const handleToggleStatus = async (u: PlatformUserRow) => {
    const id = u._id;
    const nextStatus = !u.isActive;
    setTogglingStatusId(id);
    try {
      const res = await userApi.patchPlatformUserStatus(id, nextStatus);
      if (!res.success) {
        throw new Error(res.message || 'Update failed');
      }
      toast.success(`User ${nextStatus ? 'activated' : 'deactivated'}`);
      setUsers((prev) =>
        prev.map((row) => (String(row._id) === String(id) ? { ...row, isActive: nextStatus } : row)),
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not update status');
    } finally {
      setTogglingStatusId(null);
    }
  };

  const handleResetPassword = async (u: PlatformUserRow) => {
    const newPassword = window.prompt(`Enter new password for ${u.name} (min 8 chars):`);
    if (!newPassword) return;
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    
    setResettingPasswordId(u._id);
    try {
      const res = await userApi.postPlatformUserResetPassword(u._id, newPassword);
      if (!res.success) {
        throw new Error(res.message || 'Reset failed');
      }
      toast.success('Password reset successfully');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not reset password');
    } finally {
      setResettingPasswordId(null);
    }
  };

  const handleDeleteConfirm = async (userId: string) => {
    setIsDeleting(true);
    try {
      const res = await userApi.deletePlatformUser(userId);
      if (!res.success) {
        throw new Error(res.message || 'Delete failed');
      }
      toast.success('User deleted successfully');
      setUsers((prev) => prev.filter((u) => u._id !== userId));
      setTotal((prev) => prev - 1);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not delete user');
    } finally {
      setIsDeleting(false);
      setUserToDelete(null);
    }
  };

  const searchTerm = appliedSearch.trim().toLowerCase();
  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      !searchTerm ||
      user.name?.toLowerCase().includes(searchTerm) ||
      user.email?.toLowerCase().includes(searchTerm) ||
      user.phone?.toLowerCase().includes(searchTerm);

    const matchesRole =
      !selectedRole ||
      user.role?.trim().toLowerCase() === selectedRole.trim().toLowerCase();

    return matchesSearch && matchesRole;
  });

  return (

    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-end justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400 mb-1">
            <Shield className="w-5 h-5" />
            <span className="text-xs font-bold uppercase tracking-wider">Platform</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Users & roles</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Search accounts and assign roles. The seeded Super Admin account cannot be changed
            here.
          </p>
        </div>
      </motion.div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Directory</CardTitle>
          <CardDescription>{filteredUsers.length.toLocaleString()} user(s) match filters</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search name or email…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setPage(1);
                      setAppliedSearch(searchInput.trim());
                    }
                  }}
                />
              </div>
<select
  className="rounded-lg border border-gray-200 dark:border-white/15 bg-white dark:bg-zinc-900 px-3 py-2 text-base font-medium"
  value={selectedRole}
  onChange={(e) => {
    setPage(1);
    setSelectedRole(e.target.value);
  }}
>
<option value="" className="text-base font-medium">All Roles</option>
                 {ASSIGNABLE_ROLES.filter(r => isSA || (user?.role === 'admin' && r === 'user') || r !== 'user').map(r => (
                   <option key={r} value={r} className="text-base font-medium">{roleDisplayName(r)}</option>
                 ))}
              </select>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setPage(1);
                  setAppliedSearch(searchInput.trim());
                }}
              >
                Search
              </Button>
            </div>

          {fetchError ? (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30 px-3 py-2 text-sm text-red-800 dark:text-red-200"
            >
              {fetchError}
            </div>
          ) : null}

          <div className="rounded-xl border border-gray-200 dark:border-white/10 overflow-x-auto">
<table className="w-full text-left">
              <thead className="bg-gray-50 dark:bg-white/5 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold text-[15px]">Name</th>
                  <th className="px-4 py-3 font-semibold text-[15px]">Email / Phone</th>
                  <th className="px-4 py-3 font-semibold text-[15px]">Role</th>
                  <th className="px-4 py-3 font-semibold text-[15px]">Status</th>
                  <th className="px-4 py-3 font-semibold text-[15px]">Created</th>
                  <th className="px-4 py-3 font-semibold text-[15px] w-[100px]">Actions</th>
                  <th className="px-4 py-3 font-semibold text-[15px] w-[100px]" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                      No users found.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const id = u._id;
                    const safeRole = u.role || 'Unknown Role';
                    const safeName = u.name || u.email || 'Unnamed User';
                    const current = pendingRole[id] ?? safeRole;
                    const isAdmin = user?.role === "admin" || user?.role === "Admin";
                    const ADMIN_ALLOWED_ROLES = ['counter_manager', 'seo_manager', 'store_manager', 'inventory_manager', 'employee', 'user', 'client'];

                    let roleOptions: string[] = [];
                    if (safeRole === 'super_admin') {
                      roleOptions = ['super_admin'];
                    } else if (safeRole === 'admin') {
                      roleOptions = ['admin'];
                    } else if (!isSA) {
                      // Tenant Admins (Admin, Client, etc.)
                      if (isAdmin) {
                        // Global Admin can manage employees and users
                        roleOptions = ADMIN_ALLOWED_ROLES;
                      } else {
                        // Other managers
                        roleOptions = ADMIN_ALLOWED_ROLES.filter(r => r !== 'user');
                      }
                      roleOptions = roleOptions.filter(r => r !== 'admin' && r !== 'super_admin');
                    } else {
                      // Super Admin can assign all roles
                      roleOptions = [...ASSIGNABLE_ROLES].filter(r => r !== 'admin' && r !== 'super_admin');
                    }

                    // "client" and all standard roles are known — only treat as isOldRole if it's a truly unknown custom value
                    const ALL_KNOWN_ROLES = [...ASSIGNABLE_ROLES, ...ADMIN_ALLOWED_ROLES];
                    const isOldRole = safeRole !== 'super_admin' && !ALL_KNOWN_ROLES.includes(safeRole as any);

                    const panelCfg = getRoleOpenPanelConfig(safeRole);
                    return (
                      <tr
                        key={id}
                        className="border-t border-gray-100 dark:border-white/10 hover:bg-gray-50/80 dark:hover:bg-white/5"
                      >
                        <td className="px-4 py-3 font-semibold text-[17px] leading-relaxed">{safeName}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-[16px]">{u.email}</span>
                            {u.phone && (
                              <span className="text-[14px] text-muted-foreground flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {u.phone}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {isOldRole ? (
                            <span className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground border border-transparent">
                              {roleDisplayName(safeRole)}
                            </span>
                          ) : (
 <select
   className="rounded-lg border border-gray-200 dark:border-white/15 bg-white dark:bg-zinc-900 px-3 py-2.5 text-[16px] font-medium h-10"
   value={current}
   disabled={safeRole === 'super_admin' || safeRole === 'admin'}
   onChange={(e) => setPendingRole((prev) => ({ ...prev, [id]: e.target.value }))}
 >
 {roleOptions.map((r) => (
   <option key={r} value={r} className="text-[16px] font-medium">
     {roleDisplayName(r)}
   </option>
 ))}
                            </select>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => void handleToggleStatus(u)}
                            disabled={togglingStatusId === id || safeRole === 'super_admin'}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold uppercase tracking-wider transition-all ${
                              u.isActive
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                                : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400'
                            }`}
                          >
                            {u.isActive ? (
                              <UserCheck className="w-3.5 h-3.5" />
                            ) : (
                              <UserX className="w-3.5 h-3.5" />
                            )}
                            {u.isActive ? 'Active' : 'Disabled'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-[13px] whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 opacity-60" />
                            {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {(isSA || isAdmin) && panelCfg ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="h-9 px-2.5"
                                disabled={openingPanelUserId === u._id}
                                onClick={() => {
                                  if (safeRole === 'client' && u.store?.customDomain) {
                                    window.open(`https://${u.store.customDomain}`, '_blank');
                                  } else {
                                    void handleOpenRolePanel(u);
                                  }
                                }}
                                title={
                                  safeRole === 'client' && u.store?.customDomain
                                    ? `Open storefront (${u.store.customDomain})`
                                    : panelCfg.useImpersonation
                                    ? `Open this account's panel (Super Admin impersonation)`
                                    : `Open the ${roleDisplayName(safeRole)} workspace`
                                }
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-9 px-2.5"
                              onClick={() => {
                                setEditingUser(u);
                                setIsEditModalOpen(true);
                              }}
                              title="Edit User"
                            >
                              <UserIcon className="w-4 h-4" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-9 px-2.5"
                              disabled={resettingPasswordId === id || safeRole === 'super_admin'}
                              onClick={() => void handleResetPassword(u)}
                              title="Reset Password"
                            >
                              <Lock className="w-4 h-4" />
                            </Button>
                            {isSA && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-9 px-2.5 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                                disabled={safeRole === 'super_admin' || id === user?._id}
                                onClick={() => setUserToDelete(u)}
                                title="Delete User"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>

                        </td>
                        <td className="px-4 py-3">
                          {safeRole !== 'super_admin' ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className={`h-9 px-3.5 ${current !== safeRole ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10' : ''}`}
                              disabled={savingId === id || current === safeRole}
                              onClick={() => void handleSaveRole(u)}
                            >
                              <Save className="w-4 h-4 mr-1.5" />
                              Save
                            </Button>
                          ) : (
                            <span className="text-[11px] font-bold uppercase text-muted-foreground">Protected</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <Button type="button" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-muted-foreground">
                Page {page} of {pages}
              </span>
              <Button
                type="button"
                variant="ghost"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      
      <EditUserModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        user={editingUser}
        isSuperAdmin={isSuperAdminRole(user?.role)}
        onUpdate={(updated) => {
          setUsers(prev => prev.map(u => u._id === updated._id ? { ...u, ...updated } : u));
        }}
      />

      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this user?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the account for{" "}
              <span className="font-semibold">{userToDelete?.name || userToDelete?.email}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (userToDelete) handleDeleteConfirm(userToDelete._id);
              }}
              disabled={isDeleting}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

