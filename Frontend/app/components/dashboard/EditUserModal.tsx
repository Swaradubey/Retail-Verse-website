import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User as UserIcon, Mail, Phone, Shield, Loader2, Save } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import { userApi, type PlatformUserRow } from '../../api/user';
import { roleDisplayName } from '../../utils/roleOpenPanelConfig';

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: PlatformUserRow | null;
  onUpdate: (updatedUser: PlatformUserRow) => void;
  isSuperAdmin: boolean;
}

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
  'vendor',
  'VENDOR',
];

const ADMIN_ALLOWED_ROLES = ['admin', 'counter_manager', 'seo_manager', 'store_manager', 'inventory_manager', 'employee', 'user', 'client', 'vendor', 'VENDOR'];

export function EditUserModal({ isOpen, onClose, user, onUpdate, isSuperAdmin }: EditUserModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        role: user.role || '',
      });
    }
  }, [user]);

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!formData.role.trim()) {
      toast.error('Role is required');
      return;
    }

    // Normalize role to lowercase before saving (e.g. "Client" → "client")
    const normalizedRole = formData.role.trim().toLowerCase();

    setSubmitting(true);
    try {
      // Update the role if it changed.
      if (normalizedRole !== user.role) {
        const roleRes = await userApi.patchPlatformUserRole(user._id, normalizedRole);
        if (!roleRes.success) throw new Error(roleRes.message || 'Failed to update role');
      }
      
      toast.success('User updated successfully');
      onUpdate({ ...user, ...formData } as PlatformUserRow);
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update user');
    } finally {
      setSubmitting(false);
    }
  };

  let roleOptions = isSuperAdmin 
    ? [...ASSIGNABLE_ROLES] 
    : (user.role === 'admin' ? ['admin'] : [...ADMIN_ALLOWED_ROLES]);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-white/20 bg-white/90 dark:bg-zinc-900/90 shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-white/5 px-8 py-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <UserIcon className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Edit User</h2>
                <p className="text-xs text-muted-foreground">Modify account details and permissions</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Full Name</Label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    className="pl-10 h-12 rounded-xl border-gray-200 dark:border-white/10 bg-white/50 dark:bg-black/20"
                    value={formData.name}
                    disabled
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    className="pl-10 h-12 rounded-xl border-gray-200 dark:border-white/10 bg-white/50 dark:bg-black/20"
                    value={formData.email}
                    disabled
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    className="pl-10 h-12 rounded-xl border-gray-200 dark:border-white/10 bg-white/50 dark:bg-black/20"
                    value={formData.phone}
                    disabled
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Assign Role</Label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none z-10" />
                  <Input
                    className="pl-10 h-12 rounded-xl border-gray-200 dark:border-white/10 bg-white/50 dark:bg-black/20"
                    placeholder="Type or select a role..."
                    value={formData.role}
                    list="role-suggestions"
                    onChange={e => setFormData({ ...formData, role: e.target.value })}
                    disabled={user.role === 'super_admin'}
                  />
                  <datalist id="role-suggestions">
                    {roleOptions.map((r) => (
                      <option key={r} value={r}>
                        {roleDisplayName(r)}
                      </option>
                    ))}
                  </datalist>
                </div>
              </div>
            </div>

            <div className="pt-4 flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="h-12 flex-1 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="h-12 flex-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20"
                disabled={submitting || user.role === 'super_admin'}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
