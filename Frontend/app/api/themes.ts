import ApiService from "./apiService";

export interface ThemeData {
  _id: string;
  key: string;
  name: string;
  description: string;
  isEnabled: boolean;
  isDefault: boolean;
  previewImage: string;
  features: string[];
  layoutStyle: string;
  typographyStyle: string;
  colorPalette: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
  };
}

export interface ThemeUsageData {
  themeKey: string | null;
  themeName: string;
  clientCount: number;
}

export interface ClientAssignmentData {
  _id: string;
  companyName: string;
  shopName: string;
  email: string;
  selectedThemeKey: string | null;
  createdAt: string;
}

export interface MyThemeData {
  selectedThemeKey: string | null;
  resolvedThemeKey: string;
  theme: ThemeData | null;
}

export const themesApi = {
  // Super Admin
  getAll: () => ApiService.get<ThemeData[]>("/api/themes"),
  getUsage: () => ApiService.get<ThemeUsageData[]>("/api/themes/usage"),
  setDefault: (themeKey: string) =>
    ApiService.put<ThemeData[]>("/api/themes/default", { themeKey }),
  toggle: (themeKey: string) =>
    ApiService.put<ThemeData[]>(`/api/themes/${themeKey}/toggle`, {}),
  assignToClient: (clientId: string, themeKey: string) =>
    ApiService.put<any>(`/api/themes/assign/${clientId}`, { themeKey }),
  resetClient: (clientId: string) =>
    ApiService.put<any>(`/api/themes/reset/${clientId}`, {}),
  getClientAssignments: (params?: { search?: string; themeKey?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.themeKey) q.set("themeKey", params.themeKey);
    if (params?.page) q.set("page", String(params.page));
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return ApiService.get<{ data: ClientAssignmentData[]; pagination: any }>(
      `/api/themes/client-assignments${qs ? `?${qs}` : ""}`
    );
  },
  seed: () => ApiService.post<any>("/api/themes/seed", {}),

  // Client
  getAvailable: () => ApiService.get<ThemeData[]>("/api/themes/available"),
  getMyTheme: () => ApiService.get<MyThemeData>("/api/themes/my-theme"),
  updateMyTheme: (themeKey: string) =>
    ApiService.put<any>("/api/themes/my-theme", { themeKey }),
  resetMyTheme: () => ApiService.put<any>("/api/themes/my-theme/reset", {}),

  // Public
  resolveStorefrontTheme: (clientId: string) =>
    ApiService.get<{ resolvedThemeKey: string; theme: ThemeData | null }>(
      `/api/themes/storefront/${clientId}`
    ),
};
