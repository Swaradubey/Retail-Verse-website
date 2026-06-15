import ApiService from "./apiService";

export type ImpersonationInfo = {
  active: boolean;
  superAdminId: string;
  superAdminName: string;
  superAdminEmail?: string;
};

export interface ProfileUser {
  _id: string;
  name: string;
  email: string;
  role: string;
  username?: string;
  country?: string;
  bio?: string;
  phone?: string;
  address?: string;
  isActive?: boolean;
  clientId?: string | null;
  managerId?: string | null;
  lastLoginAt?: string | null;
  trialStatus?: string;
  isTrialExpired?: boolean;
  businessName?: string | null;
  /** Present when the JWT was issued via Super Admin impersonation (`impersonatedBy` claim). */
  impersonation?: ImpersonationInfo;
}

export type PlatformUserRow = ProfileUser & {
  createdAt?: string;
  lastLoginAt?: string | null;
};

export type PlatformUsersListData = {
  users: PlatformUserRow[];
  total: number;
  page: number;
  limit: number;
  pages: number;
};

export const userApi = {
  getMe: () => ApiService.get<ProfileUser>("/api/users/me"),
  updateMe: (body: {
    name?: string;
    username?: string;
    country?: string;
    bio?: string;
  }) => ApiService.put<ProfileUser>("/api/users/me", body),

  getPlatformUsers: (params?: { page?: number; limit?: number; search?: string; role?: string }, options?: any) => {
    const q = new URLSearchParams();
    if (params?.page != null) q.set("page", String(params.page));
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.search?.trim()) q.set("search", params.search.trim());
    if (params?.role?.trim()) q.set("role", params.role.trim());
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return ApiService.get<PlatformUsersListData>(`/api/users/platform/list${suffix}`, options);
  },

  patchPlatformUserRole: (id: string, role: string) =>
    ApiService.patch<ProfileUser>(`/api/users/platform/${id}/role`, { role }),

  patchPlatformUserStatus: (id: string, isActive: boolean) =>
    ApiService.patch<{ _id: string; isActive: boolean }>(`/api/users/platform/${id}/status`, { isActive }),

  postPlatformUserResetPassword: (id: string, password: string) =>
    ApiService.post<{ success: boolean; message: string }>(`/api/users/platform/${id}/reset-password`, { password }),

  deletePlatformUser: (id: string) =>
    ApiService.delete<{ success: boolean; message: string }>(`/api/users/platform/${id}`),
};

