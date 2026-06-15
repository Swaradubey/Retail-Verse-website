import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, Plus, UserPlus, Lock, Mail, Phone, MapPin, CreditCard, Building, AlertCircle, Trash2, Factory, ImageIcon, X, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { clientsApi, type ClientRow } from '../../api/clients';
import { toast } from 'sonner';
import { StoreManagerModal } from '../../components/inventory/StoreManagerModal';
import { EmployeeModal } from '../../components/inventory/EmployeeModal';
import { StaffListModal } from '../../components/staff/StaffListModal';
import { useAuth } from '../../context/AuthContext';

type TeamPanelState =
  | { t: 'none' }
  | { t: 'add-sm'; cid: string }
  | { t: 'add-emp'; cid: string }
  | { t: 'view-sm'; cid: string }
  | { t: 'view-emp'; cid: string };

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const gstinRe = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i;
const panRe = /^[A-Z]{5}[0-9]{4}[A-Z]$/i;

type FieldErrors = Partial<
  Record<
    | 'companyName'
    | 'gst'
    | 'phone'
    | 'email'
    | 'panNo'
    | 'permanentAddress'
    | 'shopName'
    | 'password'
    | 'logo',
    string
  >
>;

const emptyForm = {
  companyName: '',
  gst: '',
  phone: '',
  email: '',
  panNo: '',
  permanentAddress: '',
  shopName: '',
  password: '',
};

const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB

