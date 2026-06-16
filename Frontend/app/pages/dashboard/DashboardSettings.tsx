import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  User,
  Store,
  Bell,
  ShieldCheck,
  CreditCard,
  Globe,
  ChevronRight,
  Camera,
  Save,
  RotateCcw,
  Eye,
  EyeOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';
import { useAuth } from '../../context/AuthContext';
import { normalizeRole } from '../../utils/staffRoles';
import {
  settingsApi,
  type SettingsPayload,
  type SettingsUpdateBody,
  type SettingsProfile,
  type SettingsStore,
  type SettingsNotifications,
  type SettingsSecurity,
  type SettingsBilling,
} from '../../api/settings';

const COUNTRY_OPTIONS = [
  'United States',
  'United Kingdom',
  'Germany',
  'India',
  'Japan',
  'Canada',
] as const;
const CURRENCY_OPTIONS = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD'] as const;
const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'ja', label: 'Japanese' },
] as const;
const TIMEZONE_OPTIONS = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Kolkata',
] as const;
const PLAN_OPTIONS = ['Free', 'Basic', 'Pro', 'Enterprise'] as const;
const STATUS_OPTIONS = ['inactive', 'active', 'trialing', 'past_due'] as const;

function defaultUsernameFromName(name: string) {
  return name ? name.toLowerCase().replace(/\s+/g, '_') : '';
}

function defaultPayloadFromAuth(user: {
  name?: string;
  email?: string;
  username?: string;
  country?: string;
  bio?: string;
}): SettingsPayload {
  const name = user.name || '';
  const rawCountry = String(user.country || '').trim();
  const countryOrRegion = rawCountry || COUNTRY_OPTIONS[0];
  return {
    profile: {
      fullName: name || 'User',
      username: user.username || defaultUsernameFromName(name),
      email: user.email || '',
      countryOrRegion,
      bio: user.bio || '',
      profilePhoto: '',
    },
    store: {
      storeName: '',
      storeEmail: '',
      storePhone: '',
      storeAddress: '',
      currency: 'USD',
      timezone: 'UTC',
      taxRate: 0,
      language: 'en',
    },
    notifications: {
      emailNotifications: true,
      orderAlerts: true,
      stockAlerts: true,
      marketingEmails: false,
      pushNotifications: false,
      smsNotifications: false,
    },
    security: {
      twoFactorEnabled: false,
      loginAlerts: true,
      sessionTimeout: 30,
      allowedDevices: 5,
    },
    billing: {
      currentPlan: 'Free',
      billingEmail: '',
      billingAddress: '',
      autoRenew: false,
      paymentMethodLast4: '',
      subscriptionStatus: 'inactive',
    },
  };
}

function clonePayload(p: SettingsPayload): SettingsPayload {
  return JSON.parse(JSON.stringify(p)) as SettingsPayload;
}

function normalizeSettingsPayload(raw: SettingsPayload): SettingsPayload {
  const defaultPayload = defaultPayloadFromAuth({});
  const safeProfile = { ...defaultPayload.profile, ...raw?.profile };
  const safeStore = { ...defaultPayload.store, ...raw?.store };
  const safeNotifications = { ...defaultPayload.notifications, ...raw?.notifications };
  const safeSecurity = { ...defaultPayload.security, ...raw?.security };
  const safeBilling = { ...defaultPayload.billing, ...raw?.billing };

  const trimmed = String(safeProfile.countryOrRegion ?? '').trim();
  const countryOrRegion = trimmed || COUNTRY_OPTIONS[0];
  safeProfile.countryOrRegion = countryOrRegion;

  return {
    profile: safeProfile,
    store: safeStore,
    notifications: safeNotifications,
    security: safeSecurity,
    billing: safeBilling,
  };
}

function isKnownCountry(value: string): value is (typeof COUNTRY_OPTIONS)[number] {
  return COUNTRY_OPTIONS.includes(value as (typeof COUNTRY_OPTIONS)[number]);
}

