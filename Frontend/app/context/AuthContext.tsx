import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { authApi } from '../api/auth';
import { userApi, type ProfileUser, type ImpersonationInfo } from '../api/user';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LoginResponseData {
  _id: string;
  name: string;
  email: string;
  role: string;
  token: string;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  phone?: string;
  address?: string;
  clientId?: string | null;
  managerId?: string | null;
  lastLoginAt?: string | null;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  storeId: string;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  username?: string;
  country?: string;
  bio?: string;
  phone?: string;
  address?: string;
  lastLoginAt?: string | null;
  /** Present when `role` is `client` — MongoDB Client document id for inventory scope. */
  clientId?: string;
  managerId?: string | null;
  trialStatus?: string;
  isTrialExpired?: boolean;
  /** Super Admin impersonation session (JWT includes `impersonatedBy`). */
  impersonation?: ImpersonationInfo;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<LoginResponseData>;
  loginSuperAdmin: (email: string, password: string) => Promise<LoginResponseData>;
  register: (name: string, email: string, password: string, confirmPassword: string, captcha: string, captchaId: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  patchUser: (partial: Partial<User>) => void;
  /** Re-read profile from `/api/users/me` using the token in storage (after impersonate / stop). */
  refreshSession: () => Promise<void>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const USER_STORAGE_KEY = 'eco_shop_user';
export const TOKEN_STORAGE_KEY = 'eco_shop_token';

/** Super Admin JWT stored while viewing the Admin Dashboard via impersonation (restore if needed). */
export const IMPERSONATION_SUPER_TOKEN_BACKUP_KEY = 'eco_shop_impersonation_super_backup';

/** Clear any UI navigation‑persistence keys so a fresh login always starts on the role's default route. */
export function resetNavigationState(): void {
  const keys = [
    'activePage',
    'activeTab',
    'selectedMenu',
    'selectedSection',
    'currentRoute',
    'lastRoute',
    'lastVisitedPath',
    'dashboardView',
    'sidebarActiveItem',
  ];
  for (const key of keys) {
    localStorage.removeItem(key);
  }
}

function mergeProfileIntoUser(
  fresh: ProfileUser,
  prev: Partial<User> & Record<string, unknown>
): User {
  return {
    ...prev,
    id: String(fresh._id ?? ''),
    name: fresh.name,
    email: fresh.email,
    role: fresh.role,
    storeId: typeof prev.storeId === 'string' ? prev.storeId : '',
    username: fresh.username,
    country: fresh.country,
    bio: fresh.bio,
    phone: fresh.phone,
    address: fresh.address,
    lastLoginAt: fresh.lastLoginAt ?? null,
    managerId:
      fresh.managerId != null && String(fresh.managerId).trim() !== ''
        ? String(fresh.managerId)
        : undefined,
    clientId:
      fresh.clientId != null && String(fresh.clientId).trim() !== ''
        ? String(fresh.clientId)
        : undefined,
    isAdmin: fresh.role === 'admin' || fresh.role === 'super_admin',
    isSuperAdmin: fresh.role === 'super_admin',
    trialStatus: fresh.trialStatus,
    isTrialExpired: fresh.isTrialExpired,
    impersonation: fresh.impersonation,
  };
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Rehydrate from localStorage, then refresh role/profile from API so stale admin-shaped data cannot linger
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Check for token in storage
        const storedUser = localStorage.getItem(USER_STORAGE_KEY);
        const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
        if (!storedToken) {
          setIsLoading(false);
          return;
        }

        setToken(storedToken);
        if (storedUser) {
          try {
            setUser(JSON.parse(storedUser));
          } catch {
            localStorage.removeItem(USER_STORAGE_KEY);
          }
        }

        const res = await userApi.getMe();
        if (cancelled || !res.success || !res.data) {
          return;
        }

        const fresh = res.data as ProfileUser;
        let prev: Partial<User> & Record<string, unknown> = {};
        try {
          prev = storedUser ? (JSON.parse(storedUser) as Partial<User> & Record<string, unknown>) : {};
        } catch {
          prev = {};
        }

        const merged = mergeProfileIntoUser(fresh, prev);

        setUser(merged);
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify({ ...merged, _id: fresh._id }));
      } catch {
        if (cancelled) return;
        if (!localStorage.getItem(TOKEN_STORAGE_KEY)) {
          setUser(null);
          setToken(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshSession = useCallback(async () => {
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!storedToken) {
      setToken(null);
      setUser(null);
      return;
    }
    setToken(storedToken);
    try {
      const res = await userApi.getMe();
      if (!res.success || !res.data) {
        return;
      }
      const fresh = res.data as ProfileUser;
      let prev: Partial<User> & Record<string, unknown> = {};
      try {
        const raw = localStorage.getItem(USER_STORAGE_KEY);
        prev = raw ? (JSON.parse(raw) as Partial<User> & Record<string, unknown>) : {};
      } catch {
        prev = {};
      }
      const merged = mergeProfileIntoUser(fresh, prev);
      setUser(merged);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify({ ...merged, _id: fresh._id }));
    } catch {
      /* keep existing user if refresh fails */
    }
  }, []);

  // ── Login (backend JWT only; role comes from server) ────────────────────────
  const login = async (email: string, password: string): Promise<LoginResponseData> => {
    const response = await authApi.login({ email, password });

    if (response.success && (response.data as LoginResponseData)?.token) {
      const data = response.data as LoginResponseData;
      localStorage.removeItem(IMPERSONATION_SUPER_TOKEN_BACKUP_KEY);
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data));
      if (data.clientId) {
        localStorage.setItem('retail_verse_client_id', String(data.clientId));
      }
      // Always persist the domain so the backend tenant resolver can identify
      // the custom domain (e.g. retailverse.in) even for accounts without clientId.
      localStorage.setItem('retail_verse_client_domain', window.location.hostname);
      localStorage.setItem('retail_verse_client_origin', window.location.origin);

      setToken(data.token);
      setUser(data as User);

      if (data.role === 'admin') {
        try {
          await authApi.logAdminLogin({
            email: data.email,
            role: data.role,
            message: 'Admin logged in successfully with real JWT',
          });
        } catch (logError) {
          console.warn('Failed to log admin login activity:', logError);
        }
      }

      await refreshSession();

      return data;
    }

    throw new Error(response.message || 'Login failed');
  };

  const loginSuperAdmin = async (
    email: string,
    password: string
  ): Promise<LoginResponseData> => {
    const response = await authApi.superAdminLogin({ email, password });

    if (response.success && (response.data as LoginResponseData)?.token) {
      const data = response.data as LoginResponseData;
      localStorage.removeItem(IMPERSONATION_SUPER_TOKEN_BACKUP_KEY);
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data));
      if (data.clientId) {
        localStorage.setItem('retail_verse_client_id', String(data.clientId));
      }
      // Always persist the domain so the backend tenant resolver can identify
      // the custom domain (e.g. retailverse.in) even for accounts without clientId.
      localStorage.setItem('retail_verse_client_domain', window.location.hostname);
      localStorage.setItem('retail_verse_client_origin', window.location.origin);

      setToken(data.token);
      setUser(data as User);

      await refreshSession();

      return data;
    }

    throw new Error(response.message || 'Login failed');
  };

  // ── Real backend register ──────────────────────────────────────────────────
  const register = async (
    name: string,
    email: string,
    password: string,
    confirmPassword: string,
    captcha: string,
    captchaId: string
  ): Promise<void> => {
    const response = await authApi.register({ name, email, password, confirmPassword, captcha, captchaId });
    
    if (response.success && (response.data as any)?.token) {
      const data = response.data as any;
      // Auto-login after successful registration
      localStorage.removeItem(IMPERSONATION_SUPER_TOKEN_BACKUP_KEY);
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data));
      if (data.clientId) {
        localStorage.setItem('retail_verse_client_id', String(data.clientId));
      }

      setToken(data.token);
      setUser(data as User);
      await refreshSession();
    } else if (!response.success) {
      throw new Error(response.message || 'Registration failed');
    }
  };

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = () => {
    setUser(null);
    setToken(null);
    resetNavigationState();
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(IMPERSONATION_SUPER_TOKEN_BACKUP_KEY);
    localStorage.removeItem('retail_verse_client_id');
    localStorage.removeItem('retail_verse_client_domain');
    localStorage.removeItem('retail_verse_client_origin');
  };

  const patchUser = (partial: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      try {
        const raw = localStorage.getItem(USER_STORAGE_KEY);
        if (raw) {
          const stored = JSON.parse(raw);
          Object.assign(stored, partial);
          localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(stored));
        }
      } catch {
        /* ignore corrupt storage */
      }
      return next;
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        loginSuperAdmin,
        register,
        logout,
        isLoading,
        patchUser,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