export function DashboardClients() {
  const { user } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [teamPanel, setTeamPanel] = useState<TeamPanelState>({ t: 'none' });

  // Logo upload state
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [logoError, setLogoError] = useState<string>('');
  const logoInputRef = useRef<HTMLInputElement>(null);

  const loadClients = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await clientsApi.list();
      if (!res.success || !res.data) {
        throw new Error(res.message || 'Could not load clients');
      }
      setClients(Array.isArray(res.data) ? res.data : []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load clients');
      setClients([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setLogoError('');
    if (!file) return;

    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      setLogoError('Invalid file type. Allowed: PNG, JPG, JPEG, WEBP, SVG.');
      if (logoInputRef.current) logoInputRef.current.value = '';
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError('File is too large. Maximum allowed size is 2 MB.');
      if (logoInputRef.current) logoInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === 'string') {
        setLogoPreview(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoPreview('');
    setLogoError('');
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const validate = (): boolean => {
    const next: FieldErrors = {};
    if (!form.companyName.trim()) next.companyName = 'Company name is required';
    const gstNorm = form.gst.trim().replace(/\s+/g, '').toUpperCase();
    if (!form.gst.trim()) next.gst = 'GST is required';
    else if (!gstinRe.test(gstNorm)) next.gst = 'Enter a valid 15-character GSTIN';
    if (!form.phone.trim()) next.phone = 'Phone is required';
    else if (form.phone.replace(/\D/g, '').length < 10) {
      next.phone = 'Enter a valid phone number (at least 10 digits)';
    }
    if (!form.email.trim()) next.email = 'Email is required';
    else if (!emailRe.test(form.email.trim())) next.email = 'Enter a valid email address';
    const panNorm = form.panNo.trim().replace(/\s+/g, '').toUpperCase();
    if (!form.panNo.trim()) next.panNo = 'PAN is required';
    else if (!panRe.test(panNorm)) next.panNo = 'Enter a valid PAN (e.g. ABCDE1234F)';
    if (!form.permanentAddress.trim()) next.permanentAddress = 'Permanent address is required';
    if (!form.shopName.trim()) next.shopName = 'Shop name is required';
    if (!form.password) next.password = 'Login password is required';
    else if (form.password.length < 8) next.password = 'Password must be at least 8 characters';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    // Logo error is non-blocking (it's optional) but don't submit if there's a type/size error
    if (logoError) return;
    setSubmitting(true);
    setFieldErrors({});
    try {
      const res = await clientsApi.create({
        companyName: form.companyName.trim(),
        gst: form.gst.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        panNo: form.panNo.trim(),
        permanentAddress: form.permanentAddress.trim(),
        shopName: form.shopName.trim(),
        password: form.password,
        ...(logoPreview ? { logo: logoPreview } : {}),
      });
      if (!res.success) {
        throw new Error(res.message || 'Could not create client');
      }
      toast.success(res.message || 'Client added successfully');
      setForm(emptyForm);
      setLogoPreview('');
      setLogoError('');
      if (logoInputRef.current) logoInputRef.current.value = '';
      await loadClients();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add client');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this client?')) return;
    try {
      const res = await clientsApi.delete(id);
      if (!res.success) {
        throw new Error(res.message || 'Could not delete client');
      }
      toast.success('Client deleted successfully');
      setClients((prev) => prev.filter((c) => c._id !== id));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete client');
    }
  };

  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 pb-2">
          <Badge variant="outline" className="gap-1.5 px-3 py-1 border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 w-fit">
            <Building2 className="w-3.5 h-3.5" />
            <span className="text-xs font-semibold uppercase tracking-wide">Super Admin</span>
          </Badge>
        </div>
        <div className="space-y-2">
          <h2 className="text-4xl font-bold tracking-tight text-foreground">Add Client</h2>
          <p className="text-muted-foreground text-lg max-w-2xl leading-relaxed">
            Register new company clients with their GST details, contact information, and login credentials. Only Super Admins can create or view this directory.
          </p>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card className="border-border/60 shadow-lg shadow-black/5 dark:shadow-black/20 rounded-xl overflow-hidden">
          <CardHeader className="pb-4 px-8 pt-8 bg-gradient-to-br from-violet-50/50 to-amber-50/30 dark:from-violet-950/20 dark:to-amber-950/10 border-b border-border/50">
            <CardTitle className="text-2xl flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/40 dark:to-amber-800/20 shadow-sm">
                <Plus className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-foreground">New client</span>
            </CardTitle>
            <CardDescription className="text-base leading-relaxed mt-2 max-w-xl">
              All fields are required. A login user with role <span className="font-semibold text-foreground bg-muted px-1.5 py-0.5 rounded-md">client</span> is created
              using the email and password below. Email, GST, and PAN must be unique across the system.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="space-y-5">
                <div className="flex items-center gap-2 pb-2">
                  <div className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Company Information</span>
                  <div className="h-px flex-1 bg-gradient-to-l from-border to-transparent" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="client-company" className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <Factory className="w-3.5 h-3.5 text-muted-foreground" />
                      Company name
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="client-company"
                      autoComplete="organization"
                      value={form.companyName}
                      onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                      aria-invalid={!!fieldErrors.companyName}
                      className="h-12 bg-background/50 backdrop-blur-sm transition-all duration-200 border-input focus:border-violet-500 focus:ring-violet-500/20"
                      placeholder="Enter company name"
                    />
                    {fieldErrors.companyName ? (
                      <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {fieldErrors.companyName}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="client-shop" className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <Building className="w-3.5 h-3.5 text-muted-foreground" />
                      Shop name
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="client-shop"
                      autoComplete="organization"
                      value={form.shopName}
                      onChange={(e) => setForm((f) => ({ ...f, shopName: e.target.value }))}
                      aria-invalid={!!fieldErrors.shopName}
                      className="h-12 bg-background/50 backdrop-blur-sm transition-all duration-200 border-input focus:border-violet-500 focus:ring-violet-500/20"
                      placeholder="Enter shop name"
                    />
                    {fieldErrors.shopName ? (
                      <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {fieldErrors.shopName}
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* ── Logo Upload ─────────────────────────────────────────── */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                    Company Logo
                    <span className="text-xs font-normal text-muted-foreground ml-1">(Optional)</span>
                  </Label>

                  {logoPreview ? (
                    // Preview state
                    <div className="flex items-start gap-4 p-4 rounded-xl border border-border/60 bg-background/40 backdrop-blur-sm">
                      <div className="w-20 h-20 rounded-xl border border-border/50 bg-white dark:bg-zinc-900 flex items-center justify-center overflow-hidden shadow-sm shrink-0">
                        <img
                          src={logoPreview}
                          alt="Logo preview"
                          className="w-full h-full object-contain p-1"
                        />
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <p className="text-sm font-medium text-foreground">Logo selected</p>
                        <p className="text-xs text-muted-foreground">Preview shown above. You can change or remove it before submitting.</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => logoInputRef.current?.click()}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
                          >
                            <Upload className="w-3 h-3" />
                            Change
                          </button>
                          <button
                            type="button"
                            onClick={handleRemoveLogo}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors"
                          >
                            <X className="w-3 h-3" />
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Upload drop-zone
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="w-full flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed border-border/60 hover:border-violet-400/60 dark:hover:border-violet-600/50 bg-background/30 hover:bg-violet-50/30 dark:hover:bg-violet-950/10 transition-all duration-200 cursor-pointer group"
                    >
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-100 to-violet-200 dark:from-violet-900/40 dark:to-violet-800/30 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform duration-200">
                        <ImageIcon className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-foreground">Click to upload logo</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Optional. Upload client/company logo for branding.</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">PNG, JPG, JPEG, WEBP or SVG · Max 2 MB</p>
                      </div>
                    </button>
                  )}

                  {/* Hidden file input */}
                  <input
                    ref={logoInputRef}
                    id="client-logo"
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={handleLogoChange}
                  />

                  {logoError && (
                    <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {logoError}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-5">
                <div className="flex items-center gap-2 pb-2">
                  <div className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tax & Contact Details</span>
                  <div className="h-px flex-1 bg-gradient-to-l from-border to-transparent" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="client-gst" className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                      GST
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="client-gst"
                      autoComplete="off"
                      value={form.gst}
                      onChange={(e) => setForm((f) => ({ ...f, gst: e.target.value }))}
                      aria-invalid={!!fieldErrors.gst}
                      className="h-12 bg-background/50 backdrop-blur-sm transition-all duration-200 font-mono uppercase tracking-wider border-input focus:border-violet-500 focus:ring-violet-500/20"
                      placeholder="e.g. 27AAAPL1234C1Z5"
                    />
                    {fieldErrors.gst ? (
                      <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {fieldErrors.gst}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground/70">15-character GST Identification Number</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="client-pan" className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                      PAN No
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="client-pan"
                      autoComplete="off"
                      value={form.panNo}
                      onChange={(e) => setForm((f) => ({ ...f, panNo: e.target.value }))}
                      aria-invalid={!!fieldErrors.panNo}
                      className="h-12 bg-background/50 backdrop-blur-sm transition-all duration-200 font-mono uppercase tracking-wider border-input focus:border-violet-500 focus:ring-violet-500/20"
                      placeholder="ABCDE1234F"
                    />
                    {fieldErrors.panNo ? (
                      <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {fieldErrors.panNo}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground/70">10-character Permanent Account Number</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="client-phone" className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                      Phone
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="client-phone"
                      type="tel"
                      autoComplete="tel"
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      aria-invalid={!!fieldErrors.phone}
                      className="h-12 bg-background/50 backdrop-blur-sm transition-all duration-200 border-input focus:border-violet-500 focus:ring-violet-500/20"
                      placeholder="Enter phone number"
                    />
                    {fieldErrors.phone ? (
                      <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {fieldErrors.phone}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="client-email" className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                      Email
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="client-email"
                      type="email"
                      autoComplete="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      aria-invalid={!!fieldErrors.email}
                      className="h-12 bg-background/50 backdrop-blur-sm transition-all duration-200 border-input focus:border-violet-500 focus:ring-violet-500/20"
                      placeholder="email@example.com"
                    />
                    {fieldErrors.email ? (
                      <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {fieldErrors.email}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground/70">Will be used as login username</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                <div className="flex items-center gap-2 pb-2">
                  <div className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Address & Credentials</span>
                  <div className="h-px flex-1 bg-gradient-to-l from-border to-transparent" />
                </div>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="client-address" className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                      Permanent address
                      <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="client-address"
                      autoComplete="street-address"
                      value={form.permanentAddress}
                      onChange={(e) => setForm((f) => ({ ...f, permanentAddress: e.target.value }))}
                      aria-invalid={!!fieldErrors.permanentAddress}
                      className="min-h-[100px] bg-background/50 backdrop-blur-sm transition-all duration-200 border-input focus:border-violet-500 focus:ring-violet-500/20 resize-none"
                      placeholder="Enter full address including city, state, and PIN code"
                    />
                    {fieldErrors.permanentAddress ? (
                      <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {fieldErrors.permanentAddress}
                      </p>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="client-password" className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                        Login password
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="client-password"
                        type="password"
                        autoComplete="new-password"
                        value={form.password}
                        onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                        aria-invalid={!!fieldErrors.password}
                        className="h-12 bg-background/50 backdrop-blur-sm transition-all duration-200 border-input focus:border-violet-500 focus:ring-violet-500/20"
                        placeholder="Minimum 8 characters"
                      />
                      {fieldErrors.password ? (
                        <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" />
                          {fieldErrors.password}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground/70">At least 8 characters required</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-border/50">
                <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    <span className="text-destructive">*</span> All fields are required
                  </p>
                  <Button 
                    type="submit" 
                    disabled={submitting} 
                    size="lg"
                    className="min-w-[180px] h-12 font-semibold shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 hover:shadow-xl transition-all duration-300"
                  >
                    {submitting ? (
                      <span className="flex items-center gap-2">
                        <span className="animate-pulse">Saving...</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <UserPlus className="w-5 h-5" />
                        Add client
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="border-border/60 shadow-lg shadow-black/5 dark:shadow-black/20 rounded-xl overflow-hidden">
          <CardHeader className="pb-4 px-8 pt-6 bg-gradient-to-br from-slate-50/50 to-gray-50/30 dark:from-slate-950/20 dark:to-gray-950/10 border-b border-border/50">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="space-y-1">
                <CardTitle className="text-xl flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 shadow-sm">
                    <Building2 className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                  </div>
                  <span className="text-foreground">Clients</span>
                </CardTitle>
                <CardDescription className="text-base">
                  {listLoading ? 'Loading…' : `${clients.length} client(s) on record`}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50/80 dark:bg-slate-950/50 text-muted-foreground border-b border-border/50">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">Company</th>
                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">Shop</th>
                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">GST</th>
                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">PAN</th>
                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">Phone</th>
                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">Email</th>
                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">Created</th>
                    {isSuperAdmin && <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {listLoading ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                        Loading…
                      </td>
                    </tr>
                  ) : clients.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                        No clients yet. Add one using the form above.
                      </td>
                    </tr>
                  ) : (
                    clients.map((c) => (
                      <tr
                        key={c._id}
                        className="hover:bg-slate-50/60 dark:hover:bg-slate-950/30 transition-colors duration-150"
                      >
                        <td className="px-6 py-4 font-medium text-foreground">{c.companyName}</td>
                        <td className="px-6 py-4 max-w-[160px] truncate text-muted-foreground" title={c.shopName || ''}>
                          {c.shopName || '—'}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs">{c.gst || '—'}</td>
                        <td className="px-6 py-4 font-mono text-xs">{c.panNo || '—'}</td>
                        <td className="px-6 py-4 text-foreground">{c.phone}</td>
                        <td className="px-6 py-4 text-foreground">{c.email}</td>
                        <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                          {c.createdAt
                            ? new Date(c.createdAt).toLocaleString(undefined, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })
                            : '—'}
                        </td>
                        {isSuperAdmin && (
                          <td className="px-6 py-4">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(c._id)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <StoreManagerModal
        isOpen={teamPanel.t === 'add-sm'}
        onClose={() => setTeamPanel({ t: 'none' })}
        clientIdOverride={teamPanel.t === 'add-sm' ? teamPanel.cid : null}
        onCreated={() => {
          toast.success('Store manager created for this client');
          setTeamPanel({ t: 'none' });
        }}
      />
      <EmployeeModal
        isOpen={teamPanel.t === 'add-emp'}
        onClose={() => setTeamPanel({ t: 'none' })}
        clientIdOverride={teamPanel.t === 'add-emp' ? teamPanel.cid : null}
        onCreated={() => {
          toast.success('Employee created for this client');
          setTeamPanel({ t: 'none' });
        }}
      />
      <StaffListModal
        isOpen={teamPanel.t === 'view-sm' || teamPanel.t === 'view-emp'}
        onClose={() => setTeamPanel({ t: 'none' })}
        clientId={teamPanel.t === 'view-sm' || teamPanel.t === 'view-emp' ? teamPanel.cid : ''}
        mode={teamPanel.t === 'view-emp' ? 'employees' : 'store_managers'}
        title={teamPanel.t === 'view-emp' ? 'Employees' : 'Store managers'}
      />
    </div>
  );
}
