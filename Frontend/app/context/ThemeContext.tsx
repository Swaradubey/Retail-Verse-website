import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { themesApi, type ThemeData } from '../api/themes';

interface ThemeContextType {
  themeKey: string;
  themeData: ThemeData | null;
  isLoading: boolean;
  error: string | null;
  setThemeKey: (key: string) => void;
  refreshTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType>({
  themeKey: 'luxe-commerce',
  themeData: null,
  isLoading: true,
  error: null,
  setThemeKey: () => {},
  refreshTheme: async () => {},
});

const STORAGE_KEY = 'retail_verse_theme_key';

function getStoredClientId(): string | null {
  try {
    const user = localStorage.getItem('eco_shop_user');
    if (user) {
      const parsed = JSON.parse(user);
      if (parsed.clientId) return parsed.clientId;
    }
  } catch {}
  return localStorage.getItem('retail_verse_client_id');
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeKey, setThemeKeyState] = useState<string>('luxe-commerce');
  const [themeData, setThemeData] = useState<ThemeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resolveTheme = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const clientId = getStoredClientId();
      if (clientId) {
        const res = await themesApi.resolveStorefrontTheme(clientId);
        if (res.success && res.data) {
          const key = res.data.resolvedThemeKey || 'luxe-commerce';
          setThemeKeyState(key);
          setThemeData(res.data.theme);
          localStorage.setItem(STORAGE_KEY, key);
          setIsLoading(false);
          return;
        }
      }
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && ['luxe-commerce', 'nova-marketplace'].includes(stored)) {
        setThemeKeyState(stored);
      }
      setIsLoading(false);
    } catch {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && ['luxe-commerce', 'nova-marketplace'].includes(stored)) {
        setThemeKeyState(stored);
      }
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    resolveTheme();
  }, [resolveTheme]);

  const setThemeKey = useCallback((key: string) => {
    if (['luxe-commerce', 'nova-marketplace'].includes(key)) {
      setThemeKeyState(key);
      localStorage.setItem(STORAGE_KEY, key);
    }
  }, []);

  const refreshTheme = useCallback(async () => {
    await resolveTheme();
  }, [resolveTheme]);

  return (
    <ThemeContext.Provider value={{ themeKey, themeData, isLoading, error, setThemeKey, refreshTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (ctx === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
