/**
 * Frontend API layer for AI Voice Order Capture.
 * Mirrors the patterns in orders.ts, products.ts, etc.
 */
import ApiService from './apiService';

export interface VoiceOrderItem {
  spokenName: string;
  requestedQuantity: number;
  requestedUnit?: string | null;
  matchedProductId?: string | null;
  matchedProductName?: string | null;
  matchedProductPrice?: number | null;
  matchedProductStock?: number | null;
  matchedProductIsActive?: boolean | null;
  confidence: number;
  alternativeProductIds?: string[];
  notes?: string | null;
  manuallyOverridden?: boolean;
  requiresReview?: boolean;
  reviewWarning?: string | null;
  confirmationError?: string | null;
  quantityAmbiguous?: boolean;
}

export interface ExtractedCustomer {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface ExtractedFulfilment {
  type: 'delivery' | 'pickup' | 'unknown';
  address?: string | null;
  requestedDateTime?: string | null;
}

export interface ExtractedData {
  language: string;
  customer: ExtractedCustomer;
  fulfilment: ExtractedFulfilment;
  items: VoiceOrderItem[];
  orderNotes?: string | null;
  overallConfidence: number;
  warnings: string[];
}

export type VoiceOrderStatus =
  | 'uploaded'
  | 'transcribing'
  | 'transcribed'
  | 'transcription_failed'
  | 'extracting'
  | 'extracting_order'
  | 'needs_review'
  | 'ready_for_review'
  | 'draft'
  | 'confirmed'
  | 'order_created'
  | 'failed'
  | 'order_extraction_failed'
  | 'cancelled';

export interface VoiceOrder {
  _id: string;
  storeId: string | { _id: string; companyName?: string; shopName?: string };
  createdByUserId: string | { _id: string; name: string; email: string };
  audioStorageKey?: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  durationSeconds?: number | null;
  transcription: string;
  transcriptionLanguage: string;
  extractedData?: ExtractedData | null;
  resolvedItems?: VoiceOrderItem[];
  overallConfidence: number;
  status: VoiceOrderStatus;
  failureReason?: string | null;
  createdOrderId?: string | { _id: string; orderId: string; orderStatus: string; totalPrice: number } | null;
  confirmedAt?: string | null;
  draftData?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceOrderListResponse {
  success: boolean;
  data: VoiceOrder[];
  pagination: { total: number; page: number; limit: number; pages: number };
}

export interface VoiceOrderFilters {
  page?: number;
  limit?: number;
  status?: VoiceOrderStatus | '';
  storeId?: string;
  search?: string;
}

const PAGE_NAME = 'AI Voice Orders';

export const voiceOrdersApi = {
  /**
   * List voice orders (paginated, filtered).
   */
  list: (filters: VoiceOrderFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.page) params.set('page', String(filters.page));
    if (filters.limit) params.set('limit', String(filters.limit));
    if (filters.status) params.set('status', filters.status);
    if (filters.storeId) params.set('storeId', filters.storeId);
    if (filters.search) params.set('search', filters.search);
    const qs = params.toString();
    return ApiService.get<VoiceOrderListResponse>(`/api/voice-orders${qs ? `?${qs}` : ''}`, {
      pageName: PAGE_NAME,
    });
  },

  /**
   * Get a single voice order by ID.
   */
  getById: (id: string) =>
    ApiService.get<{ data: VoiceOrder }>(`/api/voice-orders/${id}`, { pageName: PAGE_NAME }),

  /**
   * Upload a recorded audio blob.
   * Uses FormData (multipart) — NOT JSON.
   */
  uploadAudio: (blob: Blob, mimeType: string, originalFileName: string, storeId?: string, durationSeconds?: number) => {
    const form = new FormData();
    form.append('audio', blob, originalFileName);
    if (storeId) form.append('storeId', storeId);
    if (durationSeconds != null) form.append('durationSeconds', String(durationSeconds));

    const token = localStorage.getItem('eco_shop_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    headers['x-client-domain'] = window.location.hostname;
    headers['x-client-origin'] = window.location.origin;
    // NOTE: Do NOT set Content-Type — browser sets it automatically with boundary for FormData

    const rawBase = (String(import.meta.env.VITE_API_BASE_URL ?? '').trim() || 'http://localhost:5000').replace(/\/+$/, '');
    const url = rawBase.endsWith('/api') ? `${rawBase}/voice-orders` : `${rawBase}/api/voice-orders`;

    return fetch(url, { method: 'POST', headers, body: form }).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || `Upload failed (${r.status})`);
      return data as { success: boolean; data: VoiceOrder };
    });
  },

  /**
   * Start/retry transcription.
   */
  transcribe: (id: string, language?: string) =>
    ApiService.post<{ data: VoiceOrder }>(`/api/voice-orders/${id}/transcribe`, { language }, { pageName: PAGE_NAME }),

  /**
   * Start/retry AI extraction.
   */
  extract: (id: string) =>
    ApiService.post<{ data: VoiceOrder }>(`/api/voice-orders/${id}/extract`, {}, { pageName: PAGE_NAME }),

  /**
   * Update the transcription text manually.
   */
  updateTranscription: (id: string, transcription: string) =>
    ApiService.patch<{ data: VoiceOrder }>(`/api/voice-orders/${id}/transcription`, { transcription }, {
      pageName: PAGE_NAME,
    }),

  /**
   * Save draft (items, customer info, etc.)
   */
  saveDraft: (id: string, payload: { transcription?: string; draftData?: Record<string, unknown>; resolvedItems?: VoiceOrderItem[] }) =>
    ApiService.patch<{ data: VoiceOrder }>(`/api/voice-orders/${id}/draft`, payload, { pageName: PAGE_NAME }),

  /**
   * Confirm and create the final order.
   */
  confirm: (id: string) =>
    ApiService.post<{ data: { voiceOrder: VoiceOrder; order: Record<string, unknown> } }>(
      `/api/voice-orders/${id}/confirm`,
      {},
      { pageName: PAGE_NAME }
    ),

  /**
   * Cancel a voice order.
   */
  cancel: (id: string) =>
    ApiService.patch<{ data: VoiceOrder }>(`/api/voice-orders/${id}/cancel`, {}, { pageName: PAGE_NAME }),

  /**
   * Permanently delete a voice order and its audio file.
   */
  delete: (id: string) =>
    ApiService.delete<{ success: boolean; message: string }>(`/api/voice-orders/${id}`, { pageName: PAGE_NAME }),

  /**
   * Build the audio stream URL for a voice order.
   * Used in <audio> src or a download link.
   */
  getAudioUrl: (id: string): string => {
    const token = localStorage.getItem('eco_shop_token');
    const rawBase = (String(import.meta.env.VITE_API_BASE_URL ?? '').trim() || 'http://localhost:5000').replace(/\/+$/, '');
    const base = rawBase.endsWith('/api') ? rawBase : `${rawBase}/api`;
    // Token is embedded as a query param so the browser's <audio> element can request it
    return `${base}/voice-orders/${id}/audio?t=${encodeURIComponent(token || '')}`;
  },
};

export default voiceOrdersApi;