export function DashboardSettings() {
  const { user, token, patchUser, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [baseline, setBaseline] = useState<SettingsPayload | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);

  const [profile, setProfile] = useState<SettingsProfile | null>(null);
  const [store, setStore] = useState<SettingsStore | null>(null);
  const [notifications, setNotifications] = useState<SettingsNotifications | null>(null);
  const [security, setSecurity] = useState<SettingsSecurity | null>(null);
  const [billing, setBilling] = useState<SettingsBilling | null>(null);

  // Razorpay Integration States
  const [razorpayEnabled, setRazorpayEnabled] = useState(false);
  const [razorpayKeyId, setRazorpayKeyId] = useState('');
  const [razorpayKeySecret, setRazorpayKeySecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [showKeySecret, setShowKeySecret] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [razorpayBaseline, setRazorpayBaseline] = useState<any>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [resettingSection, setResettingSection] = useState<string | null>(null);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const applyPayload = useCallback((p: SettingsPayload) => {
    setProfile(p.profile);
    setStore(p.store);
    setNotifications(p.notifications);
    setSecurity(p.security);
    setBilling(p.billing);
  }, []);

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;

    async function load() {
      console.log('[Settings Page] load effect', { authLoading, hasToken: !!token });
      if (!token) {
        const u = user || {};
        const d = defaultPayloadFromAuth(u);
        if (cancelled) return;
        setBaseline(clonePayload(d));
        applyPayload(d);
        setSectionError(null);
        setLoadError(null);
        return;
      }

      setSettingsLoading(true);
      setSectionError(null);
      setLoadError(null);
      try {
        const res = await settingsApi.get();
        console.log('[Settings Page] GET /api/settings response', res);
        if (cancelled) return;
        if (res.success && res.data) {
          const normalized = normalizeSettingsPayload(res.data as SettingsPayload);
          setBaseline(clonePayload(normalized));
          applyPayload(normalized);
        } else {
          throw new Error(res.message || 'Invalid settings response');
        }

        const normalizedRole = normalizeRole(user?.role);
        const canSeeRazorpay = normalizedRole === 'client' || normalizedRole === 'admin' || normalizedRole === 'super_admin' || normalizedRole === 'client_admin';
        if (canSeeRazorpay) {
          const rzpRes = await settingsApi.getRazorpayConfig();
          if (cancelled) return;
          if (rzpRes.success && rzpRes.data) {
            setRazorpayEnabled(rzpRes.data.razorpayEnabled);
            setRazorpayKeyId(rzpRes.data.razorpayKeyId);
            setRazorpayKeySecret(rzpRes.data.razorpayKeySecret);
            setWebhookSecret(rzpRes.data.webhookSecret);
            setIsConnected(rzpRes.data.isConnected);
            setRazorpayBaseline({
              razorpayEnabled: rzpRes.data.razorpayEnabled,
              razorpayKeyId: rzpRes.data.razorpayKeyId,
              razorpayKeySecret: rzpRes.data.razorpayKeySecret,
              webhookSecret: rzpRes.data.webhookSecret,
              isConnected: rzpRes.data.isConnected,
            });
          }
        }
      } catch (e: unknown) {
        if (cancelled) return;
        console.error('[Settings Page] GET /api/settings error', e);
        const msg = e instanceof Error ? e.message : 'Failed to load settings';
        setLoadError(msg);
        toast.error('Failed to load settings');
        const fallback = defaultPayloadFromAuth(user || {});
        setBaseline(clonePayload(fallback));
        applyPayload(fallback);
      } finally {
        if (!cancelled) setSettingsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [authLoading, token, user, applyPayload]);

  useEffect(() => {
    setSectionError(null);
  }, [activeTab]);

  const saving = savingSection !== null;
  const resetting = resettingSection !== null;
  const busy = saving || resetting;

  const resetProfile = async () => {
    setSectionError(null);
    if (!token) {
      if (!baseline) return;
      setProfile(clonePayload(baseline).profile);
      toast.success('Changes reset');
      return;
    }
    setResettingSection('profile');
    try {
      const res = await settingsApi.get();
      if (!res.success || !res.data) {
        throw new Error(res.message || 'Failed to load saved settings');
      }
      const normalized = normalizeSettingsPayload(res.data as SettingsPayload);
      setBaseline(clonePayload(normalized));
      setProfile(normalized.profile);
      toast.success('Restored saved settings');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to restore settings';
      toast.error(msg);
    } finally {
      setResettingSection(null);
    }
  };

  const resetStore = async () => {
    setSectionError(null);
    if (!token) {
      if (!baseline) return;
      setStore(clonePayload(baseline).store);
      toast.success('Changes reset');
      return;
    }
    setResettingSection('store');
    try {
      const res = await settingsApi.get();
      if (!res.success || !res.data) {
        throw new Error(res.message || 'Failed to load saved settings');
      }
      const normalized = normalizeSettingsPayload(res.data as SettingsPayload);
      setBaseline(clonePayload(normalized));
      setStore(normalized.store);
      toast.success('Restored saved settings');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to restore settings';
      toast.error(msg);
    } finally {
      setResettingSection(null);
    }
  };

  const resetNotifications = async () => {
    setSectionError(null);
    if (!token) {
      if (!baseline) return;
      setNotifications(clonePayload(baseline).notifications);
      toast.success('Changes reset');
      return;
    }
    setResettingSection('notifications');
    try {
      const res = await settingsApi.get();
      if (!res.success || !res.data) {
        throw new Error(res.message || 'Failed to load saved settings');
      }
      const normalized = normalizeSettingsPayload(res.data as SettingsPayload);
      setBaseline(clonePayload(normalized));
      setNotifications(normalized.notifications);
      toast.success('Restored saved settings');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to restore settings';
      toast.error(msg);
    } finally {
      setResettingSection(null);
    }
  };

  const resetSecurity = async () => {
    setSectionError(null);
    if (!token) {
      if (!baseline) return;
      setSecurity(clonePayload(baseline).security);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Changes reset');
      return;
    }
    setResettingSection('security');
    try {
      const res = await settingsApi.get();
      if (!res.success || !res.data) {
        throw new Error(res.message || 'Failed to load saved settings');
      }
      const normalized = normalizeSettingsPayload(res.data as SettingsPayload);
      setBaseline(clonePayload(normalized));
      setSecurity(normalized.security);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Restored saved settings');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to restore settings';
      toast.error(msg);
    } finally {
      setResettingSection(null);
    }
  };

  const buildFullUpdateBody = (
    passwordExtras?: Pick<SettingsUpdateBody, 'currentPassword' | 'newPassword' | 'confirmPassword'>
  ): SettingsUpdateBody | null => {
    if (!profile || !store || !notifications || !security || !billing) return null;
    const body: SettingsUpdateBody = {
      profile,
      store,
      notifications,
      security,
      billing,
    };
    if (passwordExtras) {
      if (passwordExtras.currentPassword !== undefined) {
        body.currentPassword = passwordExtras.currentPassword;
      }
      if (passwordExtras.newPassword !== undefined) {
        body.newPassword = passwordExtras.newPassword;
      }
      if (passwordExtras.confirmPassword !== undefined) {
        body.confirmPassword = passwordExtras.confirmPassword;
      }
    }
    return body;
  };

  const resetBilling = async () => {
    setSectionError(null);
    if (!token) {
      if (!baseline) return;
      setBilling(clonePayload(baseline).billing);
      toast.success('Changes reset');
      return;
    }
    setResettingSection('billing');
    try {
      const res = await settingsApi.get();
      if (!res.success || !res.data) {
        throw new Error(res.message || 'Failed to load saved settings');
      }
      const normalized = normalizeSettingsPayload(res.data as SettingsPayload);
      setBaseline(clonePayload(normalized));
      setBilling(normalized.billing);
      toast.success('Restored saved settings');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to restore settings';
      toast.error(msg);
    } finally {
      setResettingSection(null);
    }
  };

  const saveProfile = async () => {
    if (!token || !profile) {
      toast.error('Failed to save settings');
      return;
    }
    setSavingSection('profile');
    setSectionError(null);
    try {
      console.log('[Settings Page] PUT /api/settings/profile payload', {
        ...profile,
        profilePhoto: profile.profilePhoto?.length ? `[${profile.profilePhoto.length} chars]` : profile.profilePhoto,
      });
      const res = await settingsApi.updateProfile(profile);
      console.log('[Settings Page] PUT /api/settings/profile response', res);
      if (res.success && res.data) {
        const normalized = normalizeSettingsPayload(res.data as SettingsPayload);
        setBaseline(clonePayload(normalized));
        applyPayload(normalized);
        patchUser({
          name: normalized.profile.fullName,
          email: normalized.profile.email,
          username: normalized.profile.username,
          country: normalized.profile.countryOrRegion,
          bio: normalized.profile.bio,
        });
        toast.success('Settings saved successfully');
      } else {
        throw new Error(res.message || 'Save failed');
      }
    } catch (e: unknown) {
      console.error('[Settings Page] PUT /api/settings/profile error', e);
      const msg = e instanceof Error ? e.message : 'Failed to save settings';
      setSectionError(msg);
      toast.error('Failed to save settings');
    } finally {
      setSavingSection(null);
    }
  };

  const saveStore = async () => {
    if (!token || !store) {
      toast.error('Failed to save settings');
      return;
    }
    setSavingSection('store');
    setSectionError(null);
    try {
      const body = buildFullUpdateBody();
      if (!body) {
        throw new Error('Form is not ready to save');
      }
      console.log('[Settings Page] PUT /api/settings payload', JSON.stringify(body));
      const res = await settingsApi.updateFull(body);
      console.log('[Settings Page] PUT /api/settings response', res);
      if (res.success && res.data) {
        const normalized = normalizeSettingsPayload(res.data as SettingsPayload);
        setBaseline(clonePayload(normalized));
        applyPayload(normalized);
        toast.success('Settings saved successfully');
      } else {
        throw new Error(res.message || 'Save failed');
      }
    } catch (e: unknown) {
      console.error('[Settings Page] PUT /api/settings error', e);
      const msg = e instanceof Error ? e.message : 'Failed to save settings';
      setSectionError(msg);
      toast.error('Failed to save settings');
    } finally {
      setSavingSection(null);
    }
  };

  const saveNotifications = async () => {
    if (!token || !notifications) {
      toast.error('Failed to save settings');
      return;
    }
    setSavingSection('notifications');
    setSectionError(null);
    try {
      const body = buildFullUpdateBody();
      if (!body) {
        throw new Error('Form is not ready to save');
      }
      console.log('[Settings Page] PUT /api/settings payload', JSON.stringify(body));
      const res = await settingsApi.updateFull(body);
      console.log('[Settings Page] PUT /api/settings response', res);
      if (res.success && res.data) {
        const normalized = normalizeSettingsPayload(res.data as SettingsPayload);
        setBaseline(clonePayload(normalized));
        applyPayload(normalized);
        toast.success('Settings saved successfully');
      } else {
        throw new Error(res.message || 'Save failed');
      }
    } catch (e: unknown) {
      console.error('[Settings Page] PUT /api/settings error', e);
      const msg = e instanceof Error ? e.message : 'Failed to save settings';
      setSectionError(msg);
      toast.error('Failed to save settings');
    } finally {
      setSavingSection(null);
    }
  };

  const saveSecurity = async () => {
    if (!token || !security) {
      toast.error('Failed to save settings');
      return;
    }
    setSavingSection('security');
    setSectionError(null);
    try {
      const wantsPwd = Boolean(newPassword || confirmPassword || currentPassword);
      const body = buildFullUpdateBody(
        wantsPwd
          ? { currentPassword, newPassword, confirmPassword }
          : undefined
      );
      if (!body) {
        throw new Error('Form is not ready to save');
      }
      console.log('[Settings Page] PUT /api/settings payload', {
        ...body,
        currentPassword: body.currentPassword ? '[set]' : undefined,
        newPassword: body.newPassword ? '[set]' : undefined,
        confirmPassword: body.confirmPassword ? '[set]' : undefined,
      });
      const res = await settingsApi.updateFull(body);
      console.log('[Settings Page] PUT /api/settings response', res);
      if (res.success && res.data) {
        const normalized = normalizeSettingsPayload(res.data as SettingsPayload);
        setBaseline(clonePayload(normalized));
        applyPayload(normalized);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        toast.success('Settings saved successfully');
      } else {
        throw new Error(res.message || 'Save failed');
      }
    } catch (e: unknown) {
      console.error('[Settings Page] PUT /api/settings error', e);
      const msg = e instanceof Error ? e.message : 'Failed to save settings';
      setSectionError(msg);
      toast.error('Failed to save settings');
    } finally {
      setSavingSection(null);
    }
  };

  const saveBilling = async () => {
    if (!token || !billing) {
      toast.error('Failed to save settings');
      return;
    }
    setSavingSection('billing');
    setSectionError(null);
    try {
      console.log('[Settings Page] PUT /api/settings/billing payload', JSON.stringify(billing));
      const res = await settingsApi.updateBilling(billing);
      console.log('[Settings Page] PUT /api/settings/billing response', res);
      if (res.success && res.data) {
        const normalized = normalizeSettingsPayload(res.data as SettingsPayload);
        setBaseline(clonePayload(normalized));
        applyPayload(normalized);
        toast.success('Settings saved successfully');
      } else {
        throw new Error(res.message || 'Save failed');
      }
    } catch (e: unknown) {
      console.error('[Settings Page] PUT /api/settings/billing error', e);
      const msg = e instanceof Error ? e.message : 'Failed to save settings';
      setSectionError(msg);
      toast.error('Failed to save settings');
    } finally {
      setSavingSection(null);
    }
  };

  const saveRazorpay = async () => {
    if (!token) {
      toast.error('Failed to save settings');
      return;
    }

    if (razorpayEnabled && !razorpayKeyId.trim()) {
      toast.error('Key ID is required when Razorpay is enabled');
      return;
    }
    if (razorpayEnabled && !razorpayKeySecret.trim()) {
      toast.error('Key Secret is required when Razorpay is enabled');
      return;
    }

    setSavingSection('razorpay');
    setSectionError(null);
    try {
      const payload: any = {
        razorpayEnabled,
        razorpayKeyId: razorpayKeyId.trim(),
        razorpayKeySecret: razorpayKeySecret.trim(),
        webhookSecret: webhookSecret.trim(),
      };

      console.log('[Settings Page] POST /api/client/payment-settings/razorpay payload', {
        ...payload,
        razorpayKeySecret: payload.razorpayKeySecret ? '********' : '',
        webhookSecret: payload.webhookSecret ? '********' : '',
      });

      const res = await settingsApi.saveRazorpayConfig(payload);
      if (res.success && res.data) {
        setRazorpayEnabled(res.data.razorpayEnabled);
        setRazorpayKeyId(res.data.razorpayKeyId);
        setRazorpayKeySecret(res.data.razorpayKeySecret);
        setWebhookSecret(res.data.webhookSecret);
        setIsConnected(res.data.isConnected);
        setRazorpayBaseline({
          razorpayEnabled: res.data.razorpayEnabled,
          razorpayKeyId: res.data.razorpayKeyId,
          razorpayKeySecret: res.data.razorpayKeySecret,
          webhookSecret: res.data.webhookSecret,
          isConnected: res.data.isConnected,
        });
        toast.success('Razorpay settings saved successfully');
      } else {
        throw new Error(res.message || 'Save failed');
      }
    } catch (e: unknown) {
      console.error('[Settings Page] saveRazorpay error', e);
      const msg = e instanceof Error ? e.message : 'Failed to save settings';
      setSectionError(msg);
      toast.error(msg);
    } finally {
      setSavingSection(null);
    }
  };

  const resetRazorpay = () => {
    if (!razorpayBaseline) return;
    setRazorpayEnabled(razorpayBaseline.razorpayEnabled);
    setRazorpayKeyId(razorpayBaseline.razorpayKeyId);
    setRazorpayKeySecret(razorpayBaseline.razorpayKeySecret);
    setWebhookSecret(razorpayBaseline.webhookSecret);
    setIsConnected(razorpayBaseline.isConnected);
    setSectionError(null);
    toast.success('Changes reset');
  };

  const testRazorpayConnection = async () => {
    if (!token) return;
    if (!razorpayKeyId.trim()) {
      toast.error('Key ID is required to test connection');
      return;
    }
    if (!razorpayKeySecret.trim()) {
      toast.error('Key Secret is required to test connection');
      return;
    }

    setIsTestingConnection(true);
    try {
      const payload: any = {
        razorpayKeyId: razorpayKeyId.trim(),
        razorpayKeySecret: razorpayKeySecret.trim(),
      };
      if (webhookSecret) {
        payload.webhookSecret = webhookSecret.trim();
      }

      const res = await settingsApi.testRazorpayConfig(payload);
      if (res.success) {
        setIsConnected(true);
        toast.success('Connection test succeeded! Razorpay is connected.');
      } else {
        setIsConnected(false);
        throw new Error(res.message || 'Connection test failed');
      }
    } catch (e: unknown) {
      setIsConnected(false);
      const msg = e instanceof Error ? e.message : 'Connection test failed';
      toast.error(msg);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const onPickPhoto = () => fileInputRef.current?.click();

  const onPhotoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !profile) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    if (file.size > 400_000) {
      toast.error('Image must be under 400KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      setProfile((prev) => (prev ? { ...prev, profilePhoto: result } : prev));
    };
    reader.readAsDataURL(file);
  };

  const removePhoto = () => {
    if (!profile) return;
    setProfile({ ...profile, profilePhoto: '' });
  };

  const normalizedUserRole = normalizeRole(user?.role);
  const showRazorpay = normalizedUserRole === 'client' || normalizedUserRole === 'admin' || normalizedUserRole === 'super_admin' || normalizedUserRole === 'client_admin';
  const tabs = [
    { id: 'profile', title: 'Account Profile', icon: User },
    { id: 'store', title: 'Store Settings', icon: Store },
    { id: 'notifications', title: 'Notifications', icon: Bell },
    { id: 'security', title: 'Security & Access', icon: ShieldCheck },
    { id: 'billing', title: 'Billing & Plans', icon: CreditCard },
    ...(showRazorpay ? [{ id: 'razorpay', title: 'Razorpay Integration', icon: CreditCard }] : []),
  ];

  const disabledForm = settingsLoading || !profile;

  return (
    <div className="flex flex-col lg:flex-row gap-8 pb-12">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={onPhotoFile}
      />

      <div className="w-full lg:w-72 space-y-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all duration-300 group ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25 scale-[1.02]'
                : 'bg-white/50 dark:bg-black/20 hover:bg-white dark:hover:bg-white/5 text-muted-foreground hover:text-foreground border border-gray-100 dark:border-white/5'
            }`}
          >
            <div className="flex items-center gap-3">
              <tab.icon
                className={`w-5 h-5 ${activeTab === tab.id ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`}
              />
              <span className="text-sm font-bold">{tab.title}</span>
            </div>
            <ChevronRight className={`w-4 h-4 opacity-50 ${activeTab === tab.id ? 'hidden' : 'block'}`} />
          </button>
        ))}
      </div>

      <div className="flex-1">
        {loadError && (
          <p className="text-sm text-rose-500 font-medium mb-4 px-1">{loadError}</p>
        )}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {activeTab === 'profile' && profile && (
            <Card className="border-none shadow-xl bg-white/80 dark:bg-black/40 backdrop-blur-xl rounded-3xl overflow-hidden">
              <CardHeader className="border-b border-gray-100 dark:border-white/5 pb-8">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <CardTitle className="text-2xl font-black">Profile Information</CardTitle>
                    <CardDescription className="text-sm mt-1">
                      Manage your personal details and account presence.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl border-gray-200 dark:border-white/10 h-10"
                      onClick={resetProfile}
                      disabled={disabledForm || busy || !baseline || !token}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reset
                    </Button>
                    <Button
                      type="button"
                      className="rounded-xl bg-blue-600 text-white hover:bg-blue-700 h-10 px-6 shadow-lg shadow-blue-500/25"
                      onClick={saveProfile}
                      disabled={disabledForm || busy || !token}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-8 space-y-8">
                {settingsLoading && (
                  <p className="text-sm text-muted-foreground font-medium">Loading settings…</p>
                )}
                {sectionError && activeTab === 'profile' && (
                  <p className="text-sm text-rose-500 font-medium">{sectionError}</p>
                )}

                <div className="flex items-center gap-8">
                  <div className="relative group">
                    <div className="w-24 h-24 rounded-3xl bg-gray-100 dark:bg-white/5 overflow-hidden border-2 border-dashed border-gray-200 dark:border-white/10 group-hover:border-blue-500 transition-colors">
                      <img
                        src={
                          profile.profilePhoto?.trim()
                            ? profile.profilePhoto
                            : `https://i.pravatar.cc/150?u=${encodeURIComponent(profile.email || 'user')}`
                        }
                        alt="avatar"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={onPickPhoto}
                      disabled={disabledForm}
                      className="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl bg-white dark:bg-gray-800 shadow-lg flex items-center justify-center border border-gray-100 dark:border-white/10 hover:bg-blue-50 hover:text-blue-600 transition-all"
                    >
                      <Camera className="w-4 h-4" />
                    </button>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold mb-1">Profile Photo</h4>
                    <p className="text-xs text-muted-foreground max-w-[300px]">
                      At least 256x256 px. PNG, JPG or WEBP under 400KB (stored with your account).
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg text-[10px] font-bold border-gray-200 dark:border-white/10"
                        onClick={onPickPhoto}
                        disabled={disabledForm}
                      >
                        Upload New
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 rounded-lg text-[10px] font-bold text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                        onClick={removePhoto}
                        disabled={disabledForm}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      value={profile.fullName}
                      onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                      disabled={disabledForm}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      value={profile.email}
                      onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                      disabled={disabledForm}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                      Username
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">
                        @
                      </span>
                      <input
                        type="text"
                        className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl pl-8 pr-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                        value={profile.username}
                        onChange={(e) => setProfile({ ...profile, username: e.target.value })}
                        disabled={disabledForm}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                      Country / Region
                    </label>
                    <div className="relative">
                      <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <select
                        className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl pl-10 pr-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none cursor-pointer"
                        value={profile.countryOrRegion}
                        onChange={(e) => setProfile({ ...profile, countryOrRegion: e.target.value })}
                        disabled={disabledForm}
                      >
                        {profile.countryOrRegion.trim() &&
                        !isKnownCountry(profile.countryOrRegion.trim()) ? (
                          <option key={profile.countryOrRegion.trim()} value={profile.countryOrRegion.trim()}>
                            {profile.countryOrRegion.trim()}
                          </option>
                        ) : null}
                        {COUNTRY_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                    Bio / Profile Description
                  </label>
                  <textarea
                    className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all min-h-[100px] resize-none"
                    placeholder="Tell your customers about yourself..."
                    value={profile.bio}
                    onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                    disabled={disabledForm}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'store' && store && (
            <Card className="border-none shadow-xl bg-white/80 dark:bg-black/40 backdrop-blur-xl rounded-3xl overflow-hidden">
              <CardHeader className="border-b border-gray-100 dark:border-white/5 pb-8">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <CardTitle className="text-2xl font-black">Store Settings</CardTitle>
                    <CardDescription className="text-sm mt-1">
                      Contact, locale, and tax defaults for your storefront.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl border-gray-200 dark:border-white/10 h-10"
                      onClick={resetStore}
                      disabled={disabledForm || busy || !baseline || !token}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reset
                    </Button>
                    <Button
                      type="button"
                      className="rounded-xl bg-blue-600 text-white hover:bg-blue-700 h-10 px-6 shadow-lg shadow-blue-500/25"
                      onClick={saveStore}
                      disabled={disabledForm || busy || !token}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-8 space-y-8">
                {settingsLoading && (
                  <p className="text-sm text-muted-foreground font-medium">Loading settings…</p>
                )}
                {sectionError && activeTab === 'store' && (
                  <p className="text-sm text-rose-500 font-medium">{sectionError}</p>
                )}
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                      Store name
                    </label>
                    <input
                      type="text"
                      className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      value={store.storeName}
                      onChange={(e) => setStore({ ...store, storeName: e.target.value })}
                      disabled={disabledForm}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                      Store email
                    </label>
                    <input
                      type="email"
                      className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      value={store.storeEmail}
                      onChange={(e) => setStore({ ...store, storeEmail: e.target.value })}
                      disabled={disabledForm}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                      Store phone
                    </label>
                    <input
                      type="tel"
                      className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      value={store.storePhone}
                      onChange={(e) => setStore({ ...store, storePhone: e.target.value })}
                      disabled={disabledForm}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                      Store address
                    </label>
                    <textarea
                      className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all min-h-[80px] resize-none"
                      value={store.storeAddress}
                      onChange={(e) => setStore({ ...store, storeAddress: e.target.value })}
                      disabled={disabledForm}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                      Currency
                    </label>
                    <select
                      className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                      value={store.currency}
                      onChange={(e) => setStore({ ...store, currency: e.target.value })}
                      disabled={disabledForm}
                    >
                      {CURRENCY_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                      Timezone
                    </label>
                    <select
                      className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                      value={TIMEZONE_OPTIONS.includes(store.timezone as (typeof TIMEZONE_OPTIONS)[number]) ? store.timezone : 'UTC'}
                      onChange={(e) => setStore({ ...store, timezone: e.target.value })}
                      disabled={disabledForm}
                    >
                      {TIMEZONE_OPTIONS.map((z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                      Tax rate (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      value={store.taxRate}
                      onChange={(e) => setStore({ ...store, taxRate: Number(e.target.value) || 0 })}
                      disabled={disabledForm}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                      Language
                    </label>
                    <select
                      className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                      value={LANGUAGE_OPTIONS.some((l) => l.value === store.language) ? store.language : 'en'}
                      onChange={(e) => setStore({ ...store, language: e.target.value })}
                      disabled={disabledForm}
                    >
                      {LANGUAGE_OPTIONS.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'notifications' && notifications && (
            <Card className="border-none shadow-xl bg-white/80 dark:bg-black/40 backdrop-blur-xl rounded-3xl overflow-hidden">
              <CardHeader className="border-b border-gray-100 dark:border-white/5 pb-8">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <CardTitle className="text-2xl font-black">Notifications</CardTitle>
                    <CardDescription className="text-sm mt-1">
                      Choose how we reach you about orders and inventory.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl border-gray-200 dark:border-white/10 h-10"
                      onClick={resetNotifications}
                      disabled={disabledForm || busy || !baseline || !token}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reset
                    </Button>
                    <Button
                      type="button"
                      className="rounded-xl bg-blue-600 text-white hover:bg-blue-700 h-10 px-6 shadow-lg shadow-blue-500/25"
                      onClick={saveNotifications}
                      disabled={disabledForm || busy || !token}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-8 space-y-6">
                {settingsLoading && (
                  <p className="text-sm text-muted-foreground font-medium">Loading settings…</p>
                )}
                {sectionError && activeTab === 'notifications' && (
                  <p className="text-sm text-rose-500 font-medium">{sectionError}</p>
                )}
                {(
                  [
                    ['emailNotifications', 'Email notifications'] as const,
                    ['orderAlerts', 'Order alerts'] as const,
                    ['stockAlerts', 'Low stock alerts'] as const,
                    ['marketingEmails', 'Marketing emails'] as const,
                    ['pushNotifications', 'Push notifications'] as const,
                    ['smsNotifications', 'SMS notifications'] as const,
                  ] as const
                ).map(([key, label]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-gray-50/50 dark:bg-white/5 border border-gray-100 dark:border-white/10"
                  >
                    <span className="text-sm font-semibold">{label}</span>
                    <Switch
                      checked={notifications[key]}
                      onCheckedChange={(v) => setNotifications({ ...notifications, [key]: v })}
                      disabled={disabledForm}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {activeTab === 'security' && security && (
            <Card className="border-none shadow-xl bg-white/80 dark:bg-black/40 backdrop-blur-xl rounded-3xl overflow-hidden">
              <CardHeader className="border-b border-gray-100 dark:border-white/5 pb-8">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <CardTitle className="text-2xl font-black">Security & Access</CardTitle>
                    <CardDescription className="text-sm mt-1">
                      Sessions, alerts, and password for your account.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl border-gray-200 dark:border-white/10 h-10"
                      onClick={resetSecurity}
                      disabled={disabledForm || busy || !baseline || !token}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reset
                    </Button>
                    <Button
                      type="button"
                      className="rounded-xl bg-blue-600 text-white hover:bg-blue-700 h-10 px-6 shadow-lg shadow-blue-500/25"
                      onClick={saveSecurity}
                      disabled={disabledForm || busy || !token}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-8 space-y-8">
                {settingsLoading && (
                  <p className="text-sm text-muted-foreground font-medium">Loading settings…</p>
                )}
                {sectionError && activeTab === 'security' && (
                  <p className="text-sm text-rose-500 font-medium">{sectionError}</p>
                )}
                <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-gray-50/50 dark:bg-white/5 border border-gray-100 dark:border-white/10">
                  <span className="text-sm font-semibold">Two-factor authentication</span>
                  <Switch
                    checked={security.twoFactorEnabled}
                    onCheckedChange={(v) => setSecurity({ ...security, twoFactorEnabled: v })}
                    disabled={disabledForm}
                  />
                </div>
                <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-gray-50/50 dark:bg-white/5 border border-gray-100 dark:border-white/10">
                  <span className="text-sm font-semibold">Login alerts</span>
                  <Switch
                    checked={security.loginAlerts}
                    onCheckedChange={(v) => setSecurity({ ...security, loginAlerts: v })}
                    disabled={disabledForm}
                  />
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                      Session timeout (minutes)
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={1440}
                      className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      value={security.sessionTimeout}
                      onChange={(e) =>
                        setSecurity({ ...security, sessionTimeout: Number(e.target.value) || 30 })
                      }
                      disabled={disabledForm}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                      Allowed devices
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      value={security.allowedDevices}
                      onChange={(e) =>
                        setSecurity({ ...security, allowedDevices: Number(e.target.value) || 1 })
                      }
                      disabled={disabledForm}
                    />
                  </div>
                </div>
                <div className="border-t border-gray-100 dark:border-white/5 pt-8 space-y-4">
                  <h4 className="text-sm font-bold">Change password</h4>
                  <p className="text-xs text-muted-foreground">
                    Leave blank to keep your current password. Saving only security options does not require these
                    fields.
                  </p>
                  <div className="space-y-2">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                      Current password
                    </label>
                    <input
                      type="password"
                      autoComplete="current-password"
                      className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      disabled={disabledForm}
                    />
                  </div>
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                        New password
                      </label>
                      <input
                        type="password"
                        autoComplete="new-password"
                        className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        disabled={disabledForm}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                        Confirm new password
                      </label>
                      <input
                        type="password"
                        autoComplete="new-password"
                        className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={disabledForm}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'billing' && billing && (
            <Card className="border-none shadow-xl bg-white/80 dark:bg-black/40 backdrop-blur-xl rounded-3xl overflow-hidden">
              <CardHeader className="border-b border-gray-100 dark:border-white/5 pb-8">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <CardTitle className="text-2xl font-black">Billing & Plans</CardTitle>
                    <CardDescription className="text-sm mt-1">
                      Plan, billing contact, and subscription preferences.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl border-gray-200 dark:border-white/10 h-10"
                      onClick={resetBilling}
                      disabled={disabledForm || busy || !baseline || !token}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reset
                    </Button>
                    <Button
                      type="button"
                      className="rounded-xl bg-blue-600 text-white hover:bg-blue-700 h-10 px-6 shadow-lg shadow-blue-500/25"
                      onClick={saveBilling}
                      disabled={disabledForm || busy || !token}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-8 space-y-8">
                {settingsLoading && (
                  <p className="text-sm text-muted-foreground font-medium">Loading settings…</p>
                )}
                {sectionError && activeTab === 'billing' && (
                  <p className="text-sm text-rose-500 font-medium">{sectionError}</p>
                )}
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                      Current plan
                    </label>
                    <select
                      className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                      value={PLAN_OPTIONS.includes(billing.currentPlan as (typeof PLAN_OPTIONS)[number]) ? billing.currentPlan : 'Free'}
                      onChange={(e) => setBilling({ ...billing, currentPlan: e.target.value })}
                      disabled={disabledForm}
                    >
                      {PLAN_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                      Subscription status
                    </label>
                    <select
                      className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                      value={
                        STATUS_OPTIONS.includes(billing.subscriptionStatus as (typeof STATUS_OPTIONS)[number])
                          ? billing.subscriptionStatus
                          : 'inactive'
                      }
                      onChange={(e) => setBilling({ ...billing, subscriptionStatus: e.target.value })}
                      disabled={disabledForm}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                      Billing email
                    </label>
                    <input
                      type="email"
                      className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      value={billing.billingEmail}
                      onChange={(e) => setBilling({ ...billing, billingEmail: e.target.value })}
                      disabled={disabledForm}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                      Payment method (last 4)
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      inputMode="numeric"
                      className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      value={billing.paymentMethodLast4}
                      onChange={(e) =>
                        setBilling({
                          ...billing,
                          paymentMethodLast4: e.target.value.replace(/\D/g, '').slice(0, 4),
                        })
                      }
                      disabled={disabledForm}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                      Billing address
                    </label>
                    <textarea
                      className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all min-h-[80px] resize-none"
                      value={billing.billingAddress}
                      onChange={(e) => setBilling({ ...billing, billingAddress: e.target.value })}
                      disabled={disabledForm}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-gray-50/50 dark:bg-white/5 border border-gray-100 dark:border-white/10 md:col-span-2">
                    <span className="text-sm font-semibold">Auto-renew subscription</span>
                    <Switch
                      checked={billing.autoRenew}
                      onCheckedChange={(v) => setBilling({ ...billing, autoRenew: v })}
                      disabled={disabledForm}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'razorpay' && showRazorpay && (
            <Card className="border-none shadow-xl bg-white/80 dark:bg-black/40 backdrop-blur-xl rounded-3xl overflow-hidden">
              <CardHeader className="border-b border-gray-100 dark:border-white/5 pb-8">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <CardTitle className="text-2xl font-black">Razorpay Integration</CardTitle>
                    <CardDescription className="text-sm mt-1">
                      Configure your client-specific Razorpay payment credentials.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl border-gray-200 dark:border-white/10 h-10"
                      onClick={resetRazorpay}
                      disabled={busy || !razorpayBaseline || !token}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reset
                    </Button>
                    <Button
                      type="button"
                      className="rounded-xl bg-blue-600 text-white hover:bg-blue-700 h-10 px-6 shadow-lg shadow-blue-500/25"
                      onClick={saveRazorpay}
                      disabled={busy || !token}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-8 space-y-8">
                {settingsLoading && (
                  <p className="text-sm text-muted-foreground font-medium">Loading settings…</p>
                )}
                {sectionError && activeTab === 'razorpay' && (
                  <p className="text-sm text-rose-500 font-medium">{sectionError}</p>
                )}

                <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-gray-50/50 dark:bg-white/5 border border-gray-100 dark:border-white/10">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold">Enable Razorpay Payments</span>
                    <span className="text-xs text-muted-foreground">
                      Accept customer payments directly to your client Razorpay account.
                    </span>
                  </div>
                  <Switch
                    checked={razorpayEnabled}
                    onCheckedChange={(v) => setRazorpayEnabled(v)}
                    disabled={settingsLoading}
                  />
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                        Connection Status
                      </label>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                            isTestingConnection
                              ? 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400'
                              : isConnected
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : 'bg-gray-50 text-gray-800 border-gray-200 dark:bg-gray-900/30 dark:text-gray-400'
                          }`}
                        >
                          {isTestingConnection ? 'Testing' : isConnected ? 'Connected' : 'Not Connected'}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-3 rounded-lg text-xs"
                          onClick={testRazorpayConnection}
                          disabled={isTestingConnection || settingsLoading}
                        >
                          Test Connection
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                      Razorpay Key ID
                    </label>
                    <input
                      type="text"
                      placeholder="rzp_test_..."
                      className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      value={razorpayKeyId}
                      onChange={(e) => setRazorpayKeyId(e.target.value)}
                      disabled={settingsLoading}
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                      Razorpay Key Secret
                    </label>
                    <div className="relative">
                      <input
                        type={showKeySecret ? 'text' : 'password'}
                        placeholder="••••••••••••••••"
                        className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all pr-12"
                        value={razorpayKeySecret}
                        onChange={(e) => setRazorpayKeySecret(e.target.value)}
                        disabled={settingsLoading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowKeySecret(!showKeySecret)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showKeySecret ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                      Webhook Secret (Optional)
                    </label>
                    <div className="relative">
                      <input
                        type={showWebhookSecret ? 'text' : 'password'}
                        placeholder="••••••••••••••••"
                        className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all pr-12"
                        value={webhookSecret}
                        onChange={(e) => setWebhookSecret(e.target.value)}
                        disabled={settingsLoading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showWebhookSecret ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      </div>
    </div>
  );
}
