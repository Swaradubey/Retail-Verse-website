import ApiService from './apiService';

/**
 * Base URL for direct fetch calls in this file.
 * Uses VITE_API_BASE_URL — same env variable as apiService.ts.
 * Falls back to localhost for local development.
 * In production, VITE_API_BASE_URL must be set in Vercel env vars.
 */
const BASE_URL: string = (
  String(import.meta.env.VITE_API_BASE_URL ?? "").trim() || "http://localhost:5000"
).replace(/\/+$/, "");
console.log(`[OrdersAPI] Using Base URL: ${BASE_URL}`);

/** Same key as ApiService — send Bearer token on order creation so the backend can link orders to logged-in customers. */
const TOKEN_KEY = "eco_shop_token";

export interface OrderPayload {
  orderId: string;
  /** Idempotency: same offline queue id must not create duplicate Mongo orders */
  offlineOrderId?: string;
  /** Set when an offline POS order has been synced (optional; backend may store) */
  syncStatus?: string;
  /** Explicit POS flag; backend skips shipping requirements when true */
  isPos?: boolean;
  /** When set to "pos", backend applies in-store defaults for shipping if omitted */
  orderSource?: 'pos';
  /** Alias for orderSource; backend treats "pos" the same way */
  source?: 'pos';
  orderType?: 'pos';
  /** Same as orderSource for API compatibility */
  channel?: 'pos';
  items: Array<{
    productId: string;
    name: string;
    price: number;
    quantity: number;
    image: string;
  }>;

  shippingAddress?: {
    fullName: string;
    /** Optional; POS may send store-account email with shipping for admin customer linking */
    email?: string;
    /** Optional; stored when provided (e.g. POS COD) */
    phone?: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  paymentMethod: string;
  paymentDetails?: {
    cardName?: string;
    cardholderName?: string;
    cardLast4?: string;
    last4?: string;
    expiryDate?: string;
    upiId?: string;
  };
  totalPrice: number;
  /** Linked storefront account (POS); omit for walk-in — do not send null. */
  user?: string;
  /** Alias for `user` on POS payloads (same backend resolution). */
  customerId?: string;
  /** Guest / snapshot — used when no user id is stored; enables email-based attribution in admin. */
  customerEmail?: string;
  customerName?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
}

export interface RazorpayOrderResponse {
  success: boolean;
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
  message?: string;
}

export interface RazorpayVerifyPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  internal_order_id?: string;
  internal_quote_id?: string;
  /** New fields for Super Admin invoice flow */
  quotationId?: string;
  invoiceId?: string;
  orderId?: string;
}

interface OrderCreateResponse {
  success: boolean;
  message: string;
  data?: any;
}

export const createOrder = async (
  orderData: OrderPayload
): Promise<OrderCreateResponse> => {
  return ApiService.post<any>("/orders", orderData);
};

export const getOrderById = async (
  id: string
): Promise<{ success: boolean; data?: any; message?: string }> => {
  const raw = id != null ? String(id).trim() : "";
  if (!raw) {
    throw new Error("Order id is required");
  }
  return ApiService.get(`/orders/${encodeURIComponent(raw)}`);
};

/** Logged-in customer: all orders with enriched tracking (Bearer token via ApiService). */
export async function getMyOrdersTracking(): Promise<{
  success: boolean;
  count?: number;
  data?: any[];
}> {
  return ApiService.get('/orders/my-tracking');
}

/** Logged-in customer: one order by business order id, tracking id, AWB, Shiprocket ids, or Mongo id. */
export async function getOrderTrackingByIdentifier(identifier: string): Promise<{
  success: boolean;
  data?: any;
  message?: string;
}> {
  const q = encodeURIComponent(identifier.trim());
  return ApiService.get(`/orders/track?query=${q}`);
}

/** Admin only: advance order tracking one stage (Confirmed → … → Delivered). */
export async function patchOrderTrackingStatus(
  orderId: string,
  body: { trackingStatus: string; estimatedDelivery?: string | null }
): Promise<{
  success: boolean;
  message?: string;
  data?: any;
}> {
  const id = encodeURIComponent(orderId.trim());
  return ApiService.patch(`/orders/${id}/tracking-status`, body);
}

/** Customer (or admin): cancel order before shipment. */
export async function cancelOrder(
  orderId: string,
  body?: { cancellationReason?: string }
): Promise<{
  success: boolean;
  message?: string;
  data?: any;
}> {
  const id = encodeURIComponent(orderId.trim());
  return ApiService.patch(`/orders/${id}/cancel`, body ?? {});
}

export async function deleteOrder(
  id: string
): Promise<{
  success: boolean;
  message?: string;
}> {
  const encId = encodeURIComponent(id.trim());
  return ApiService.delete(`/orders/${encId}`);
}

/** Dashboard overview: latest orders (newest first), same auth as GET /orders. */
export interface LatestTransactionRow {
  id: string;
  orderId: string;
  customerName: string;
  customerEmail: string | null;
  totalPrice: number;
  orderStatus: string;
  trackingStatus?: string | null;
  createdAt: string;
  orderSource?: string | null;
  isDelivered?: boolean;
}

export async function fetchLatestTransactions(params?: {
  limit?: number;
}): Promise<{ success: boolean; count?: number; data?: LatestTransactionRow[]; message?: string }> {
  const limit = params?.limit != null && params.limit > 0 ? Math.min(50, params.limit) : undefined;
  const q = limit != null ? `?limit=${limit}` : '';

  return ApiService.get<LatestTransactionRow[]>(
    `/orders/dashboard/latest-transactions${q}`
  );
}

/** Logged-in storefront user: overview KPIs for `/dashboard` (active pipeline + website delivery rate). */
export interface UserDashboardOverviewData {
  activeOrders: number;
  /** All persisted orders for the logged-in user (same `user` ref as other dashboard KPIs). */
  totalOrders: number;
  conversionRate: number;
  conversionRateChange: number;
}

export async function fetchUserDashboardOverview(): Promise<UserDashboardOverviewData> {
  const res = await ApiService.get<UserDashboardOverviewData>('/orders/me/dashboard-overview');
  if (!res.success || res.data == null) {
    throw new Error(res.message || 'Failed to load overview');
  }
  return res.data as UserDashboardOverviewData;
}

/** Log an order tracking event to the backend. */
export async function logOrderTracking(payload: {
  orderId?: string;
  trackingId?: string;
  searchedValue?: string;
  source: string;
}): Promise<{
  success: boolean;
  data?: any;
  message?: string;
}> {
  return ApiService.post('/track-orders/log', payload);
}

export const createRazorpayOrder = async (
  amount: number,
  meta?: { quotationId?: string; invoiceId?: string }
): Promise<RazorpayOrderResponse> => {
  return ApiService.post('/razorpay/create-order', { amount, ...meta });
};

export const verifyRazorpayPayment = async (
  payload: RazorpayVerifyPayload
): Promise<{ success: boolean; message: string }> => {
  return ApiService.post('/razorpay/verify-payment', payload);
};
