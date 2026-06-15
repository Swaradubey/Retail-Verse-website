import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import ApiService from '../api/apiService';

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
  }, []);

  return (
    <BrandingContext.Provider value={{ branding, isLoading, updateBranding, reloadBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (ctx === undefined) {
    throw new Error('useBranding must be used within a BrandingProvider');
  }

  const brandName = ctx.branding?.businessName || ctx.branding?.brandingName || 'Business Store';
  const footerText = ctx.branding?.footerText || `© 2026 ${brandName}. All rights reserved. | Powered by Hexerve`;
  const logo = ctx.branding?.logo || '';
  const primaryColor = ctx.branding?.primaryColor || '';

  return {
    ...ctx,
    brandName,
    footerText,
    logo,
    primaryColor,
  };
}
