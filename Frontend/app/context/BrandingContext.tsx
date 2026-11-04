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
  localLogo: string | null;
  updateBranding: (data: BrandingData | null) => void;
  reloadBranding: () => Promise<void>;
}

const defaultBranding: BrandingData = {};
export const STORE_LOGO_KEY = 'eco_shop_store_logo';

const BrandingContext = createContext<BrandingContextType>({
  branding: defaultBranding,
  isLoading: false,
  localLogo: null,
  updateBranding: () => { },
  reloadBranding: async () => { },
});

const SELECTED_CLIENT_ID_KEY = 'selectedClientId';

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<BrandingData | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const savedDomainData = localStorage.getItem('retail_verse_domain_data');
      if (savedDomainData) {
        const parsed = JSON.parse(savedDomainData);
        const client = parsed?.client;
        if (client) {
          const brandName = client.brandingName || client.shopName || client.companyName || '';
          return {
            clientId: client._id,
            businessName: brandName,
            brandingName: client.brandingName || '',
            footerText: client.footerText || `© ${new Date().getFullYear()} ${brandName}. All rights reserved.`,
            logo: client.logo || '',
            primaryColor: client.primaryColor || '',
          };
        }
      }
    } catch {}
    return null;
  });
  const [localLogo, setLocalLogo] = useState<string | null>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem(STORE_LOGO_KEY) : null;
  });
  const [isLoading, setIsLoading] = useState(true);
  const { user: authUser } = useAuth();

  useEffect(() => {
    const syncLogo = () => {
      setLocalLogo(localStorage.getItem(STORE_LOGO_KEY));
    };

    window.addEventListener('logo-changed', syncLogo);
    window.addEventListener('storage', syncLogo);

    return () => {
      window.removeEventListener('logo-changed', syncLogo);
      window.removeEventListener('storage', syncLogo);
    };
  }, []);

  const loadBranding = useCallback(async () => {
    setIsLoading(true);
    try {
      const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
      const isCustomDomain = Boolean(hostname && hostname !== 'localhost' && hostname !== '127.0.0.1');

      // Priority 1: domain-based branding for custom domains (e.g. daizyhome.com)
      if (isCustomDomain) {
        try {
          const res = await ApiService.get(`/api/public/branding?domain=${hostname}`);
          if (res && res.success && res.branding) {
            setBranding(res.branding);
            setIsLoading(false);
            return;
          }
        } catch {
          // Fall through to domain-data or clientId
        }

        // Fallback: check cached retail_verse_domain_data
        const domainDataStr = typeof window !== 'undefined' ? localStorage.getItem('retail_verse_domain_data') : null;
        if (domainDataStr) {
          try {
            const parsed = JSON.parse(domainDataStr);
            const client = parsed?.client;
            if (client) {
              const brandName = client.brandingName || client.shopName || client.companyName || '';
              setBranding({
                clientId: client._id,
                businessName: brandName,
                brandingName: client.brandingName || '',
                footerText: client.footerText || `© ${new Date().getFullYear()} ${brandName}. All rights reserved.`,
                logo: client.logo || '',
                primaryColor: client.primaryColor || '',
              });
              setIsLoading(false);
              return;
            }
          } catch {}
        }
      }

      // Priority 2: URL params ?clientId=xxx
      const params = new URLSearchParams(window.location.search);
      let targetClientId = params.get('clientId');

      if (targetClientId) {
        localStorage.setItem(SELECTED_CLIENT_ID_KEY, targetClientId);
      } else {
        // Priority 3: localStorage selectedClientId, authUser.clientId, or retail_verse_client_id
        targetClientId =
          authUser?.clientId ||
          localStorage.getItem(SELECTED_CLIENT_ID_KEY) ||
          localStorage.getItem('retail_verse_client_id');
      }

      if (targetClientId) {
        try {
          const res = await ApiService.get(`/api/public/branding/${targetClientId}`);
          if (res && res.success && res.branding) {
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

    setBranding(null);
    setIsLoading(false);
  }, [authUser?.clientId]);

  // Load branding on mount or when client ID changes
  useEffect(() => {
    loadBranding();
  }, [loadBranding]);

  // Watch auth state changes: clear client-specific branding when user is
  // Super Admin or logs out on non-custom domains, preventing stale client branding leaks.
  useEffect(() => {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    const isCustomDomain = Boolean(hostname && hostname !== 'localhost' && hostname !== '127.0.0.1');

    if (isCustomDomain) {
      // On custom domains (e.g. daizyhome.com), tenant branding is anchored to the domain
      // and must persist across sign-in and sign-out.
      return;
    }

    if (!authUser || isSuperAdminRole(authUser.role) || authUser.isSuperAdmin) {
      setBranding(null);
      localStorage.removeItem(SELECTED_CLIENT_ID_KEY);
    }
  }, [authUser]);

  const updateBranding = useCallback((data: BrandingData | null) => {
    setBranding(data);
  }, []);

  const reloadBranding = useCallback(async () => {
    await loadBranding();
  }, [loadBranding]);

  return (
    <BrandingContext.Provider value={{ branding, isLoading, localLogo, updateBranding, reloadBranding }}>
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

  const logo = isSuperAdmin
    ? ''
    : ctx.branding?.logo || (user as any)?.storeSettings?.logoUrl || ctx.localLogo || '';
  const primaryColor = isSuperAdmin ? '' : ctx.branding?.primaryColor || '';

  return {
    ...ctx,
    brandName,
    footerText,
    logo,
    primaryColor,
  };
}
