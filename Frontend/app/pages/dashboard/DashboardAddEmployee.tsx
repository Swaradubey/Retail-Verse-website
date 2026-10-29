import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, User, Mail, Phone, MapPin, Shield, Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { employeesApi } from '../../api/employees';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';

export function DashboardAddEmployee() {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    password: '',
    confirmPassword: '',
    role: 'employee',
  });

  const [submitting, setSubmitting] = useState(false);

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let pass = '';
    for (let i = 0; i < 12; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ ...prev, password: pass }));
    toast.info('Secure password generated');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    if (!formData.name || !formData.email || !formData.phone || !formData.password || !formData.confirmPassword) {
      toast.error('Please fill in all required fields: Name, Email, Phone, Password');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      toast.error('Password and Confirm Password do not match');
      return;
    }

    setSubmitting(true);
    try {
      const mappedRole = formData.role.trim();

      const payload: Record<string, any> = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        password: formData.password,
        role: mappedRole,
      };

      // Add clientId only if it exists
      if (user?.clientId) {
        payload.clientId = user.clientId;
      }

      // Include address only if provided
      if (formData.address.trim()) {
        payload.address = formData.address.trim();
      }

      console.log('[AddEmployee] Submitting payload', {
        ...payload,
        password: payload.password ? '***' : '',
      });

      const res = await employeesApi.create(payload, { pageName: 'Add Employee' });
      if (res.success) {
        toast.success(res.message || 'Employee added successfully');
        setFormData({
          name: '',
          email: '',
          phone: '',
          address: '',
          password: '',
          confirmPassword: '',
          role: 'employee',
        });
      } else {
        toast.error(res.message || 'Failed to add employee');
      }
    } catch (error: any) {
      let message = 'Error occurred while creating employee';
      
      if (error?.response?.data?.errors && Array.isArray(error.response.data.errors)) {
        message = error.response.data.errors.map((err: any) => err.msg).join(', ');
      } else if (error?.response?.data?.message) {
        message = error.response.data.message;
      } else if (error?.message) {
        message = error.message;
      }
      
      console.error('[AddEmployee] Create failed:', message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-120px)] flex flex-col items-center justify-center py-10 px-4">
      {/* Premium Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[10%] left-[5%] w-72 h-72 bg-blue-400/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[10%] right-[5%] w-96 h-96 bg-indigo-400/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.03)_0%,transparent_70%)]" />
      </div>

      <div className="w-full max-w-4xl relative z-10 space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center text-center space-y-4 mb-2"
        >
          <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 shadow-xl shadow-blue-500/10 border border-blue-100 dark:border-blue-900/30 text-blue-600 dark:text-blue-400">
            <UserPlus className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-gray-900 via-blue-900 to-gray-900 dark:from-white dark:via-blue-400 dark:to-white bg-clip-text text-transparent">
              Add New Employee
            </h1>
            <p className="text-muted-foreground text-base mt-2 max-w-md mx-auto">
              Expand your team by registering a new staff member with dedicated workspace roles.
            </p>
          </div>
        </motion.div>

        <Card className="border border-white/40 dark:border-white/5 shadow-2xl shadow-blue-500/5 bg-white/70 dark:bg-zinc-900/60 backdrop-blur-2xl rounded-[2.5rem] overflow-hidden">
          <CardHeader className="border-b border-gray-100/50 dark:border-white/5 pb-8 pt-10 px-8 sm:px-12 text-center">
            <CardTitle className="text-xl font-extrabold tracking-tight">Account Information</CardTitle>
            <CardDescription className="text-sm font-medium mt-1">Configure credentials and personal information</CardDescription>
          </CardHeader>
          <CardContent className="p-8 sm:p-12">
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                {/* Full Name */}
                <div className="space-y-2.5">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.15em] text-blue-600/70 dark:text-blue-400/70 ml-1">Full Name</Label>
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground group-focus-within:text-blue-500 transition-colors" />
                    <Input
                      className="pl-12 h-13 rounded-2xl bg-white/50 dark:bg-zinc-950/30 border-gray-200/80 dark:border-white/10 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm font-medium"
                      placeholder="e.g. Johnathan Smith"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                </div>

                {/* Email */}
                <div className="space-y-2.5">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.15em] text-blue-600/70 dark:text-blue-400/70 ml-1">Email Address</Label>
                  <div className="relative group">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground group-focus-within:text-blue-500 transition-colors" />
                    <Input
                      type="email"
                      className="pl-12 h-13 rounded-2xl bg-white/50 dark:bg-zinc-950/30 border-gray-200/80 dark:border-white/10 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm font-medium"
                      placeholder="john.smith@company.com"
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                </div>

                {/* Phone */}
                <div className="space-y-2.5">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.15em] text-blue-600/70 dark:text-blue-400/70 ml-1">Phone Number</Label>
                  <div className="relative group">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground group-focus-within:text-blue-500 transition-colors" />
                    <Input
                      className="pl-12 h-13 rounded-2xl bg-white/50 dark:bg-zinc-950/30 border-gray-200/80 dark:border-white/10 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm font-medium"
                      placeholder="+1 (555) 000-0000"
                      value={formData.phone}
                      onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                </div>

                {/* Role */}
                <div className="space-y-2.5">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.15em] text-blue-600/70 dark:text-blue-400/70 ml-1">Assign Role</Label>
                  <div className="relative group">
                    <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground group-focus-within:text-blue-500 transition-colors pointer-events-none z-10" />
                    <select
                      className="w-full pl-12 pr-10 h-13 rounded-2xl bg-white/50 dark:bg-zinc-950/30 border border-gray-200/80 dark:border-white/10 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm font-medium appearance-none cursor-pointer outline-none"
                      value={formData.role}
                      onChange={e => setFormData({ ...formData, role: e.target.value })}
                    >
                      <option value="counter_manager">Counter Manager</option>
                      <option value="store_manager">Store Manager</option>
                      <option value="seo_manager">SEO Manager</option>
                      <option value="inventory_manager">Inventory Manager</option>
                      <option value="employee">Employee</option>
                      <option value="VENDOR">Vendor</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground group-focus-within:text-blue-500 transition-colors">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Address */}
                <div className="md:col-span-2 space-y-2.5">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.15em] text-blue-600/70 dark:text-blue-400/70 ml-1">Home Address</Label>
                  <div className="relative group">
                    <MapPin className="absolute left-4 top-5 w-4.5 h-4.5 text-muted-foreground group-focus-within:text-blue-500 transition-colors" />
                    <textarea
                      rows={3}
                      className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white/50 dark:bg-zinc-950/30 border border-gray-200/80 dark:border-white/10 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all resize-none"
                      placeholder="Enter full residential address"
                      value={formData.address}
                      onChange={e => setFormData({ ...formData, address: e.target.value })}
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-2.5">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.15em] text-blue-600/70 dark:text-blue-400/70 ml-1">Set Password</Label>
                  <div className="flex gap-3">
                    <Input
                      type="text"
                      className="h-13 rounded-2xl bg-white/50 dark:bg-zinc-950/30 border-gray-200/80 dark:border-white/10 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm font-medium"
                      placeholder="Min 8 characters"
                      value={formData.password}
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-13 w-13 p-0 rounded-2xl border-gray-200/80 dark:border-white/10 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 transition-all shrink-0"
                      onClick={generatePassword}
                      title="Generate Random Password"
                    >
                      <RefreshCw className="w-5 h-5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div className="space-y-2.5">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.15em] text-blue-600/70 dark:text-blue-400/70 ml-1">Confirm Password</Label>
                  <Input
                    type="text"
                    className="h-13 rounded-2xl bg-white/50 dark:bg-zinc-950/30 border-gray-200/80 dark:border-white/10 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm font-medium"
                    placeholder="Re-enter password"
                    value={formData.confirmPassword}
                    onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                  />
                </div>

              </div>

              <div className="pt-10 border-t border-gray-100 dark:border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground text-center sm:text-left">
                  Password will be securely encrypted. Ensure the email is valid for notification purposes.
                </p>
                <Button
                  type="submit"
                  className="h-14 px-10 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xl shadow-blue-500/25 transition-all active:scale-[0.98] disabled:opacity-70 w-full sm:w-auto overflow-hidden relative group"
                  disabled={submitting}
                >
                  <span className="relative z-10 flex items-center gap-2">
                    {submitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-5 h-5" />
                        Create Employee Account
                      </>
                    )}
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 1.5s infinite;
        }
      `}} />
    </div>
  );
}
