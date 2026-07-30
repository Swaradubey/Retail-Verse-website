import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useLocation } from 'react-router';
import ApiService from '../api/apiService';
import { useAuth } from '../context/AuthContext';
import { isSuperAdminRole } from '../utils/staffRoles';

export interface BrandingData {
  clientId?: string;
  businessName?: string;
  brandingName?: string;
  footerText?: string;
  logo?: string;
  primaryColor?: string;
}

interface BrandingContextType {
  branding: BrandingData | null;
  isLoading: boolean;
  updateBranding: (data: BrandingData | null) => void;
  reloadBranding: () => Promise<void>;
}

const defaultBranding: BrandingData = {};

const BrandingContext = createContext<BrandingContextType>({
  branding: defaultBranding,
  isLoading: false,
  updateBranding: () => { },
  reloadBranding: async () => { },
});

const SELECTED_CLIENT_ID_KEY = 'selectedClientId';

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<BrandingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { user: authUser } = useAuth();

  // Watch auth state changes: clear client-specific branding when user is
  // Super Admin or logs out, preventing stale client branding leaks.
  useEffect(() => {
    if (!authUser || isSuperAdminRole(authUser.role) || authUser.isSuperAdmin) {
      setBranding(null);
      localStorage.removeItem(SELECTED_CLIENT_ID_KEY);
    }
  }, [authUser]);

  useEffect(() => {
    let cancelled = false;

    async function loadBranding() {
      try {
        // Priority 1: URL params ?clientId=xxx
        const params = new URLSearchParams(window.location.search);
        let targetClientId = params.get('clientId');

        if (targetClientId) {
          localStorage.setItem(SELECTED_CLIENT_ID_KEY, targetClientId);
        } else {
          // Priority 2: localStorage selectedClientId
          targetClientId = localStorage.getItem(SELECTED_CLIENT_ID_KEY);
        }

        if (targetClientId) {
          try {
            const res = await ApiService.get(`/api/public/branding/${targetClientId}`);
            if (!cancelled && res && res.success && res.branding) {
              setBranding(res.branding);
              setIsLoading(false);
              return;
            }
          } catch {
            // Fall through to domain-based or default
          }
        }

        // Priority 3: domain-based branding
        const hostname = window.location.hostname;
        if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
          try {
            const res = await ApiService.get(`/api/public/branding?domain=${hostname}`);
            if (!cancelled && res && res.success && res.branding) {
              setBranding(res.branding);
              setIsLoading(false);
              return;
            }
          } catch {
            // Fall through to default
          }
        }
      } catch {
        // Final fallback: default branding
      }

      if (!cancelled) {
        setBranding(null);
        setIsLoading(false);
      }
    }

    loadBranding();

    return () => {
      cancelled = true;
    };
  }, []);

  const updateBranding = useCallback((data: BrandingData | null) => {
    setBranding(data);
  }, []);

  const reloadBranding = useCallback(async () => {
    setIsLoading(true);
    try {
      const targetClientId = authUser?.clientId || localStorage.getItem(SELECTED_CLIENT_ID_KEY);
      if (targetClientId) {
        const res = await ApiService.get(`/api/public/branding/${targetClientId}`);
        if (res && res.success && res.branding) {
          setBranding(res.branding);
          setIsLoading(false);
          return;
        }
      }

      const hostname = window.location.hostname;
      if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
        const res = await ApiService.get(`/api/public/branding?domain=${hostname}`);
        if (res && res.success && res.branding) {
          setBranding(res.branding);
          setIsLoading(false);
          return;
        }
      }
    } catch {
      // Fallback to default
    }
    setBranding(null);
    setIsLoading(false);
  }, [authUser]);

  return (
    <BrandingContext.Provider value={{ branding, isLoading, updateBranding, reloadBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  const { user } = useAuth();
  const location = useLocation();

  if (ctx === undefined) {
    throw new Error('useBranding must be used within a BrandingProvider');
  }

  const isSuperAdminRoute = location.pathname.startsWith('/super-admin');
  const isSuperAdmin = isSuperAdminRoute || user?.isSuperAdmin === true || isSuperAdminRole(user?.role);

  const brandName = isSuperAdmin
    ? 'Retail Verse'
    : ctx.branding?.businessName || ctx.branding?.brandingName || 'Retail Verse';

  const footerText = isSuperAdmin
    ? `© ${new Date().getFullYear()} Retail Verse. All rights reserved. | Powered by Hexerve`
    : ctx.branding?.footerText || `© 2026 ${brandName}. All rights reserved. | Powered by Hexerve`;

  const logo = isSuperAdmin ? '' : ctx.branding?.logo || (user as any)?.storeSettings?.logoUrl || '';
  const primaryColor = isSuperAdmin ? '' : ctx.branding?.primaryColor || '';

  return {
    ...ctx,
    brandName,
    footerText,
    logo,
    primaryColor,
  };
}
