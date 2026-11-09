/**
 * useThemeLayout.ts
 *
 * React hook that exposes the active ThemeLayout config (typography, header,
 * footer) to any component on the storefront.  On the first call it fetches
 * the config from the backend (or returns cached defaults instantly), and from
 * then on it stays in sync via a lightweight React Context.
 *
 * Usage:
 *   const { typography, headerConfig, footerConfig, loading } = useThemeLayout();
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import {
  themeLayoutApi,
  type ThemeLayoutData,
  DEFAULT_THEME_LAYOUT,
} from "../api/themeLayout";
import { useAuth } from "./AuthContext";

// ── Context ───────────────────────────────────────────────────────────────────

interface ThemeLayoutContextValue {
  typography: ThemeLayoutData["typography"];
  headerConfig: ThemeLayoutData["headerConfig"];
  footerConfig: ThemeLayoutData["footerConfig"];
  loading: boolean;
  reload: () => void;
}

const ThemeLayoutContext = createContext<ThemeLayoutContextValue>({
  ...DEFAULT_THEME_LAYOUT,
  loading: false,
  reload: () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────

interface ThemeLayoutProviderProps {
  children: ReactNode;
  /** Pass a clientId to use the public (unauthenticated) endpoint. */
  publicClientId?: string;
}

export function ThemeLayoutProvider({
  children,
  publicClientId,
}: ThemeLayoutProviderProps) {
  const { token } = useAuth();
  const [data, setData] = useState<ThemeLayoutData>(DEFAULT_THEME_LAYOUT);
  const [loading, setLoading] = useState(false);
  const isMounted = useRef(true);

  const load = useCallback(async () => {
    // Don't fetch if neither a public clientId nor an authenticated token exists
    if (!publicClientId && !token) return;

    setLoading(true);
    try {
      const res = publicClientId
        ? await themeLayoutApi.getPublic(publicClientId)
        : await themeLayoutApi.get();

      if (isMounted.current && res.success && res.data) {
        setData(res.data);
        applyGlobalCssVars(res.data);
      }
    } catch (err) {
      // Silent fallback to defaults — the storefront should never hard-fail
      console.warn("[ThemeLayoutProvider] fetch error, using defaults:", err);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [publicClientId, token]);

  useEffect(() => {
    isMounted.current = true;
    load();
    return () => {
      isMounted.current = false;
    };
  }, [load]);

  return (
    <ThemeLayoutContext.Provider
      value={{
        typography: data.typography,
        headerConfig: data.headerConfig,
        footerConfig: data.footerConfig,
        loading,
        reload: load,
      }}
    >
      {children}
    </ThemeLayoutContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useThemeLayout(): ThemeLayoutContextValue {
  return useContext(ThemeLayoutContext);
}

// ── CSS variable injection (optional progressive enhancement) ─────────────────

/**
 * Injects CSS custom properties onto :root so that the storefront's stylesheet
 * can reference them without React re-renders:
 *   --tl-font-family: "Inter", sans-serif;
 *   --tl-base-font-size: 16px;
 *   --tl-header-bg: #ffffff;
 *   --tl-header-text: #111827;
 *   --tl-footer-bg: #0f172a;
 *   --tl-footer-text: #f8fafc;
 */
function applyGlobalCssVars(d: ThemeLayoutData) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--tl-font-family", `"${d.typography.fontFamily}", sans-serif`);
  root.style.setProperty("--tl-base-font-size", d.typography.baseFontSize);
  root.style.setProperty("--tl-header-bg", d.headerConfig.backgroundColor);
  root.style.setProperty("--tl-header-text", d.headerConfig.textColor);
  root.style.setProperty("--tl-footer-bg", d.footerConfig.backgroundColor);
  root.style.setProperty("--tl-footer-text", d.footerConfig.textColor);
}

