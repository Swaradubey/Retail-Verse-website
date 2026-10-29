import ApiService from './apiService';

export type EmployeeRow = {
  _id: string;
  name: string;
  email?: string;
  phone: string;
  address: string;
  role: string;
  clientId: string;
  managerId?: string | null;
  shopName?: string;
  status?: string;
  createdBy?: string;
  userId?: string | null;
  vendorRef?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateEmployeePayload = {
  name: string;
  email: string;
  password: string;
  phone: string;
  address?: string;
  clientId?: string;
  managerId?: string;
  shopName?: string;
  vendorRef?: string | null;
  role?: 'user' | 'seo_manager' | 'store_manager' | 'counter_manager' | 'inventory_manager' | 'employee' | 'staff' | 'VENDOR' | 'vendor' | string;
};

export const employeesApi = {
  create: (body: CreateEmployeePayload, options?: any) =>
    ApiService.post<EmployeeRow>('/api/employees', body, options),

  listByClient: (clientId: string, roles?: string[], options?: any) => {
    const q =
      roles && roles.length > 0
        ? `?roles=${encodeURIComponent(roles.join(','))}`
        : '';
    return ApiService.get<EmployeeRow[]>(
      `/api/employees/client/${encodeURIComponent(clientId)}${q}`,
      options
    );
  },

  list: (clientId?: string, roles?: string[], options?: any) => {
    const params = new URLSearchParams();
    if (clientId) params.set('clientId', clientId);
    if (roles && roles.length > 0) params.set('roles', roles.join(','));
    const q = params.toString();
    return ApiService.get<EmployeeRow[]>(`/api/employees${q ? `?${q}` : ''}`, options);
  },

  get: (id: string) =>
    ApiService.get<EmployeeRow>(`/api/employees/${encodeURIComponent(id)}`),

  update: (
    id: string,
    body: Partial<
      Pick<EmployeeRow, 'name' | 'phone' | 'address' | 'shopName' | 'status' | 'managerId'>
    >
  ) => ApiService.put<EmployeeRow>(`/api/employees/${encodeURIComponent(id)}`, body),

  remove: (id: string) => ApiService.delete(`/api/employees/${encodeURIComponent(id)}`),
};

/** @deprecated Use EmployeeRow — kept for any stale imports */
export type Employee = EmployeeRow;
