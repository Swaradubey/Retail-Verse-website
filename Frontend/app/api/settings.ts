import ApiService from "./apiService";

export interface SettingsProfile {
  fullName: string;
  username: string;
  email: string;
  countryOrRegion: string;
  bio: string;
  profilePhoto: string;
}

export interface SettingsStore {
  storeName: string;
  storeEmail: string;
  storePhone: string;
  storeAddress: string;
  currency: string;
  timezone: string;
  taxRate: number;
  language: string;
  logoUrl?: string | null;
}

export interface SettingsNotifications {
  emailNotifications: boolean;
  orderAlerts: boolean;
  stockAlerts: boolean;
  marketingEmails: boolean;
  pushNotifications: boolean;
  smsNotifications: boolean;
}

export interface SettingsSecurity {
  twoFactorEnabled: boolean;
  loginAlerts: boolean;
  sessionTimeout: number;
  allowedDevices: number;
}

export interface SettingsBilling {
  currentPlan: string;
  billingEmail: string;
  billingAddress: string;
  autoRenew: boolean;
  paymentMethodLast4: string;
  subscriptionStatus: string;
}

export interface SettingsPayload {
  profile: SettingsProfile;
  store: SettingsStore;
  notifications: SettingsNotifications;
  security: SettingsSecurity;
  billing: SettingsBilling;
}

/** Full document for PUT /api/settings; password fields are only sent from the Security tab. */
export type SettingsUpdateBody = SettingsPayload & {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
};

export const settingsApi = {
  get: () => ApiService.get<SettingsPayload>("/api/settings"),

  /** Persists all settings sections in one request; mirrors into the `settings` collection on the server. */
  updateFull: (body: SettingsUpdateBody) =>
    ApiService.put<SettingsPayload>("/api/settings", body),

  reset: () => ApiService.delete<SettingsPayload>("/api/settings/reset"),

  updateProfile: (body: Partial<SettingsProfile>) =>
    ApiService.put<SettingsPayload>("/api/settings/profile", body),

  updateStore: (body: Partial<SettingsStore>) =>
    ApiService.put<SettingsPayload>("/api/settings/store", body),

  uploadLogo: (file: File) => {
    const formData = new FormData();
    formData.append("logo", file);
    return ApiService.post<{ success: boolean; message: string; logoUrl: string }>("/api/settings/logo", formData);
  },

  updateNotifications: (body: Partial<SettingsNotifications>) =>
    ApiService.put<SettingsPayload>("/api/settings/notifications", body),

  updateSecurity: (
    body: Partial<SettingsSecurity> & {
      currentPassword?: string;
      newPassword?: string;
      confirmPassword?: string;
    }
  ) => ApiService.put<SettingsPayload>("/api/settings/security", body),

  updateBilling: (body: Partial<SettingsBilling>) =>
    ApiService.put<SettingsPayload>("/api/settings/billing", body),

  getRazorpayConfig: () =>
    ApiService.get<RazorpayConfigData>("/api/client/payment-settings/razorpay"),

  saveRazorpayConfig: (body: {
    razorpayEnabled: boolean;
    razorpayKeyId: string;
    razorpayKeySecret?: string;
    webhookSecret?: string;
  }) =>
    ApiService.post<RazorpayConfigData>("/api/client/payment-settings/razorpay", body),

  testRazorpayConfig: (body: {
    razorpayKeyId: string;
    razorpayKeySecret?: string;
    webhookSecret?: string;
  }) =>
    ApiService.post<{ success: boolean; message: string }>("/api/client/payment-settings/razorpay/test", body),
};

export interface RazorpayConfigData {
  razorpayEnabled: boolean;
  razorpayKeyId: string;
  razorpayKeySecret: string;
  webhookSecret: string;
  isConnected: boolean;
}

