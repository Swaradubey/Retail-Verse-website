import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserPlus, AlertCircle, MapPin, Phone, User, Mail, Lock } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { employeesApi } from '../../api/employees';
import { storeManagersApi, type StoreManager } from '../../api/storeManagers';
import { useAuth } from '../../context/AuthContext';

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldErrors = Partial<
  Record<'name' | 'email' | 'phone' | 'address' | 'password' | 'confirmPassword', string>
>;

interface EmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  clientIdOverride?: string | null;
  role?: 'employee' | 'staff' | 'seo_manager' | 'store_manager' | 'inventory_manager' | 'VENDOR' | 'vendor';
  title?: string;
  subtitle?: string;
  submitLabel?: string;
}

export function EmployeeModal({
  isOpen,
  onClose,
  onCreated,
  clientIdOverride = null,
  role = 'employee',
  title = 'Add employee',
  subtitle = 'Add contact details and optional store manager assignment',
  submitLabel = 'Save employee',
}: EmployeeModalProps) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [managerId, setManagerId] = useState<string>('');
  const [managers, setManagers] = useState<StoreManager[]>([]);
  const [managersLoading, setManagersLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const effectiveClientId =
    user?.role === 'super_admin' ? clientIdOverride?.trim() || '' : user?.clientId || '';

  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setEmail('');
    setPhone('');
    setAddress('');
    setPassword('');
    setConfirmPassword('');
    setManagerId('');
    setFieldErrors({});
    setError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !effectiveClientId) {
      setManagers([]);
      return;
    }
    setManagersLoading(true);
    void (async () => {
      try {
        const res = await storeManagersApi.listByClient(effectiveClientId);
        if (res.success && Array.isArray(res.data)) {
          setManagers(res.data);
        } else {
          setManagers([]);
        }
      } catch {
        setManagers([]);
      } finally {
        setManagersLoading(false);
      }
    })();
  }, [isOpen, effectiveClientId]);

  const validate = (): boolean => {
    const next: FieldErrors = {};
    if (!name.trim()) next.name = 'Name is required';
    if (!email.trim()) next.email = 'Email is required';
    else if (!emailRe.test(email.trim())) next.email = 'Enter a valid email address';
    if (!phone.trim()) next.phone = 'Phone number is required';
    else if (phone.replace(/\D/g, '').length < 10) {
      next.phone = 'Enter a valid phone number (at least 10 digits)';
    }
    if (!address.trim()) next.address = 'Address is required';
    if (!password) next.password = 'Password is required';
    else if (password.length < 8) next.password = 'Password must be at least 8 characters';
    if (password !== confirmPassword) next.confirmPassword = 'Passwords do not match';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (user?.role === 'super_admin' && !clientIdOverride?.trim()) {
      setError('Client is required — use Add employee from a client row in the table.');
      return;
    }
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const body = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        phone: phone.trim(),
        address: address.trim(),
        role,
        ...(managerId && managerId !== '_none' ? { managerId } : {}),
        ...(effectiveClientId ? { clientId: effectiveClientId } : {}),
      };
      const res = await employeesApi.create(body);
      if (res.success) {
        onCreated();
        onClose();
      } else {
        throw new Error(res.message || 'Could not add employee');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#09090b]"
        >
          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 px-6 py-4 dark:border-white/5 dark:bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                <UserPlus className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {subtitle}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-200 dark:hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 flex items-center gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
              >
                <AlertCircle className="h-5 w-5 shrink-0" />
                {error}
              </motion.div>
            )}

            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="emp-name" className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                  <User className="h-3.5 w-3.5 text-violet-500" />
                  Name
                </Label>
                <Input
                  id="emp-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: undefined }));
                  }}
                  placeholder="Full name"
                  className="h-11 rounded-xl border-slate-200 dark:border-white/10"
                  autoComplete="name"
                />
                {fieldErrors.name && (
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.name}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="emp-email" className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                  <Mail className="h-3.5 w-3.5 text-violet-500" />
                  Email
                </Label>
                <Input
                  id="emp-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
                  }}
                  placeholder="name@company.com"
                  className="h-11 rounded-xl border-slate-200 dark:border-white/10"
                  autoComplete="email"
                />
                {fieldErrors.email && (
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="emp-phone" className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                  <Phone className="h-3.5 w-3.5 text-violet-500" />
                  Phone number
                </Label>
                <Input
                  id="emp-phone"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (fieldErrors.phone) setFieldErrors((p) => ({ ...p, phone: undefined }));
                  }}
                  placeholder="Phone number"
                  className="h-11 rounded-xl border-slate-200 dark:border-white/10"
                  autoComplete="tel"
                />
                {fieldErrors.phone && (
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.phone}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="emp-address" className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                  <MapPin className="h-3.5 w-3.5 text-violet-500" />
                  Address
                </Label>
                <Textarea
                  id="emp-address"
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    if (fieldErrors.address) setFieldErrors((p) => ({ ...p, address: undefined }));
                  }}
                  placeholder="Street, city, postal code"
                  rows={3}
                  className="resize-none rounded-xl border-slate-200 dark:border-white/10"
                />
                {fieldErrors.address && (
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.address}</p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label
                    htmlFor="emp-password"
                    className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200"
                  >
                    <Lock className="h-3.5 w-3.5 text-violet-500" />
                    Password
                  </Label>
                  <Input
                    id="emp-password"
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
                    }}
                    placeholder="Min. 8 characters"
                    className="h-11 rounded-xl border-slate-200 dark:border-white/10"
                    autoComplete="new-password"
                  />
                  {fieldErrors.password && (
                    <p className="text-xs font-medium text-red-600 dark:text-red-400">{fieldErrors.password}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="emp-confirm"
                    className="text-sm font-medium text-slate-700 dark:text-slate-200"
                  >
                    Confirm password
                  </Label>
                  <Input
                    id="emp-confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (fieldErrors.confirmPassword)
                        setFieldErrors((p) => ({ ...p, confirmPassword: undefined }));
                    }}
                    placeholder="Repeat password"
                    className="h-11 rounded-xl border-slate-200 dark:border-white/10"
                    autoComplete="new-password"
                  />
                  {fieldErrors.confirmPassword && (
                    <p className="text-xs font-medium text-red-600 dark:text-red-400">
                      {fieldErrors.confirmPassword}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Store manager (optional)
                </Label>
                <Select
                  value={managerId || '_none'}
                  onValueChange={(v) => setManagerId(v === '_none' ? '' : v)}
                  disabled={managersLoading}
                >
                  <SelectTrigger className="h-11 rounded-xl border-slate-200 dark:border-white/10">
                    <SelectValue
                      placeholder={
                        managersLoading
                          ? 'Loading managers…'
                          : managers.length === 0
                            ? 'No store managers yet (optional)'
                            : 'Assign to a store manager'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {managers.map((m) => (
                      <SelectItem key={m._id} value={m._id}>
                        {m.email ? `${m.name} (${m.email})` : m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!managersLoading && managers.length === 0 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No store managers for this client yet. Add one from the directory, or leave as None.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-8 flex flex-wrap justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
                className="h-11 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-11 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 font-semibold text-white shadow-md shadow-violet-500/25"
              >
                {isSubmitting ? 'Saving…' : submitLabel}
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
