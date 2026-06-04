import ApiService from "./apiService";

export const authApi = {
  login: async (payload: any) => {
    return ApiService.post<any>("/api/auth/login", payload);
  },

  superAdminLogin: async (payload: { email: string; password: string }) => {
    return ApiService.post<any>("/api/auth/super-admin/login", payload);
  },
  
  register: async (payload: any) => {
    return ApiService.post<any>("/api/auth/register", payload);
  },

  getCaptcha: async () => {
    return ApiService.get<any>("/api/auth/captcha");
  },

  logAdminLogin: async (payload: { email: string; role: string; message?: string }) => {
    return ApiService.post<any>("/api/admin-login/log", payload);
  },

  forgotPassword: async (email: string) => {
    return ApiService.post<any>("/api/auth/forgot-password", { email });
  },

  resetPassword: async (token: string, password: string) => {
    return ApiService.post<any>(`/api/auth/reset-password/${token}`, { password });
  },
};
