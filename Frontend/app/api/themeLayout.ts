import ApiService from "./apiService";

// ── Types ─────────────────────────────────────────────────────────────────────

export type FontFamily =
  | "Inter"
  | "Roboto"
  | "Poppins"
  | "Plus Jakarta Sans"
  | "Open Sans";

export type BaseFontSize = "14px" | "16px";

export type HeaderVariant = "standard" | "minimal" | "centered" | "floating";

export type FooterVariant = "classic" | "minimal" | "multi-column";

export interface CustomLink {
  label: string;
  url: string;
  visible: boolean;
}

export interface FooterColumnLink {
  label: string;
  url: string;
}

export interface FooterColumn {
  title: string;
  links: FooterColumnLink[];
}

export interface TypographyConfig {
  fontFamily: FontFamily;
  headingFont: string;
  baseFontSize: BaseFontSize;
}

export interface HeaderConfig {
  variant: HeaderVariant;
  backgroundColor: string;
  textColor: string;
  sticky: boolean;
  showSearchBar: boolean;
  showCategories: boolean;
  customLinks: CustomLink[];
}

export interface FooterConfig {
  variant: FooterVariant;
  backgroundColor: string;
  textColor: string;
  showNewsletter: boolean;
  showSocialLinks: boolean;
  copyrightText: string;
  columns: FooterColumn[];
}

export interface ThemeLayoutData {
  typography: TypographyConfig;
  headerConfig: HeaderConfig;
  footerConfig: FooterConfig;
}

export type ThemeLayoutUpdateBody = Partial<ThemeLayoutData>;

// ── Defaults (kept in sync with backend defaults) ─────────────────────────────

export const DEFAULT_TYPOGRAPHY: TypographyConfig = {
  fontFamily: "Inter",
  headingFont: "Inter",
  baseFontSize: "16px",
};

export const DEFAULT_HEADER_CONFIG: HeaderConfig = {
  variant: "standard",
  backgroundColor: "#ffffff",
  textColor: "#111827",
  sticky: true,
  showSearchBar: true,
  showCategories: true,
  customLinks: [],
};

export const DEFAULT_FOOTER_CONFIG: FooterConfig = {
  variant: "classic",
  backgroundColor: "#0f172a",
  textColor: "#f8fafc",
  showNewsletter: true,
  showSocialLinks: true,
  copyrightText: `© ${new Date().getFullYear()} YourBrand. All rights reserved.`,
  columns: [],
};

export const DEFAULT_THEME_LAYOUT: ThemeLayoutData = {
  typography: DEFAULT_TYPOGRAPHY,
  headerConfig: DEFAULT_HEADER_CONFIG,
  footerConfig: DEFAULT_FOOTER_CONFIG,
};

// ── API ───────────────────────────────────────────────────────────────────────

export const themeLayoutApi = {
  /** Fetch the authenticated client's ThemeLayout (falls back to defaults). */
  get: () => ApiService.get<ThemeLayoutData>("/api/theme-layout"),

  /** Upsert all three sections in one request. */
  updateFull: (body: ThemeLayoutUpdateBody) =>
    ApiService.put<ThemeLayoutData>("/api/theme-layout", body),

  /** Update only typography. */
  updateTypography: (body: Partial<TypographyConfig>) =>
    ApiService.put<ThemeLayoutData>("/api/theme-layout/typography", body),

  /** Update only header config. */
  updateHeader: (body: Partial<HeaderConfig>) =>
    ApiService.put<ThemeLayoutData>("/api/theme-layout/header", body),

  /** Update only footer config. */
  updateFooter: (body: Partial<FooterConfig>) =>
    ApiService.put<ThemeLayoutData>("/api/theme-layout/footer", body),

  /** Reset all theme layout settings to platform defaults. */
  reset: () => ApiService.delete<ThemeLayoutData>("/api/theme-layout/reset"),

  /** Public (unauthenticated) endpoint for the storefront. */
  getPublic: (clientId: string) =>
    ApiService.get<ThemeLayoutData>(`/api/theme-layout/public/${clientId}`),
};

