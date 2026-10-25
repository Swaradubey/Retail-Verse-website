import ApiService from './apiService';

export interface Banner {
  _id: string;
  title: string;
  badgeText: string;
  headline: string;
  subheadline: string;
  imageUrl: string;
  mobileImageUrl?: string;
  ctaText: string;
  ctaLink: string;
  backgroundColor: string;
  textColor: string;
  placement: 'HOME_HERO' | 'CATEGORY_TOP' | 'PROMO_STRIP';
  order: number;
  isActive: boolean;
  startDate?: string | null;
  endDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface BannerResponse<T> {
  success: boolean;
  message?: string;
  count?: number;
  data: T;
}

export const bannersApi = {
  /** Fetch active storefront banners */
  getActive: async (placement: string = 'HOME_HERO'): Promise<BannerResponse<Banner[]>> => {
    return ApiService.get<BannerResponse<Banner[]>>(`/api/banners/active?placement=${encodeURIComponent(placement)}`, {
      pageName: 'Storefront Banners',
    });
  },

  /** Fetch all banners for admin dashboards */
  getAllAdmin: async (): Promise<BannerResponse<Banner[]>> => {
    return ApiService.get<BannerResponse<Banner[]>>('/api/banners/admin', {
      pageName: 'Admin Banner Settings',
    });
  },

  /** Create banner with JSON or FormData */
  create: async (data: FormData | Partial<Banner>): Promise<BannerResponse<Banner>> => {
    return ApiService.post<BannerResponse<Banner>>('/api/banners', data, {
      pageName: 'Create Banner',
    });
  },

  /** Update banner with JSON or FormData */
  update: async (id: string, data: FormData | Partial<Banner>): Promise<BannerResponse<Banner>> => {
    return ApiService.put<BannerResponse<Banner>>(`/api/banners/${id}`, data, {
      pageName: 'Update Banner',
    });
  },

  /** Batch reorder banners */
  reorder: async (items: { id: string; order: number }[]): Promise<BannerResponse<any>> => {
    return ApiService.patch<BannerResponse<any>>('/api/banners/reorder', { items }, {
      pageName: 'Reorder Banners',
    });
  },

  /** Delete banner by id */
  delete: async (id: string): Promise<BannerResponse<{ message: string; deletedId: string }>> => {
    return ApiService.delete<BannerResponse<{ message: string; deletedId: string }>>(`/api/banners/${id}`, {
      pageName: 'Delete Banner',
    });
  },
};
