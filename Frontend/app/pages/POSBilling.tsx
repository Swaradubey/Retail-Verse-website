import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Barcode,
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Printer,
  CreditCard,
  Banknote,
  Smartphone,
  Sparkles,
  ArrowRight,
  Package,
  Layers,
  X,
  ExternalLink,
  Tag,
  Percent,
  Zap,
  Mail,
  Loader2,
  MessageSquareCode,
  RefreshCw,
  PauseCircle,
  PlayCircle,
  Clock,
  Wifi,
  WifiOff,
  FolderOpen,
  User,
  Phone,
  MapPin,
  ChevronDown,
  ChevronUp,
  Camera,
  ScanBarcode,
} from 'lucide-react';
import api from '../api/apiService';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { formatINR } from '../utils/formatINR';
import { getProductImageUrl, getFullImageUrl, PRODUCT_PLACEHOLDER } from '../utils/imageUrl';
import { POSCameraScannerModal } from '../components/pos/POSCameraScannerModal';
import {
  HeldOrder,
  OfflineOrder,
  saveHeldOrder,
  getHeldOrders,
  deleteHeldOrder,
  saveOfflineOrder,
  getPendingOfflineOrders,
  cacheProducts,
  getCachedProducts,
  findCachedProductByBarcode,
  clearCachedProducts,
  extractProductClientId,
  saveActiveCartDraft,
  getActiveCartDraft,
  clearActiveCartDraft,
  syncOfflineAndHeldOrders,
  markHeldOrderSynced,
} from '../services/posIndexedDB';
import {
  getPosProductsLocalStorage,
  haveProductsChanged,
  savePosProductsCache,
  loadPosProductsCache,
} from '../lib/posProductCache';
import { subscribeToProductSync } from '../utils/posProductSync';

// Audio feedback helper for POS barcode scan beep
function playScanSound(type: 'success' | 'error' = 'success') {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      // Pleasant high-pitch beep typical of physical POS scanners
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, ctx.currentTime); // A6
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } else {
      // Low error buzz
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime); // A3
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch (e) {
    // Audio context might be restricted before first gesture; silently ignore
  }
}

// Single source of truth stock calculator: checks stockLevel, stock, quantity, and currentStock
export function getProductAvailableStock(product: any): number {
  if (!product) return 0;
  const rawStockLevel = Number(product.stockLevel);
  const rawStock = Number(product.stock);
  const rawQty = Number(product.quantity);
  const rawCurrentStock = Number(product.currentStock);

  // If any field has positive stock, use the maximum positive stock available
  const positiveStockValues = [rawStockLevel, rawStock, rawQty, rawCurrentStock].filter(
    (v) => !isNaN(v) && v > 0
  );
  if (positiveStockValues.length > 0) {
    return Math.max(...positiveStockValues);
  }

  // Otherwise pick highest numeric value (or 0)
  const validValues = [rawStockLevel, rawStock, rawQty, rawCurrentStock].filter(
    (v) => !isNaN(v)
  );
  return validValues.length > 0 ? Math.max(...validValues) : 0;
}

// Dynamically load Razorpay SDK if not already loaded
function loadRazorpaySDK(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && (window as any).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

// Luhn Algorithm validation for credit/debit card numbers
function luhnCheck(numStr: string): boolean {
  const digits = numStr.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

// Auto-detect card brand / network from digits
function detectCardBrand(digits: string): string {
  const clean = digits.replace(/\D/g, '');
  if (/^4/.test(clean)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(clean)) return 'Mastercard';
  if (/^3[47]/.test(clean)) return 'Amex';
  if (/^(60|65|81|82|508)/.test(clean)) return 'RuPay';
  if (/^(30[0-5]|36|38)/.test(clean)) return 'Diners Club';
  if (/^(6011|65)/.test(clean)) return 'Discover';
  return 'Card';
}

// Validate card expiry date (MM/YY)
function validateCardExpiryDate(expiry: string): { valid: boolean; error?: string } {
  const clean = expiry.replace(/\D/g, '');
  if (clean.length !== 4) {
    return { valid: false, error: 'Enter expiry as MM/YY' };
  }
  const month = parseInt(clean.substring(0, 2), 10);
  const year = parseInt('20' + clean.substring(2, 4), 10);
  if (month < 1 || month > 12) {
    return { valid: false, error: 'Expiry month must be between 01 and 12' };
  }
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  if (year < curYear || (year === curYear && month < curMonth)) {
    return { valid: false, error: 'Card has expired' };
  }
  if (year > curYear + 25) {
    return { valid: false, error: 'Invalid expiry year' };
  }
  return { valid: true };
}

export interface POSCartItem {
  productId: string;
  barcode: string;
  name: string;
  unitPrice: number;
  quantity: number;
  gstRate: number;
  stockLevel: number;
  imageUrl?: string;
  image?: string;
  product_image?: string;
  category?: string;
}

export function POSBilling() {
  const { user } = useAuth();

  // Resolve authenticated client ID with strict priority
  const currentClientId = useMemo(() => {
    return (
      user?.clientId ||
      (user as any)?.assignedClient ||
      (user as any)?.linkedClientId ||
      user?.storeId ||
      (user?.role === 'client' ? (user.id || (user as any)._id) : '') ||
      (typeof window !== 'undefined'
        ? localStorage.getItem('retail_verse_client_id') ||
          localStorage.getItem('selectedClientId') ||
          ''
        : '')
    )?.toString().trim() || '';
  }, [user]);

  const currentClientIdRef = useRef(currentClientId);
  useEffect(() => {
    currentClientIdRef.current = currentClientId;
  }, [currentClientId]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [cart, setCart] = useState<POSCartItem[]>([]);
  const [products, setProducts] = useState<any[]>(() => {
    try {
      const cached = localStorage.getItem('pos_products_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Fallback
    }
    return getPosProductsLocalStorage(currentClientId);
  });
  const [isLoadingProducts, setIsLoadingProducts] = useState<boolean>(() => {
    try {
      const cached = localStorage.getItem('pos_products_cache');
      if (cached && JSON.parse(cached).length > 0) return false;
    } catch {
      // Fallback
    }
    const initial = getPosProductsLocalStorage(currentClientId);
    return !initial || initial.length === 0;
  });
  const loading = isLoadingProducts;
  const setLoading = setIsLoadingProducts;
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'UPI' | 'CARD' | 'RAZORPAY' | 'WHATSAPP'>('CASH');
  const [upiId, setUpiId] = useState('');
  const [upiError, setUpiError] = useState<string | null>(null);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [whatsappError, setWhatsappError] = useState<string | null>(null);

  // Dedicated Card Payment Details State
  const [cardHolderName, setCardHolderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardErrors, setCardErrors] = useState<{
    cardHolderName?: string;
    cardNumber?: string;
    cardExpiry?: string;
    cardCvv?: string;
  }>({});

  // Camera Barcode Scanner Modal State
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);

  // Customer Details Form State (Optional for Walk-in, Bound to Checkout & Orders)
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerPhoneError, setCustomerPhoneError] = useState<string | null>(null);
  const [isCustomerFormExpanded, setIsCustomerFormExpanded] = useState(true);

  // WhatsApp Pending Payment state (holds order while awaiting customer payment)
  const [pendingWhatsAppPayment, setPendingWhatsAppPayment] = useState<{
    orderId: string;
    invoiceNumber: string;
    grandTotal: number;
    paymentLinkId: string;
    paymentLinkUrl: string;
    whatsappUrl: string;
    whatsappPhone: string;
    customerName: string;
    orderDoc: any;
  } | null>(null);
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const [isCancellingPayment, setIsCancellingPayment] = useState(false);

  // Coupon state: ₹1,000 Off on min ₹3,000 subtotal
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discount: number;
    minSubtotal: number;
  } | null>(null);
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Completed order receipt modal state
  const [completedOrder, setCompletedOrder] = useState<any | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [customerEmailInput, setCustomerEmailInput] = useState('');

  // High-value order discount modal state (billAmount > 3000)
  const [showHighValueModal, setShowHighValueModal] = useState(false);
  const [hasDismissedHighValueModal, setHasDismissedHighValueModal] = useState(false);

  // ── Offline-First & Network State ─────────────────────────────────────────
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  // ── Held / Parked Orders (Multi-Cart) State ──────────────────────────────
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]);
  const [isLoadingHeldOrders, setIsLoadingHeldOrders] = useState(false);
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [holdReferenceInput, setHoldReferenceInput] = useState('');
  const [showHeldListModal, setShowHeldListModal] = useState(false);
  const [selectedHeldOrderToResume, setSelectedHeldOrderToResume] = useState<HeldOrder | null>(null);
  const [showCartOverwriteConfirm, setShowCartOverwriteConfirm] = useState(false);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const couponInputRef = useRef<HTMLInputElement | null>(null);

  // Keep fresh ref to products and cart for synchronous global scanner listener
  const productsRef = useRef<any[]>(products);
  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  const cartRef = useRef<POSCartItem[]>([]);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  // Load all held orders from local IndexedDB and merge remote held orders
  const loadHeldOrders = useCallback(async () => {
    setIsLoadingHeldOrders(true);
    const clientId = currentClientIdRef.current;
    try {
      const localList = await getHeldOrders(clientId);
      setHeldOrders(localList);

      if (navigator.onLine) {
        try {
          const query = clientId ? `?clientId=${encodeURIComponent(clientId)}` : '';
          const res = await api.get(`/pos/orders/held${query}`);
          if (res.success && Array.isArray(res.orders)) {
            // Background sync handles merging to IndexedDB
            const merged = await getHeldOrders(clientId);
            setHeldOrders(merged);
          }
        } catch (e) {}
      }
    } catch (err) {
      console.warn('[loadHeldOrders] Error:', err);
    } finally {
      setIsLoadingHeldOrders(false);
    }
  }, []);

  // Update pending sync items count (unsynced held orders + offline completed orders)
  const refreshPendingSyncCount = useCallback(async () => {
    try {
      const clientId = currentClientIdRef.current;
      const [pendingOffline, localHeld] = await Promise.all([
        getPendingOfflineOrders(clientId),
        getHeldOrders(clientId),
      ]);
      const unsyncedHeld = localHeld.filter((h) => !h.isSynced);
      setPendingSyncCount(pendingOffline.length + unsyncedHeld.length);
    } catch (err) {}
  }, []);

  // Background Sync Engine: Triggers on connection return or manual click
  const triggerBackgroundSync = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.warning('Cannot sync while offline. Waiting for network connection.');
      return;
    }
    setIsSyncing(true);
    const clientId = currentClientIdRef.current;
    try {
      const res = await syncOfflineAndHeldOrders(api, clientId);
      if (res.syncedOfflineCount > 0 || res.syncedHeldCount > 0) {
        toast.success(
          `Background Sync Complete! Synced ${res.syncedOfflineCount} offline order(s) and ${res.syncedHeldCount} held cart(s).`
        );
      }
      await loadHeldOrders();
      await refreshPendingSyncCount();
    } catch (err) {
      console.warn('[triggerBackgroundSync] Error:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [loadHeldOrders, refreshPendingSyncCount]);

  // Fetch product catalog for manual search & grid (Offline-First Stale-While-Revalidate)
  const fetchProducts = useCallback(async (silent = false) => {
    const clientId = currentClientIdRef.current;
    const hasCachedData = productsRef.current.length > 0;

    // Show loading spinner ONLY on the very first visit when no cache exists at all
    if (!silent && !hasCachedData) {
      setIsLoadingProducts(true);
    }

    try {
      if (navigator.onLine) {
        const queryParams = new URLSearchParams({
          limit: '250',
          pos: 'true',
          fields: '_id,name,title,sku,barcode,price,unitPrice,stock,stockLevel,quantity,currentStock,lowStockAlert,category,image,imageUrl,clientId,clientName,gst,gstRate'
        });
        if (clientId) {
          queryParams.append('clientId', clientId);
        }
        const res = await api.get(`/products?${queryParams.toString()}`);
        const list = res.products || res.data || [];

        if (Array.isArray(list)) {
          // Strictly filter products to match the currently logged-in Client's identifier
          const scopedProducts = clientId
            ? list.filter((item: any) => {
                const itemClientId = extractProductClientId(item);
                // Allow if matches clientId or if item has no client attribute while loaded from scoped endpoint
                return !itemClientId || itemClientId === clientId;
              })
            : list;

          // Always sync with localStorage pos_products_cache immediately
          try {
            localStorage.setItem('pos_products_cache', JSON.stringify(scopedProducts));
          } catch {
            // ignore storage quota errors
          }

          // Stale-While-Revalidate: smoothly update state and cache ONLY if there are differences
          const hasChanges = haveProductsChanged(productsRef.current, scopedProducts);
          if (hasChanges || productsRef.current.length === 0) {
            setProducts(scopedProducts);
            // Overwrite/update the local cache specifically for this authenticated client
            if (scopedProducts.length > 0) {
              await cacheProducts(scopedProducts, clientId);
              await savePosProductsCache(scopedProducts, clientId);
            } else if (clientId) {
              // Clear stale cache if client has 0 inventory
              await clearCachedProducts(clientId);
            }
          }
          return;
        }
      }

      // Offline fallback: load cached products from IndexedDB strictly for this client
      const cached = await getCachedProducts(clientId);
      if (cached && cached.length > 0) {
        if (haveProductsChanged(productsRef.current, cached)) {
          setProducts(cached);
          try {
            localStorage.setItem('pos_products_cache', JSON.stringify(cached));
          } catch {}
        }
      } else {
        // Fallback to localStorage pos_products_cache if IndexedDB is empty
        try {
          const lsRaw = localStorage.getItem('pos_products_cache');
          if (lsRaw) {
            const parsed = JSON.parse(lsRaw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setProducts(parsed);
              return;
            }
          }
        } catch {}

        if (!hasCachedData) {
          setProducts([]);
          if (!silent) {
            toast.info(
              clientId
                ? 'No offline products cached for your store yet. Please connect online once to sync inventory.'
                : 'POS is in offline mode. No local products found.'
            );
          }
        }
      }
    } catch (err) {
      // Network failure fallback: load cached products strictly for this client or localStorage
      try {
        const cached = await getCachedProducts(clientId);
        if (cached && cached.length > 0) {
          if (haveProductsChanged(productsRef.current, cached)) {
            setProducts(cached);
            localStorage.setItem('pos_products_cache', JSON.stringify(cached));
          }
        } else {
          const lsRaw = localStorage.getItem('pos_products_cache');
          if (lsRaw) {
            const parsed = JSON.parse(lsRaw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setProducts(parsed);
            }
          } else if (!hasCachedData) {
            setProducts([]);
          }
        }
      } catch {
        if (!hasCachedData) {
          setProducts([]);
        }
      }
      if (!silent) console.error('Failed to load products:', err);
    } finally {
      setIsLoadingProducts(false);
    }
  }, []);

  // Network online/offline event listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Online mode restored. Cloud sync active.');
      triggerBackgroundSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('Offline mode activated. Cash checkout, barcode scanning & held carts remain fully active.');
    };

    const handleFocus = () => {
      if (navigator.onLine) {
        fetchProducts(true);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleFocus);
    };
  }, [triggerBackgroundSync, fetchProducts]);

  // Immediate IndexedDB cache hydration on mount to ensure zero waiting time even if localStorage was empty
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const idbProducts = await getCachedProducts(currentClientId);
        if (active && Array.isArray(idbProducts) && idbProducts.length > 0) {
          setProducts((prev) => {
            if (prev.length === 0) {
              setIsLoadingProducts(false);
              return idbProducts;
            }
            return prev;
          });
        }
      } catch (e) {
        console.warn('[POSBilling] IndexedDB cache hydration error:', e);
      }
    })();
    return () => {
      active = false;
    };
  }, [currentClientId]);

  // 1. Initial product catalog fetch, draft restore, and held orders load on mount / client change
  useEffect(() => {
    const clientId = currentClientId;
    // Silent background revalidation: renders instant cache, updates silently if changes occur
    fetchProducts(true);
    loadHeldOrders();
    refreshPendingSyncCount();

    // Restore active cart draft for this specific client if current cart is empty
    (async () => {
      try {
        const draft = await getActiveCartDraft(clientId);
        if (draft && Array.isArray(draft.cart) && draft.cart.length > 0 && cartRef.current.length === 0) {
          setCart(draft.cart);
          if (draft.appliedCoupon) setAppliedCoupon(draft.appliedCoupon);
        }
      } catch (e) {}
    })();

    // Initial background sync if online
    if (navigator.onLine) {
      triggerBackgroundSync();
    }
  }, [currentClientId, fetchProducts, loadHeldOrders, refreshPendingSyncCount, triggerBackgroundSync]);

  // Real-time synchronization: listen for new inventory products and immediately render in POS catalog
  useEffect(() => {
    const unsubscribe = subscribeToProductSync((newProduct, incomingClientId) => {
      if (!newProduct) return;

      const pId = String(newProduct._id || newProduct.id || newProduct.productId || '');
      const rawPrice = Number(newProduct.unitPrice !== undefined ? newProduct.unitPrice : newProduct.price) || 0;
      const rawStock = Number(newProduct.stockLevel ?? newProduct.stock ?? newProduct.quantity ?? newProduct.currentStock ?? 0);
      const rawBarcode = String(newProduct.barcode || '').trim();
      const rawSku = String(newProduct.sku || '').trim();
      const rawName = String(newProduct.name || 'New Product').trim();
      const rawImg = newProduct.imageUrl || newProduct.image || '';

      const normalizedProduct = {
        _id: pId,
        productId: pId,
        id: pId,
        name: rawName,
        barcode: rawBarcode,
        sku: rawSku,
        price: rawPrice,
        unitPrice: rawPrice,
        stock: rawStock,
        stockLevel: rawStock,
        quantity: rawStock,
        currentStock: rawStock,
        category: newProduct.category || 'General',
        imageUrl: rawImg,
        gst: Number(newProduct.gst !== undefined ? newProduct.gst : (newProduct.gstRate || 0)),
        gstRate: Number(newProduct.gst !== undefined ? newProduct.gst : (newProduct.gstRate || 0)),
        clientId: incomingClientId || currentClientIdRef.current,
      };

      setProducts((prev) => {
        const normId = pId;
        const normBarcode = rawBarcode.toLowerCase();
        const normSku = rawSku.toLowerCase();

        const existsIdx = prev.findIndex((p: any) => {
          const itemPId = String(p._id || p.id || p.productId || '');
          const itemBarcode = String(p.barcode || '').trim().toLowerCase();
          const itemSku = String(p.sku || '').trim().toLowerCase();
          return (
            (normId && itemPId && normId === itemPId) ||
            (normBarcode && itemBarcode && normBarcode === itemBarcode) ||
            (normSku && itemSku && normSku === itemSku)
          );
        });

        let nextList: any[];
        if (existsIdx >= 0) {
          nextList = [...prev];
          nextList[existsIdx] = { ...nextList[existsIdx], ...normalizedProduct };
        } else {
          // Prepend new item directly so POS grid renders it instantly without refetching
          nextList = [normalizedProduct, ...prev];
        }
        void cacheProducts(nextList, currentClientIdRef.current);
        void savePosProductsCache(nextList, currentClientIdRef.current);
        return nextList;
      });

      toast.success(`"${rawName}" added to POS catalog instantly`);
    }, currentClientId);

    return () => {
      unsubscribe();
    };
  }, [currentClientId]);

  // Auto-persist active cart draft in IndexedDB scoped to this client
  useEffect(() => {
    if (cart.length > 0) {
      saveActiveCartDraft(cart, appliedCoupon, undefined, currentClientId);
    }
  }, [cart, appliedCoupon, currentClientId]);

  // ── Hold / Park Current Order Handler ──────────────────────────────────────
  const handleHoldCurrentOrder = async () => {
    if (cart.length === 0) {
      toast.error('Cart is empty. Add items before holding.');
      return;
    }

    const timestampSlice = Date.now().toString().slice(-4);
    const effectiveCustomerName = customerName.trim() || 'Walk-in Customer';
    const effectiveCustomerPhone = (customerPhone.trim() || whatsappPhone.trim() || '').replace(/\D/g, '');
    const effectiveCustomerAddress = customerAddress.trim();

    const defaultRef = customerName.trim() ? `${customerName.trim()} (#${timestampSlice})` : `HOLD-#${timestampSlice}`;
    const reference = holdReferenceInput.trim() || defaultRef;

    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const rand4 = Math.floor(1000 + Math.random() * 9000);
    const holdId = `HOLD-${yy}${mm}${dd}-${rand4}`;

    const heldOrderPayload: HeldOrder = {
      id: holdId,
      clientId: currentClientIdRef.current,
      reference,
      items: cart.map((item) => {
        const itemGst = Number(item.gst !== undefined ? item.gst : (item.gstRate || 0)) || 0;
        const lineTax = (item.unitPrice * item.quantity * itemGst) / 100;
        return {
          ...item,
          price: item.unitPrice,
          gst: itemGst,
          gstRate: itemGst,
          tax: lineTax,
          gstAmount: lineTax,
        };
      }),
      subtotal: calculations.subtotal,
      discountAmount: calculations.discount,
      totalGst: calculations.totalGst,
      grandTotal: calculations.grandTotal,
      totalAmount: calculations.grandTotal,
      appliedCoupon: appliedCoupon ? { ...appliedCoupon } : null,
      customerName: effectiveCustomerName,
      customerPhone: effectiveCustomerPhone || undefined,
      ...(effectiveCustomerAddress ? { customerAddress: effectiveCustomerAddress } : {}),
      status: 'HELD',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isSynced: false,
    };

    // 1. Save locally to IndexedDB store 'held_orders' scoped by client
    await saveHeldOrder(heldOrderPayload, currentClientIdRef.current);

    // 2. Push background sync to backend if online
    if (navigator.onLine) {
      try {
        const res = await api.post('/pos/orders/hold', {
          ...heldOrderPayload,
          clientId: currentClientIdRef.current || undefined,
          offlineOrderId: holdId,
        });
        if (res && (res.success || res.order)) {
          const sId = res.order?._id || res.order?.orderId || holdId;
          await markHeldOrderSynced(holdId, sId);
          heldOrderPayload.isSynced = true;
          heldOrderPayload.serverOrderId = sId;
        }
      } catch (err) {
        console.warn('[handleHoldCurrentOrder] Backend sync queued for reconnect:', err);
      }
    }

    // 3. Reset active cart immediately so cashier can bill next customer without delay
    setCart([]);
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponError(null);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setHoldReferenceInput('');
    setShowHoldModal(false);
    await clearActiveCartDraft(currentClientIdRef.current);

    // 4. Update held orders state & counter
    await loadHeldOrders();
    await refreshPendingSyncCount();

    playScanSound('success');
    toast.success(`Order parked as "${reference}". Active cart ready for next customer.`);
  };

  // ── Resume / Recall Held Order Handler ─────────────────────────────────────
  const handleResumeHeldOrder = async (heldOrder: HeldOrder, forceOverwrite = false) => {
    // If active cart currently has items and cashier hasn't confirmed overwrite
    if (cart.length > 0 && !forceOverwrite) {
      setSelectedHeldOrderToResume(heldOrder);
      setShowCartOverwriteConfirm(true);
      return;
    }

    // Restore exact snapshot back into active cart
    setCart(heldOrder.items || []);
    if (heldOrder.appliedCoupon) {
      setAppliedCoupon(heldOrder.appliedCoupon);
    } else {
      setAppliedCoupon(null);
    }

    // Restore customer details if present in held order
    if (heldOrder.customerName && heldOrder.customerName !== 'Walk-in Customer') {
      setCustomerName(heldOrder.customerName);
    } else {
      setCustomerName('');
    }
    if (heldOrder.customerPhone) {
      setCustomerPhone(heldOrder.customerPhone);
      setWhatsappPhone(heldOrder.customerPhone);
    } else {
      setCustomerPhone('');
      setWhatsappPhone('');
    }
    if ((heldOrder as any).customerAddress) {
      setCustomerAddress((heldOrder as any).customerAddress);
    } else {
      setCustomerAddress('');
    }

    // Remove from IndexedDB store 'held_orders'
    await deleteHeldOrder(heldOrder.id);

    // Archive / free held status on backend if online
    if (navigator.onLine) {
      const remoteId = heldOrder.serverOrderId || heldOrder.id;
      try {
        await api.patch(`/pos/orders/held/${remoteId}/resume`).catch(async () => {
          await api.delete(`/pos/orders/held/${remoteId}`);
        });
      } catch (err) {
        console.warn('Backend archive held order error:', err);
      }
    }

    // Update active cart draft in IndexedDB scoped to this client
    await saveActiveCartDraft(heldOrder.items || [], heldOrder.appliedCoupon || null, undefined, currentClientIdRef.current);

    // Refresh held orders list & sync counts
    await loadHeldOrders();
    await refreshPendingSyncCount();

    setSelectedHeldOrderToResume(null);
    setShowCartOverwriteConfirm(false);
    setShowHeldListModal(false);

    playScanSound('success');
    toast.success(`Recalled order "${heldOrder.reference}" (${heldOrder.items.length} items)`);
  };

  // ── Delete / Discard Held Order Handler ────────────────────────────────────
  const handleDeleteHeldOrder = async (heldOrder: HeldOrder) => {
    await deleteHeldOrder(heldOrder.id);
    if (navigator.onLine) {
      const remoteId = heldOrder.serverOrderId || heldOrder.id;
      try {
        await api.delete(`/pos/orders/held/${remoteId}`).catch(async () => {
          await api.patch(`/pos/orders/held/${remoteId}/resume`);
        });
      } catch (err) {}
    }
    await loadHeldOrders();
    await refreshPendingSyncCount();
    toast.info(`Held order "${heldOrder.reference}" removed.`);
  };

  // Live auto-polling for WhatsApp payment completion
  useEffect(() => {
    if (!pendingWhatsAppPayment) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const res: any = await api.post('/pos/check-payment-status', {
          orderId: pendingWhatsAppPayment.orderId,
          invoiceNumber: pendingWhatsAppPayment.invoiceNumber,
          paymentLinkId: pendingWhatsAppPayment.paymentLinkId,
        });

        if (isMounted && res && (res.isPaid || res.paymentStatus === 'PAID')) {
          clearInterval(interval);
          playScanSound('success');
          toast.success(
            `Payment Received! Generating Invoice: ${res.order?.invoiceNumber || pendingWhatsAppPayment.invoiceNumber}`
          );
          const finalOrder = res.order || pendingWhatsAppPayment.orderDoc || pendingWhatsAppPayment;
          finalOrder.paymentStatus = 'PAID';
          finalOrder.isPaid = true;
          setCompletedOrder(finalOrder);
          setPendingWhatsAppPayment(null);
          setUpiId('');
          setWhatsappPhone('');
          fetchProducts(true);
        }
      } catch (err) {
        // Background polling errors ignored
      }
    }, 3500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [pendingWhatsAppPayment, fetchProducts]);

  // 2. Auto-Sync Inventory Products (Without Socket.io):
  //    - Window focus auto-refetch (cashier switching back from Inventory tab)
  //    - Short background polling fallback (every 7 seconds)
  //    - In-app custom event listener for instant updates
  useEffect(() => {
    const handleFocus = () => {
      fetchProducts(true);
    };

    const handleProductUpdated = (e: any) => {
      const prod = e.detail?.product;
      if (prod) {
        const rawStock =
          prod.stockLevel !== undefined && Number(prod.stockLevel) > 0
            ? prod.stockLevel
            : prod.stock !== undefined && Number(prod.stock) > 0
            ? prod.stock
            : prod.currentStock !== undefined && Number(prod.currentStock) > 0
            ? prod.currentStock
            : prod.stockLevel ?? prod.stock ?? prod.currentStock ?? 0;
        const stockVal = Number(rawStock) || 0;
        const normalizedProd = {
          ...prod,
          stockLevel: stockVal,
          stock: stockVal,
          currentStock: stockVal,
        };
        setProducts((prev) => {
          const id = normalizedProd._id || normalizedProd.id;
          const exists = prev.some((p) => (p._id || p.id) === id);
          if (exists) {
            return prev.map((p) => ((p._id || p.id) === id ? { ...p, ...normalizedProd } : p));
          } else {
            return [normalizedProd, ...prev];
          }
        });
      }
      fetchProducts(true);
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('retailverse-product-updated', handleProductUpdated);

    // Background polling fallback every 7 seconds
    const pollInterval = setInterval(() => {
      fetchProducts(true);
    }, 7000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('retailverse-product-updated', handleProductUpdated);
      clearInterval(pollInterval);
    };
  }, [fetchProducts]);

  // Handle adding product to cart with strict stock validation
  const addToCart = useCallback((product: any): boolean => {
    const pId = String(product._id || product.id || product.productId);
    const availableStock = getProductAvailableStock(product);
    const unitPrice = Number(product.unitPrice !== undefined ? product.unitPrice : product.price) || 0;
    const itemGst = Number(product.gst !== undefined ? product.gst : (product.gstRate ?? (product as any).taxRate ?? 0)) || 0;
    const barcode = product.barcode || product.sku || '';

    if (availableStock <= 0) {
      playScanSound('error');
      toast.error('Product is out of stock');
      return false;
    }

    let success = false;
    setCart((prevCart) => {
      const existingIndex = prevCart.findIndex(
        (item) => item.productId === pId || (barcode && item.barcode === barcode)
      );

      if (existingIndex > -1) {
        const currentQty = prevCart[existingIndex].quantity;
        if (currentQty >= availableStock) {
          playScanSound('error');
          toast.error(
            `Insufficient stock for "${product.name}". Only ${availableStock} available in inventory.`
          );
          return prevCart;
        }
        const updated = [...prevCart];
        const existingImage =
          updated[existingIndex].imageUrl ||
          getProductImageUrl(product) ||
          product.imageUrl ||
          product.image ||
          product.product_image;
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: currentQty + 1,
          gst: itemGst,
          gstRate: itemGst,
          imageUrl: existingImage,
          image: existingImage,
          product_image: existingImage,
        };
        playScanSound('success');
        toast.success(`Incremented "${product.name}" (Qty: ${currentQty + 1})`);
        success = true;
        return updated;
      } else {
        playScanSound('success');
        toast.success(`Added "${product.name}" to cart`);
        success = true;

        const resolvedImage =
          getProductImageUrl(product) ||
          (product.product_image ? getFullImageUrl(product.product_image) : '') ||
          product.imageUrl ||
          product.image ||
          product.product_image ||
          product.productImage ||
          product.thumbnail ||
          (Array.isArray(product.images) && product.images.length > 0
            ? typeof product.images[0] === 'string'
              ? product.images[0]
              : product.images[0]?.url
            : '') ||
          '';

        return [
          ...prevCart,
          {
            productId: pId,
            barcode,
            name: product.name,
            unitPrice,
            quantity: 1,
            gst: itemGst,
            gstRate: itemGst,
            stockLevel: availableStock,
            imageUrl: resolvedImage,
            image: resolvedImage,
            product_image: resolvedImage,
            category: product.category,
          },
        ];
      }
    });

    return success;
  }, []);

  // Dedicated Barcode / QR Resolver for both Hardware Scanners & Camera Scanner
  const handleBarcodeScanned = useCallback(
    async (scannedCode: string): Promise<{ success: boolean; productName?: string } | boolean> => {
      const rawCode = scannedCode.trim();
      if (!rawCode) return false;

      const normalizedCode = rawCode.toLowerCase();
      const catalog = productsRef.current;

      // 1. Immediately find product matching scanned barcode or SKU in loaded catalog
      const matchedProduct = catalog.find(
        (p) =>
          (p.barcode && String(p.barcode).trim().toLowerCase() === normalizedCode) ||
          (p.sku && String(p.sku).trim().toLowerCase() === normalizedCode) ||
          (p._id && String(p._id).trim().toLowerCase() === normalizedCode) ||
          (p.id && String(p.id).trim().toLowerCase() === normalizedCode)
      );

      if (matchedProduct) {
        const added = addToCart(matchedProduct);
        if (added) {
          return { success: true, productName: matchedProduct.name };
        }
        return false;
      }

      // 2. Offline IndexedDB Cached Product Lookup strictly within current client catalog
      try {
        const cachedMatch = await findCachedProductByBarcode(rawCode, currentClientIdRef.current);
        if (cachedMatch) {
          const added = addToCart(cachedMatch);
          if (added) {
            return { success: true, productName: cachedMatch.name };
          }
          return false;
        }
      } catch (e) {}

      // 3. Fallback: Query server lookup API GET /api/products/lookup?code=... (if online)
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          const query = currentClientIdRef.current
            ? `&clientId=${encodeURIComponent(currentClientIdRef.current)}`
            : '';
          const res = await api.get(`/products/lookup?code=${encodeURIComponent(rawCode)}${query}`);
          const fallbackProd = res.product || res.data;
          if (fallbackProd) {
            const added = addToCart(fallbackProd);
            if (added) {
              return { success: true, productName: fallbackProd.name };
            }
            return false;
          }
        } catch (err) {}
      }

      playScanSound('error');
      toast.error('Product not found for scanned barcode');
      return false;
    },
    [addToCart]
  );

  // 3. Global Barcode Scanner Listener:
  // Detects rapid input (< 50ms per keystroke terminated by 'Enter') typical of USB/Bluetooth handheld scanners.
  // Directly triggers addToCart without just dumping barcode into search bar.
  useEffect(() => {
    let scanBuffer = '';
    let lastKeyTime = 0;
    let strokeIntervals: number[] = [];

    const handleGlobalKeyDown = async (e: KeyboardEvent) => {
      // Don't intercept when completed order receipt modal is open
      if (completedOrder) return;

      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      const target = e.target as HTMLElement | null;
      const isSearchInput = target === searchInputRef.current;
      const isCouponInput = target === couponInputRef.current;

      if (e.key === 'Enter') {
        const scannedCode = scanBuffer.trim();
        // Hardware barcode scanners fire keys extremely quickly (typically 5–40ms, < 50ms per key)
        const isRapidScanner =
          strokeIntervals.length >= 2 &&
          strokeIntervals.every((diff) => diff < 50);

        // Reset buffer and intervals
        scanBuffer = '';
        strokeIntervals = [];

        if (isRapidScanner && scannedCode.length >= 2) {
          e.preventDefault();
          e.stopPropagation();

          // Clear search bar or coupon input if focus happened to be inside it during scan
          if (isSearchInput) {
            setSearchQuery('');
            searchInputRef.current?.blur();
          }
          if (isCouponInput) {
            setCouponInput('');
          }

          await handleBarcodeScanned(scannedCode);
          return;
        }

        // If not a rapid scanner, let normal Enter behavior proceed (e.g. manual search bar Enter)
        return;
      }

      // Record printable keystrokes
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (timeDiff > 60) {
          // If > 60ms elapsed since last character, start fresh scan buffer
          scanBuffer = e.key;
          strokeIntervals = [];
        } else {
          // Rapid keystroke burst (< 60ms) typical of barcode scanners
          scanBuffer += e.key;
          strokeIntervals.push(timeDiff);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
    };
  }, [completedOrder, handleBarcodeScanned]);

  // Cart quantity actions
  const updateItemQuantity = (productId: string, newQty: number) => {
    if (newQty <= 0) {
      removeItemFromCart(productId);
      return;
    }

    setCart((prevCart) => {
      return prevCart.map((item) => {
        if (item.productId === productId) {
          if (newQty > item.stockLevel) {
            playScanSound('error');
            toast.error(
              `Cannot add more. Available stock for "${item.name}" is ${item.stockLevel}.`
            );
            return item;
          }
          return { ...item, quantity: newQty };
        }
        return item;
      });
    });
  };

  const removeItemFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
    toast.info('Item removed from order');
  };

  const clearCart = () => {
    if (cart.length === 0) return;
    setCart([]);
    setAppliedCoupon(null);
    setCouponError(null);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setCustomerPhoneError(null);
    setUpiId('');
    setWhatsappPhone('');
    setUpiError(null);
    setWhatsappError(null);
    setCardHolderName('');
    setCardNumber('');
    setCardExpiry('');
    setCardCvv('');
    setCardErrors({});
    clearActiveCartDraft(currentClientId);
    toast.info('Cart cleared');
  };

  // 4. Real-time Cart Financial Calculations:
  // Subtotal = Sum of (Price * Quantity)
  // Discount = -₹1,000 (if applied and Subtotal >= ₹3,000)
  // Total GST Tax = calculated tax
  // Grand Total = Subtotal - Discount + Total GST Tax
  const calculations = useMemo(() => {
    let subtotal = 0;
    let totalGst = 0;

    cart.forEach((item) => {
      const price = Number(item.unitPrice !== undefined ? item.unitPrice : (item as any).price) || 0;
      const lineSubtotal = price * item.quantity;
      const itemGst = Number(item.gst !== undefined ? item.gst : (item.gstRate || 0)) || 0;
      const itemTax = (price * item.quantity * itemGst) / 100;
      subtotal += lineSubtotal;
      totalGst += itemTax;
    });

    const subtotalFixed = Number(subtotal.toFixed(2));
    const gstFixed = Number(totalGst.toFixed(2));

    // Dynamic Coupon Verification
    let discount = 0;
    let couponEligible = false;
    let shortfall = 0;

    if (appliedCoupon) {
      const minRequired = appliedCoupon.minSubtotal || 3000;
      if (subtotalFixed >= minRequired) {
        discount = appliedCoupon.discount || 500;
        couponEligible = true;
      } else {
        shortfall = Number((minRequired - subtotalFixed).toFixed(2));
        discount = 0;
        couponEligible = false;
      }
    }

    const grandTotal = Math.max(0, Number((subtotalFixed + gstFixed - discount).toFixed(2)));

    return {
      subtotal: subtotalFixed,
      discount,
      couponEligible,
      shortfall,
      totalGst: gstFixed,
      grandTotal,
      itemCount: cart.reduce((acc, item) => acc + item.quantity, 0),
    };
  }, [cart, appliedCoupon]);

  const billAmount = calculations.subtotal;

  // Trigger high-value order discount popup whenever billAmount > 3000
  useEffect(() => {
    if (billAmount > 3000 && !appliedCoupon && !hasDismissedHighValueModal) {
      setShowHighValueModal(true);
    } else if (billAmount <= 3000) {
      setShowHighValueModal(false);
      setHasDismissedHighValueModal(false);
    }
  }, [billAmount, appliedCoupon, hasDismissedHighValueModal]);

  // Apply Coupon via backend validation endpoint POST /api/pos/validate-coupon
  const handleApplyCoupon = async (e?: React.FormEvent, customCode?: string) => {
    if (e) e.preventDefault();
    const code = (customCode || couponInput).trim().toUpperCase();

    if (!code) {
      toast.error('Please enter a coupon code (e.g. SAVE1000)');
      return;
    }

    setIsApplyingCoupon(true);
    setCouponError(null);

    try {
      const res = await api.post('/pos/validate-coupon', {
        couponCode: code,
        subtotal: calculations.subtotal,
      });

      if (res.success && res.valid) {
        setAppliedCoupon({
          code: res.couponCode || code,
          discount: res.discount || 500,
          minSubtotal: res.minSubtotal || 3000,
        });
        setCouponInput('');
        setShowHighValueModal(false);
        toast.success(res.message || `Coupon applied! ₹${res.discount || 500} OFF`);
      } else {
        const msg = res.message || 'Invalid coupon code';
        setCouponError(msg);
        toast.error(msg);
      }
    } catch (err: any) {
      // Offline / fallback calculation if backend error
      if (
        calculations.subtotal >= 3000 &&
        (code === 'SAVE1000' || code === 'FLAT1000' || code === 'SAVE500' || code === 'FLAT500')
      ) {
        setAppliedCoupon({
          code,
          discount: 500,
          minSubtotal: 3000,
        });
        setCouponInput('');
        setShowHighValueModal(false);
        toast.success(`Coupon applied! ₹500 OFF`);
      } else {
        const msg = err.message || 'Failed to apply coupon';
        setCouponError(msg);
        toast.error(msg);
      }
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponError(null);
    toast.info('Coupon removed');
  };

  // Send invoice email via Nodemailer & Zendesk service
  const handleSendInvoiceEmail = async (overrideEmail?: string) => {
    const targetEmail = (overrideEmail || customerEmailInput || completedOrder?.customerEmail || '').trim();
    if (!targetEmail) {
      setShowEmailInput(true);
      toast.info('Please enter the customer email address');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      toast.error('Please enter a valid email address.');
      setShowEmailInput(true);
      return;
    }

    if (!completedOrder) {
      toast.error('No invoice data available.');
      return;
    }

    setIsSendingEmail(true);
    const toastId = toast.loading(`Sending receipt to ${targetEmail}...`);

    try {
      const invoiceData = {
        invoiceNumber: completedOrder.invoiceNumber || completedOrder.orderId,
        orderId: completedOrder.orderId || completedOrder.orderNumber || completedOrder._id,
        customerName: completedOrder.customerName || 'POS Customer',
        customerEmail: targetEmail,
        items: (completedOrder.items || []).map((it: any) => ({
          name: it.name,
          quantity: it.quantity,
          price: Number(it.unitPrice || it.price || 0),
          subtotal: Number(it.itemTotal || (it.unitPrice || it.price || 0) * (it.quantity || 1)),
        })),
        subtotal: Number(completedOrder.subtotal || 0),
        discountAmount: Number(completedOrder.discountAmount || 0),
        couponCode: completedOrder.couponCode,
        totalGst: Number(completedOrder.totalGst || completedOrder.taxPrice || 0),
        grandTotal: Number(completedOrder.grandTotal || completedOrder.totalPrice || 0),
        totalAmount: Number(completedOrder.grandTotal || completedOrder.totalPrice || 0),
        paymentMethod: completedOrder.paymentMethod || 'CASH',
        createdAt: completedOrder.createdAt || new Date().toISOString(),
      };

      let res: any;
      try {
        res = await api.post('/pos/send-email', {
          recipientEmail: targetEmail,
          invoiceData,
        });
      } catch (firstErr) {
        res = await api.post('/invoices/send-email', {
          recipientEmail: targetEmail,
          invoiceData,
        });
      }

      if (res.success) {
        toast.success(`Invoice sent successfully to ${targetEmail}!`, { id: toastId });
        setShowEmailInput(false);
      } else {
        throw new Error(res.message || 'Failed to send invoice email.');
      }
    } catch (err: any) {
      console.error('Failed to send invoice email:', err);
      toast.error(err.message || 'Failed to send invoice receipt email.', { id: toastId });
    } finally {
      setIsSendingEmail(false);
    }
  };

  // 5. Complete Order / Pay -> POST /api/pos/checkout
  // Sends order payload to Node.js backend which executes atomic $inc: { stock: -quantity } in MongoDB
  const handleCheckout = async (forcedPaymentMethod?: 'CASH' | 'UPI' | 'CARD' | 'RAZORPAY' | 'WHATSAPP' | React.MouseEvent) => {
    const activePaymentMethod =
      typeof forcedPaymentMethod === 'string' ? forcedPaymentMethod : paymentMethod;

    if (cart.length === 0) {
      toast.error('Cart is empty. Please scan or add items before checkout.');
      return;
    }

    const effectiveCustomerName = customerName.trim() || 'Walk-in Customer';
    const effectiveCustomerPhone = (customerPhone.trim() || whatsappPhone.trim() || '').replace(/\D/g, '');
    const effectiveCustomerAddress = customerAddress.trim();

    // Optional phone validation: if cashier entered a mobile number, ensure 10 digits
    if (effectiveCustomerPhone && effectiveCustomerPhone.length !== 10) {
      setCustomerPhoneError('Please enter a valid 10-digit mobile number');
      toast.error('Customer mobile number must be 10 digits');
      return;
    }
    setCustomerPhoneError(null);

    // ── Offline Network Validation & Cash Offline Billing ──────────────────
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (activePaymentMethod !== 'CASH') {
        playScanSound('error');
        toast.error(
          `Internet connection required for ${activePaymentMethod} payment. Please switch to "CASH" or reconnect.`
        );
        return;
      }

      // Offline CASH Checkout: Record locally with PENDING_SYNC flag in IndexedDB
      setIsProcessingCheckout(true);
      const toastId = toast.loading('Recording Cash payment offline...');

      try {
        const now = new Date();
        const yy = String(now.getFullYear()).slice(-2);
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const rand4 = Math.floor(1000 + Math.random() * 9000);
        const offlineInvoiceNum = `INV-OFF-${yy}${mm}${dd}-${rand4}`;

        const offlineOrderDoc: OfflineOrder = {
          id: offlineInvoiceNum,
          clientId: currentClientId,
          invoiceNumber: offlineInvoiceNum,
          orderId: offlineInvoiceNum,
          items: cart.map((item) => {
            const itemGst = Number(item.gst !== undefined ? item.gst : (item.gstRate || 0)) || 0;
            const lineTax = (item.unitPrice * item.quantity * itemGst) / 100;
            return {
              ...item,
              price: item.unitPrice,
              gst: itemGst,
              gstRate: itemGst,
              tax: lineTax,
              gstAmount: lineTax,
            };
          }),
          subtotal: calculations.subtotal,
          discountAmount: calculations.discount,
          totalGst: calculations.totalGst,
          grandTotal: calculations.grandTotal,
          totalAmount: calculations.grandTotal,
          paymentMethod: 'CASH',
          paymentStatus: 'PAID',
          status: 'COMPLETED',
          syncStatus: 'PENDING_SYNC',
          customerName: effectiveCustomerName,
          customerPhone: effectiveCustomerPhone || undefined,
          ...(effectiveCustomerAddress ? { customerAddress: effectiveCustomerAddress, address: effectiveCustomerAddress } : {}),
          shippingAddress: {
            fullName: effectiveCustomerName,
            phone: effectiveCustomerPhone,
            email: '',
            address: effectiveCustomerAddress,
          },
          createdAt: new Date().toISOString(),
          paidAt: new Date().toISOString(),
          isSynced: false,
          couponCode: calculations.couponEligible && appliedCoupon ? appliedCoupon.code : undefined,
        };

        // 1. Save locally to IndexedDB store 'offline_orders'
        await saveOfflineOrder(offlineOrderDoc, currentClientId);

        playScanSound('success');
        toast.success(
          `Recorded Cash payment offline! Invoice: ${offlineInvoiceNum} (Pending Sync)`,
          { id: toastId }
        );

        // 2. Open completed receipt modal so cashier can print receipt
        setCompletedOrder({
          ...offlineOrderDoc,
          orderNumber: offlineInvoiceNum,
          isPaid: true,
          customerName: effectiveCustomerName,
          customerPhone: effectiveCustomerPhone,
          customerAddress: effectiveCustomerAddress,
        });

        // 3. Clear active cart & active draft & customer form
        setCart([]);
        setAppliedCoupon(null);
        setCouponInput('');
        setCouponError(null);
        setCustomerName('');
        setCustomerPhone('');
        setCustomerAddress('');
        setCustomerPhoneError(null);
        await clearActiveCartDraft(currentClientId);

        // 4. Update pending sync counter
        await refreshPendingSyncCount();
      } catch (err: any) {
        playScanSound('error');
        console.error('Offline checkout recording error:', err);
        toast.error(err.message || 'Failed to record offline cash checkout', { id: toastId });
      } finally {
        setIsProcessingCheckout(false);
      }
      return;
    }

    // ── Razorpay Payment Execution ──────────────────────────────────────────
    if (activePaymentMethod === 'RAZORPAY') {
      setIsProcessingCheckout(true);
      const toastId = toast.loading('Initializing Razorpay Checkout...');

      try {
        const sdkLoaded = await loadRazorpaySDK();
        if (!sdkLoaded || !(window as any).Razorpay) {
          throw new Error('Failed to load Razorpay SDK. Please check your internet connection.');
        }

        const grandTotal = calculations.grandTotal;
        const amountInPaise = Math.round(grandTotal * 100);

        let rzpOrder: any = null;
        try {
          rzpOrder = await api.post('/payment/razorpay-order', {
            amount: amountInPaise,
            currency: 'INR',
            isPaise: true,
          });
        } catch (primaryErr) {
          rzpOrder = await api.post('/razorpay/create-order', {
            amount: amountInPaise,
            currency: 'INR',
            isPaise: true,
          });
        }

        const orderId = rzpOrder.order_id || rzpOrder.id;
        const keyId = rzpOrder.key_id || rzpOrder.keyId || 'rzp_test_SdfGvEyzMd8mvV';

        if (!orderId) {
          throw new Error(rzpOrder.message || 'Failed to generate Razorpay order ID');
        }

        toast.dismiss(toastId);

        // 2. Open the Razorpay Checkout Modal using the loaded window.Razorpay SDK
        const options = {
          key: keyId,
          amount: rzpOrder.amount || amountInPaise,
          currency: rzpOrder.currency || 'INR',
          name: 'Retailverse POS',
          description: `POS Bill #${Date.now().toString().slice(-6)}`,
          order_id: orderId,
          prefill: {
            name: effectiveCustomerName,
            email: 'pos@retailverse.com',
            contact: effectiveCustomerPhone || '9999999999',
          },
          theme: {
            color: '#7c3aed',
          },
          modal: {
            ondismiss: () => {
              setIsProcessingCheckout(false);
              toast.info('Razorpay payment cancelled');
            },
          },
          handler: async (response: any) => {
            const verifyToastId = toast.loading('Verifying payment signature...');
            try {
              let verifyRes: any = null;
              try {
                verifyRes = await api.post('/payment/verify-payment', {
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                });
              } catch (vErr) {
                verifyRes = await api.post('/razorpay/verify-payment', {
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                });
              }

              if (!verifyRes || (!verifyRes.success && verifyRes.status !== 'ok')) {
                throw new Error(verifyRes?.message || 'Payment signature verification failed.');
              }

              toast.loading('Payment verified! Generating invoice...', { id: verifyToastId });

              // Record order and decrement stock atomically in MongoDB
              const payload = {
                paymentMethod: 'RAZORPAY',
                paymentStatus: 'PAID',
                customerName: effectiveCustomerName,
                customerPhone: effectiveCustomerPhone || undefined,
                customerAddress: effectiveCustomerAddress || undefined,
                address: effectiveCustomerAddress || undefined,
                shippingAddress: {
                  fullName: effectiveCustomerName,
                  phone: effectiveCustomerPhone,
                  email: '',
                  address: effectiveCustomerAddress,
                },
                couponCode: calculations.couponEligible && appliedCoupon ? appliedCoupon.code : undefined,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                subtotal: calculations.subtotal,
                totalGst: calculations.totalGst,
                taxPrice: calculations.totalGst,
                grandTotal: calculations.grandTotal,
                totalAmount: calculations.grandTotal,
                items: cart.map((item) => {
                  const itemGst = Number(item.gst !== undefined ? item.gst : (item.gstRate || 0)) || 0;
                  const lineTax = (item.unitPrice * item.quantity * itemGst) / 100;
                  return {
                    productId: item.productId,
                    barcode: item.barcode,
                    name: item.name,
                    unitPrice: item.unitPrice,
                    price: item.unitPrice,
                    quantity: item.quantity,
                    gst: itemGst,
                    gstRate: itemGst,
                    tax: lineTax,
                    gstAmount: lineTax,
                  };
                }),
              };

              const res = await api.post('/pos/checkout', payload);

              if (res.success || res.invoice || res.order) {
                const orderData = res.invoice || res.order;
                playScanSound('success');
                toast.success(
                  `Payment Complete! Invoice: ${res.invoiceNumber || orderData.invoiceNumber || orderData.orderId}`,
                  { id: verifyToastId }
                );
                setCompletedOrder({
                  ...orderData,
                  customerName: orderData.customerName || effectiveCustomerName,
                  customerPhone: orderData.customerPhone || effectiveCustomerPhone,
                  customerAddress: orderData.customerAddress || effectiveCustomerAddress,
                });
                setCart([]);
                setAppliedCoupon(null);
                setCouponInput('');
                setCouponError(null);
                setCustomerName('');
                setCustomerPhone('');
                setCustomerAddress('');
                setCustomerPhoneError(null);
                fetchProducts(true);
              } else {
                throw new Error(res.message || 'Checkout failed');
              }
            } catch (err: any) {
              playScanSound('error');
              console.error('POS Razorpay checkout error:', err);
              toast.error(err.message || 'Payment recording failed.', { id: verifyToastId });
            } finally {
              setIsProcessingCheckout(false);
            }
          },
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.on('payment.failed', (resp: any) => {
          setIsProcessingCheckout(false);
          playScanSound('error');
          toast.error(resp.error?.description || 'Razorpay payment failed');
        });
        rzp.open();
      } catch (err: any) {
        setIsProcessingCheckout(false);
        playScanSound('error');
        console.error('Razorpay init error:', err);
        toast.error(err.message || 'Failed to initialize Razorpay checkout', { id: toastId });
      }
      return;
    }

    // ── WhatsApp Payment Execution (Razorpay Payment Link) ───────────────────
    if (activePaymentMethod === 'WHATSAPP') {
      const cleanPhone = (whatsappPhone || customerPhone).replace(/\D/g, '');
      if (!cleanPhone || cleanPhone.length < 10) {
        setWhatsappError('Please enter a valid 10-digit mobile number for WhatsApp');
        setCustomerPhoneError('Valid 10-digit mobile number required for WhatsApp payment');
        toast.error('Valid 10-digit mobile number required for WhatsApp payment');
        return;
      }
      setWhatsappError(null);
      setCustomerPhoneError(null);

      const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

      setIsProcessingCheckout(true);
      const toastId = toast.loading('Generating Razorpay Payment Link for WhatsApp...');

      try {
        const payload = {
          paymentMethod: 'WHATSAPP',
          paymentStatus: 'PENDING',
          customerName: effectiveCustomerName,
          customerPhone: cleanPhone,
          customerAddress: effectiveCustomerAddress || undefined,
          address: effectiveCustomerAddress || undefined,
          shippingAddress: {
            fullName: effectiveCustomerName,
            phone: cleanPhone,
            email: '',
            address: effectiveCustomerAddress,
          },
          whatsappPhone: cleanPhone,
          phone: cleanPhone,
          couponCode: calculations.couponEligible && appliedCoupon ? appliedCoupon.code : undefined,
          items: cart.map((item) => ({
            productId: item.productId,
            barcode: item.barcode,
            name: item.name,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            gstRate: item.gstRate,
          })),
        };

        let res: any = null;
        try {
          res = await api.post('/pos/whatsapp-payment-link', payload);
        } catch (linkErr) {
          res = await api.post('/pos/checkout', payload);
        }

        if (res.success || res.invoice || res.order) {
          const orderData = res.invoice || res.order || res;
          const invoiceNum = res.invoiceNumber || orderData.invoiceNumber || orderData.orderId;
          const paymentLink = res.paymentLinkUrl || orderData.paymentLinkUrl || orderData.paymentDetails?.paymentLinkUrl;
          const originalBill = (calculations.subtotal + calculations.totalGst).toFixed(2);
          const finalPayable = calculations.grandTotal.toFixed(2);
          const couponMsg =
            calculations.discount > 0 && appliedCoupon
              ? ` Coupon ${appliedCoupon.code} applied (-₹${calculations.discount.toFixed(0)} on shopping above ₹${appliedCoupon.minSubtotal || 3000}).`
              : '';
          const defaultWhatsappMsg = `Hello ${effectiveCustomerName !== 'Walk-in Customer' ? effectiveCustomerName : ''}! Your bill amount is ₹${originalBill}.${couponMsg} Total Payable: ₹${finalPayable}. Please complete your payment here: ${paymentLink}`;
          const targetWhatsAppUrl =
            res.whatsappUrl ||
            (paymentLink
              ? `https://wa.me/${fullPhone}?text=${encodeURIComponent(defaultWhatsappMsg)}`
              : null);

          if (targetWhatsAppUrl) {
            try {
              window.open(targetWhatsAppUrl, '_blank', 'noopener,noreferrer');
            } catch (wErr) {
              console.warn('Could not auto-open WhatsApp window:', wErr);
            }
          }

          toast.success(
            `Payment link sent to +${fullPhone}! Awaiting customer payment...`,
            { id: toastId }
          );

          // Put into pending state so the invoice is ONLY generated after payment is made!
          setPendingWhatsAppPayment({
            orderId: orderData._id || invoiceNum,
            invoiceNumber: invoiceNum,
            grandTotal: Number(orderData.grandTotal || calculations.grandTotal),
            paymentLinkId: res.paymentLinkId || orderData.paymentLinkId,
            paymentLinkUrl: paymentLink,
            whatsappUrl: targetWhatsAppUrl,
            whatsappPhone: cleanPhone,
            customerName: effectiveCustomerName,
            orderDoc: orderData,
          });

          // Clear active cart to avoid double-charging
          setCart([]);
          setAppliedCoupon(null);
          setCouponInput('');
          setCouponError(null);
          setCustomerName('');
          setCustomerPhone('');
          setCustomerAddress('');
          setCustomerPhoneError(null);
          fetchProducts(true);
        } else {
          throw new Error(res.message || 'Failed to generate WhatsApp payment link');
        }
      } catch (err: any) {
        playScanSound('error');
        console.error('WhatsApp checkout error:', err);
        toast.error(err.message || 'WhatsApp Payment Link generation failed.', { id: toastId });
      } finally {
        setIsProcessingCheckout(false);
      }
      return;
    }

    // ── UPI Validation ───────────────────────────────────────────────────────
    if (activePaymentMethod === 'UPI') {
      const trimmedUpi = upiId.trim();
      if (!trimmedUpi) {
        setUpiError('UPI ID is required to process UPI payment');
        toast.error('Please enter customer UPI ID (e.g. username@upi)');
        return;
      }
      if (!trimmedUpi.includes('@') || trimmedUpi.startsWith('@') || trimmedUpi.endsWith('@')) {
        setUpiError('Invalid UPI ID format. Must include username and handle (e.g. name@oksbi)');
        toast.error('Invalid UPI ID format. Format: username@bank');
        return;
      }
      setUpiError(null);
    }

    // ── Card Validation ───────────────────────────────────────────────────────
    if (activePaymentMethod === 'CARD') {
      const cleanDigits = cardNumber.replace(/\D/g, '');
      const newCardErrors: {
        cardHolderName?: string;
        cardNumber?: string;
        cardExpiry?: string;
        cardCvv?: string;
      } = {};

      const trimmedName = cardHolderName.trim();
      if (!trimmedName || trimmedName.length < 2) {
        newCardErrors.cardHolderName = 'Cardholder name is required (min 2 characters)';
      } else if (!/^[a-zA-Z\s.'-]+$/.test(trimmedName)) {
        newCardErrors.cardHolderName = 'Cardholder name can only contain letters and spaces';
      }

      if (!cleanDigits) {
        newCardErrors.cardNumber = '16-digit card number is required';
      } else if (cleanDigits.length < 13 || cleanDigits.length > 19) {
        newCardErrors.cardNumber = 'Card number must be 16 digits';
      } else if (!luhnCheck(cleanDigits)) {
        newCardErrors.cardNumber = 'Invalid card number (checksum failed)';
      }

      const expiryCheck = validateCardExpiryDate(cardExpiry);
      if (!expiryCheck.valid) {
        newCardErrors.cardExpiry = expiryCheck.error || 'Invalid expiry date';
      }

      const cleanCvv = cardCvv.trim();
      if (!cleanCvv) {
        newCardErrors.cardCvv = 'CVV is required';
      } else if (!/^\d{3,4}$/.test(cleanCvv)) {
        newCardErrors.cardCvv = 'CVV must be 3 or 4 digits';
      }

      if (Object.keys(newCardErrors).length > 0) {
        setCardErrors(newCardErrors);
        playScanSound('error');
        const firstErr = Object.values(newCardErrors)[0];
        toast.error(firstErr || 'Please check card details');
        return;
      }
      setCardErrors({});
    }

    // ── Standard Cash/Card/UPI Checkout ──────────────────────────────────────
    setIsProcessingCheckout(true);
    const toastId = toast.loading('Processing order payment...');

    try {
      const cleanCardDigits = cardNumber.replace(/\D/g, '');
      const detectedBrand = detectCardBrand(cleanCardDigits);

      const payload = {
        paymentMethod: activePaymentMethod,
        paymentStatus: 'PAID',
        customerName: effectiveCustomerName,
        customerPhone: effectiveCustomerPhone || undefined,
        customerAddress: effectiveCustomerAddress || undefined,
        address: effectiveCustomerAddress || undefined,
        shippingAddress: {
          fullName: effectiveCustomerName,
          phone: effectiveCustomerPhone,
          email: '',
          address: effectiveCustomerAddress,
        },
        upiId: activePaymentMethod === 'UPI' ? upiId.trim() : undefined,
        paymentDetails:
          activePaymentMethod === 'UPI'
            ? { upiId: upiId.trim() }
            : activePaymentMethod === 'CARD'
            ? {
                cardName: cardHolderName.trim(),
                cardLast4: cleanCardDigits.slice(-4),
                expiryDate: cardExpiry.trim(),
                cardNetwork: detectedBrand,
                cardBrand: detectedBrand,
              }
            : undefined,
        couponCode: calculations.couponEligible && appliedCoupon ? appliedCoupon.code : undefined,
        subtotal: calculations.subtotal,
        totalGst: calculations.totalGst,
        taxPrice: calculations.totalGst,
        grandTotal: calculations.grandTotal,
        totalAmount: calculations.grandTotal,
        items: cart.map((item) => {
          const itemGst = Number(item.gst !== undefined ? item.gst : (item.gstRate || 0)) || 0;
          const lineTax = (item.unitPrice * item.quantity * itemGst) / 100;
          return {
            productId: item.productId,
            barcode: item.barcode,
            name: item.name,
            unitPrice: item.unitPrice,
            price: item.unitPrice,
            quantity: item.quantity,
            gst: itemGst,
            gstRate: itemGst,
            tax: lineTax,
            gstAmount: lineTax,
          };
        }),
      };

      const res = await api.post('/pos/checkout', payload);

      if (res.success || res.invoice || res.order) {
        const orderData = res.invoice || res.order;
        playScanSound('success');
        toast.success(
          `Payment Complete! Invoice: ${res.invoiceNumber || orderData.invoiceNumber || orderData.orderId}`,
          { id: toastId }
        );
        setCompletedOrder({
          ...orderData,
          customerName: orderData.customerName || effectiveCustomerName,
          customerPhone: orderData.customerPhone || effectiveCustomerPhone,
          customerAddress: orderData.customerAddress || effectiveCustomerAddress,
        });
        setCart([]);
        setAppliedCoupon(null);
        setCouponInput('');
        setCouponError(null);
        setCustomerName('');
        setCustomerPhone('');
        setCustomerAddress('');
        setCustomerPhoneError(null);
        setUpiId('');
        setWhatsappPhone('');
        setUpiError(null);
        setWhatsappError(null);
        setCardHolderName('');
        setCardNumber('');
        setCardExpiry('');
        setCardCvv('');
        setCardErrors({});
        clearActiveCartDraft(currentClientId);
        refreshPendingSyncCount();
        // Refresh products stock immediately in background
        fetchProducts(true);
      } else {
        throw new Error(res.message || 'Checkout failed');
      }
    } catch (err: any) {
      playScanSound('error');
      console.error('Checkout error:', err);
      toast.error(err.message || 'Checkout failed. Please check stock.', { id: toastId });
    } finally {
      setIsProcessingCheckout(false);
    }
  };

  // Dedicated trigger for sending Razorpay Payment Link via WhatsApp
  const handleSendWhatsAppLink = () => {
    handleCheckout('WHATSAPP');
  };

  // Filter products for the manual picker grid
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.barcode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCat =
        selectedCategory === 'ALL' ||
        p.category?.toLowerCase() === selectedCategory.toLowerCase();

      return matchesSearch && matchesCat;
    });
  }, [products, searchQuery, selectedCategory]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ['ALL', ...Array.from(set)];
  }, [products]);

  // Handle manual Enter in Search Bar to immediately add matching product
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = searchQuery.trim();
      if (!query) return;

      const exactMatch = products.find(
        (p) =>
          (p.barcode && String(p.barcode).trim().toLowerCase() === query.toLowerCase()) ||
          (p.sku && String(p.sku).trim().toLowerCase() === query.toLowerCase())
      );

      if (exactMatch) {
        addToCart(exactMatch);
        setSearchQuery('');
        return;
      }

      if (filteredProducts.length === 1) {
        addToCart(filteredProducts[0]);
        setSearchQuery('');
        return;
      }

      // If user typed a barcode number manually in search and hit Enter
      const matchingCode = products.find(
        (p) =>
          (p.barcode && String(p.barcode).toLowerCase() === query.toLowerCase()) ||
          (p.sku && String(p.sku).toLowerCase() === query.toLowerCase()) ||
          (p._id && String(p._id) === query)
      );

      if (matchingCode) {
        addToCart(matchingCode);
        setSearchQuery('');
      } else {
        toast.info(`Showing search results for "${query}"`);
      }
    }
  };

  // Print Invoice Thermal Receipt
  const handlePrintReceipt = (order: any) => {
    const printWindow = window.open('', '_blank', 'width=420,height=600');
    if (!printWindow) {
      toast.error('Pop-up blocked. Allow pop-ups to print receipts.');
      return;
    }

    const itemsHtml = (order.items || [])
      .map(
        (it: any) => `
        <tr>
          <td style="padding: 4px 0; font-size: 11px;">${it.name}<br/><span style="font-size: 9px; color: #555;">${it.barcode || ''}</span></td>
          <td style="text-align: center; font-size: 11px;">${it.quantity}</td>
          <td style="text-align: right; font-size: 11px;">&#8377;${Number(it.unitPrice || it.price).toFixed(2)}</td>
          <td style="text-align: right; font-size: 11px; font-weight: bold;">&#8377;${Number(it.itemTotal || (it.unitPrice || it.price) * it.quantity).toFixed(2)}</td>
        </tr>
      `
      )
      .join('');

    const discountAmt = Number(order.discountAmount) || 0;
    const appliedCode = order.couponCode || 'SAVE1000';
    const discountHtml =
      discountAmt > 0
        ? `
        <div class="total-row" style="color: #15803d; font-weight: bold;">
          <span>Coupon Discount (${appliedCode}):</span>
          <span>-&#8377;${discountAmt.toFixed(2)}</span>
        </div>
        <div style="font-size: 8.5px; color: #15803d; text-align: left; padding: 1px 0 3px 0; font-weight: normal;">
          Coupon Applied: &#8377;500 OFF on purchase of &#8377;3000+
        </div>
        `
        : '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt - ${order.invoiceNumber || order.orderId}</title>
          <style>
            @page { size: 80mm auto; margin: 5mm; }
            body {
              font-family: 'Courier New', Courier, monospace;
              width: 72mm;
              margin: 0 auto;
              padding: 0;
              color: #000;
              background: #fff;
            }
            .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 6px; }
            .store-name { font-size: 16px; font-weight: bold; letter-spacing: 1px; }
            .meta { font-size: 10px; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; border-bottom: 1px dashed #000; padding-bottom: 8px; }
            th { font-size: 10px; text-transform: uppercase; border-bottom: 1px solid #000; padding: 4px 0; }
            .totals { margin-top: 8px; font-size: 11px; }
            .total-row { display: flex; justify-content: space-between; margin: 3px 0; }
            .grand-total { font-size: 14px; font-weight: bold; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 4px 0; }
            .footer { text-align: center; font-size: 10px; margin-top: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="store-name">RetailVerse POS</div>
            <div class="meta">Invoice: ${order.invoiceNumber || order.orderId}</div>
            <div class="meta">Date: ${new Date(order.createdAt || Date.now()).toLocaleString()}</div>
            <div class="meta">Payment: ${order.paymentMethod || 'CASH'} (${order.paymentMethod === 'WHATSAPP' && order.paymentStatus !== 'PAID' ? 'LINK SENT' : 'PAID'})</div>
            ${order.customerName && order.customerName !== 'Walk-in Customer' ? `<div class="meta">Customer: ${order.customerName}</div>` : ''}
            ${order.customerPhone ? `<div class="meta">Phone: ${order.customerPhone}</div>` : ''}
            ${order.customerAddress ? `<div class="meta">Address: ${order.customerAddress}</div>` : ''}
            ${order.paymentDetails?.cardLast4 ? `<div class="meta">Card: **** **** **** ${order.paymentDetails.cardLast4} (${order.paymentDetails.cardNetwork || order.paymentDetails.cardBrand || 'Card'})</div>` : ''}
            ${order.upiId || order.paymentDetails?.upiId ? `<div class="meta">UPI ID: ${order.upiId || order.paymentDetails?.upiId}</div>` : ''}
            ${order.whatsappPhone || order.paymentDetails?.whatsappPhone ? `<div class="meta">WhatsApp: +${order.whatsappPhone || order.paymentDetails?.whatsappPhone}</div>` : ''}
            ${order.paymentLinkUrl || order.paymentDetails?.paymentLinkUrl ? `<div class="meta" style="word-break: break-all;">Link: ${order.paymentLinkUrl || order.paymentDetails?.paymentLinkUrl}</div>` : ''}
          </div>
          <table>
            <thead>
              <tr>
                <th style="text-align: left;">Item</th>
                <th>Qty</th>
                <th style="text-align: right;">Price</th>
                <th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          <div class="totals">
            <div class="total-row"><span>Subtotal:</span><span>&#8377;${Number(order.subtotal || 0).toFixed(2)}</span></div>
            ${discountHtml}
            <div class="total-row"><span>Total GST Tax:</span><span>&#8377;${Number(order.totalGst || order.taxPrice || 0).toFixed(2)}</span></div>
            <div class="total-row grand-total"><span>Grand Total:</span><span>&#8377;${Number(order.grandTotal || order.totalPrice || 0).toFixed(2)}</span></div>
          </div>
          <div class="footer">
            <div>Thank You for Shopping with Us!</div>
            <div>Powered by RetailVerse POS</div>
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
      {/* Top Bar Header */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 px-4 sm:px-6 py-3">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-violet-500/25">
              <Barcode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                  POS
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                  LIVE BILLING
                </span>
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Auto-Scan Active
                </span>
              </div>
              <p className="text-xs text-zinc-500">Scan any barcode directly with handheld scanner</p>
            </div>
          </div>

          {/* Header Controls: Held Orders trigger, Network Ambient Indicator & Sync Button */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Held Orders / Recall Trigger Button with dynamic badge */}
            <button
              type="button"
              onClick={() => {
                setShowHeldListModal(true);
                loadHeldOrders();
              }}
              className="relative inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-violet-500 text-zinc-700 dark:text-zinc-200 shadow-2xs hover:shadow-md transition active:scale-95"
              title="View and recall parked orders"
            >
              <Clock className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              <span className="hidden sm:inline">Held Orders</span>
              <span className="sm:hidden">Held</span>
              {heldOrders.length > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] font-black rounded-full bg-violet-600 text-white animate-pulse">
                  {heldOrders.length}
                </span>
              )}
            </button>

            {/* Ambient Network Status Indicator: "Online" / "Offline Mode" */}
            {isOnline ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <Wifi className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Online</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700 shadow-2xs animate-pulse">
                <WifiOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Offline Mode</span>
              </span>
            )}

            {/* Pending Sync Trigger Button (if any orders pending sync) */}
            {pendingSyncCount > 0 && (
              <button
                type="button"
                disabled={isSyncing}
                onClick={triggerBackgroundSync}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 shadow-2xs transition"
                title="Click to push offline orders to MongoDB"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-amber-600 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{pendingSyncCount} Sync Pending</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main POS Layout */}
      <div className="flex-1 max-w-[1680px] w-full mx-auto p-3 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Search Bar + Category Filters + Catalog (7 Columns) */}
        <div className="lg:col-span-7 space-y-3.5">
          {/* Search Bar & Category Filters */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-3.5 border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-2.5">
            <div className="relative">
              <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-zinc-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search products by Name, SKU, Barcode (or press Enter)..."
                className="w-full pl-10 pr-9 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Category pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                    selectedCategory.toLowerCase() === cat.toLowerCase()
                      ? 'bg-violet-600 text-white shadow-2xs'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  {cat.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Product Catalog Grid */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-2xs min-h-[480px]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                Products Catalog{' '}
                <span className="text-zinc-400 font-normal">({filteredProducts.length})</span>
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400 hidden sm:inline">Click card or scan to add</span>
                <button
                  type="button"
                  onClick={() => setIsCameraScannerOpen(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800/60 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition shadow-2xs group cursor-pointer"
                  title="Open Camera Barcode & QR Scanner"
                >
                  <Camera className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 group-hover:scale-110 transition-transform" />
                  <span>Scan</span>
                </button>
              </div>
            </div>

            {isLoadingProducts ? (
              <div className="h-64 flex flex-col items-center justify-center gap-2 text-zinc-400">
                <div className="w-8 h-8 border-3 border-violet-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">Loading live catalog...</span>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center gap-2 text-zinc-400 text-center p-6">
                <Package className="w-10 h-10 text-zinc-300 dark:text-zinc-700" />
                <p className="text-sm font-medium">No products match your search or filter</p>
                <p className="text-xs text-zinc-500">
                  Products created in Inventory will automatically appear here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
                {filteredProducts.map((p) => {
                  const pId = p._id || p.id;
                  const availableStock = getProductAvailableStock(p);
                  const price = Number(p.unitPrice !== undefined ? p.unitPrice : p.price) || 0;
                  const isOutOfStock = availableStock <= 0;

                  return (
                    <div
                      key={pId}
                      onClick={() => {
                        if (isOutOfStock) {
                          playScanSound('error');
                          toast.error('Product is out of stock');
                          return;
                        }
                        addToCart(p);
                      }}
                      className={`group relative p-2.5 rounded-xl border transition-all duration-150 flex flex-col justify-between ${
                        isOutOfStock
                          ? 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 opacity-60 cursor-not-allowed'
                          : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-violet-500 hover:shadow-md cursor-pointer'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="w-11 h-11 rounded-lg bg-zinc-100 dark:bg-zinc-800 overflow-hidden shrink-0 flex items-center justify-center border border-zinc-200 dark:border-zinc-700">
                          <img
                            src={getProductImageUrl(p)}
                            alt={p.name}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = PRODUCT_PLACEHOLDER;
                            }}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 line-clamp-1 group-hover:text-violet-600 transition">
                            {p.name}
                          </h4>
                          <p className="text-[10px] text-zinc-400 font-mono mt-0.5 truncate">
                            {p.barcode || p.sku || 'No code'}
                          </p>
                          <span
                            className={`inline-block text-[9px] font-bold px-1.5 py-0.2 rounded mt-0.5 ${
                              isOutOfStock
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                                : availableStock <= 5
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                            }`}
                          >
                            {isOutOfStock ? 'OUT OF STOCK' : `${availableStock} IN STOCK`}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2 pt-1.5 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                        <span className="text-xs font-black text-zinc-900 dark:text-white">
                          ₹{price.toFixed(2)}
                        </span>
                        <button
                          type="button"
                          disabled={isOutOfStock}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isOutOfStock) {
                              playScanSound('error');
                              toast.error('Product is out of stock');
                              return;
                            }
                            addToCart(p);
                          }}
                          className={`p-1 rounded-lg transition ${
                            isOutOfStock
                              ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed opacity-50'
                              : 'bg-violet-50 text-violet-600 hover:bg-violet-600 hover:text-white group-hover:scale-110 cursor-pointer'
                          }`}
                          title={isOutOfStock ? 'Product is out of stock' : 'Add to Cart'}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Current Order / Spacious Billing Drawer (5 Columns) */}
        <div className="lg:col-span-5 sticky top-16">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden flex flex-col h-[calc(100vh-5rem)] min-h-[580px]">
            {/* Cart Header */}
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/80 dark:bg-zinc-800/50 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-300 flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Current Order</h3>
                    <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                      {calculations.itemCount} items
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const timestampSlice = Date.now().toString().slice(-4);
                      const defaultRef = customerName.trim() ? `${customerName.trim()} (#${timestampSlice})` : `HOLD-#${timestampSlice}`;
                      setHoldReferenceInput(defaultRef);
                      setShowHoldModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 transition active:scale-95"
                    title="Park active order to serve another customer"
                  >
                    <PauseCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    <span>Hold Order</span>
                  </button>
                )}
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={clearCart}
                    className="text-xs font-medium text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 px-2 py-1 rounded-lg transition"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {/* Cart Line Items (Spacious, Scrollable, Un-congested) */}
            <div className="flex-1 overflow-y-auto min-h-0 p-3 sm:p-4 space-y-2.5">
              {cart.length === 0 ? (
                <div className="h-full min-h-[160px] flex flex-col items-center justify-center text-center p-4 text-zinc-400">
                  <div className="w-11 h-11 rounded-full bg-violet-50 dark:bg-violet-950/40 text-violet-500 flex items-center justify-center mb-2.5">
                    <Barcode className="w-5 h-5" />
                  </div>
                  <h4 className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    No items in current order
                  </h4>
                  <p className="text-[11px] text-zinc-500 mt-1 max-w-[240px]">
                    Use handheld barcode scanner or click catalog products to add items.
                  </p>
                </div>
              ) : (
                cart.map((item) => {
                  const lineSubtotal = item.unitPrice * item.quantity;
                  const gstAmount = (lineSubtotal * (item.gstRate || 0)) / 100;
                  const lineTotal = lineSubtotal + gstAmount;

                  return (
                    <div
                      key={item.productId}
                      className="p-3 rounded-xl bg-zinc-50/70 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800 hover:border-violet-200 dark:hover:border-violet-800/60 transition flex items-center gap-3"
                    >
                      {/* Product Thumbnail */}
                      <div className="w-12 h-12 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 overflow-hidden shrink-0 flex items-center justify-center">
                        <img
                          src={
                            getProductImageUrl(item) ||
                            (item.imageUrl ? getFullImageUrl(item.imageUrl) : '') ||
                            (item.image ? getFullImageUrl(item.image) : '') ||
                            ((item as any).product_image ? getFullImageUrl((item as any).product_image) : '') ||
                            PRODUCT_PLACEHOLDER
                          }
                          alt={item.name}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = PRODUCT_PLACEHOLDER;
                          }}
                          className="w-full h-full object-cover rounded-lg"
                        />
                      </div>

                      {/* Product Info, Stepper, and Price */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1.5">
                          <h4
                            className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate"
                            title={item.name}
                          >
                            {item.name}
                          </h4>
                          <button
                            type="button"
                            onClick={() => removeItemFromCart(item.productId)}
                            className="text-zinc-400 hover:text-rose-500 p-0.5 rounded transition shrink-0"
                            title="Remove item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-mono mt-0.5">
                          <span>₹{item.unitPrice.toFixed(2)} each</span>
                          {item.gstRate > 0 && <span>• {item.gstRate}% GST</span>}
                        </div>

                        <div className="flex items-center justify-between mt-2">
                          {/* Quantity Stepper */}
                          <div className="inline-flex items-center border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden bg-white dark:bg-zinc-900 shadow-2xs">
                            <button
                              type="button"
                              onClick={() => updateItemQuantity(item.productId, item.quantity - 1)}
                              className="px-2 py-0.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-800 transition"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-7 text-center text-xs font-bold text-zinc-800 dark:text-zinc-200">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              disabled={item.quantity >= item.stockLevel}
                              onClick={() => updateItemQuantity(item.productId, item.quantity + 1)}
                              className={`px-2 py-0.5 text-zinc-500 transition ${
                                item.quantity >= item.stockLevel
                                  ? 'opacity-30 cursor-not-allowed'
                                  : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-800'
                              }`}
                              title={
                                item.quantity >= item.stockLevel
                                  ? `Max available stock reached (${item.stockLevel})`
                                  : 'Increase quantity'
                              }
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Line Total */}
                          <div className="text-right">
                            <span className="text-xs font-black text-zinc-900 dark:text-white">
                              ₹{lineTotal.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Compact Billing Controls & Payment Footer */}
            <div className="p-3.5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900 space-y-2.5 shrink-0">
              {/* Coupon Code: Sleek, Compact Inline Field */}
              <div>
                {appliedCoupon ? (
                  <div className="px-2.5 py-1.5 rounded-xl bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Tag className="w-3.5 h-3.5 text-violet-600" />
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-violet-900 dark:text-violet-100">
                          {appliedCoupon.code}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                          -₹{appliedCoupon.discount} OFF
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveCoupon}
                      className="p-1 rounded-lg text-zinc-400 hover:text-rose-600 transition"
                      title="Remove Coupon"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleApplyCoupon} className="flex gap-1.5">
                    <div className="relative flex-1">
                      <Tag className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400" />
                      <input
                        ref={couponInputRef}
                        type="text"
                        value={couponInput}
                        onChange={(e) => {
                          setCouponInput(e.target.value.toUpperCase());
                          if (couponError) setCouponError(null);
                        }}
                        placeholder="Coupon code (e.g. SAVE1000)"
                        className="w-full pl-8 pr-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-mono uppercase placeholder:normal-case placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={isApplyingCoupon || !couponInput.trim()}
                      size="sm"
                      className="h-8 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white px-3"
                    >
                      {isApplyingCoupon ? (
                        <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        'Apply'
                      )}
                    </Button>
                  </form>
                )}

                {/* Subtotal Criteria Notice if coupon is applied but cart < ₹3,000 */}
                {appliedCoupon && !calculations.couponEligible && (
                  <div className="mt-1.5 px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[10px] text-amber-800 dark:text-amber-200 flex items-center gap-1.5 font-medium">
                    <AlertTriangle className="w-3 h-3 shrink-0 text-amber-600" />
                    <span>Add ₹{calculations.shortfall.toFixed(2)} more to avail ₹1000 OFF</span>
                  </div>
                )}

                {couponError && !appliedCoupon && (
                  <p className="mt-1 text-[10px] text-rose-500 font-medium">{couponError}</p>
                )}
              </div>

              {/* Customer Details Form (Clean, Compact & Collapsible) */}
              <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white/70 dark:bg-zinc-850/60 p-2.5 space-y-2 transition shadow-2xs">
                <div
                  className="flex items-center justify-between cursor-pointer select-none"
                  onClick={() => setIsCustomerFormExpanded((prev) => !prev)}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-800 dark:text-zinc-200">
                    <User className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                    <span>Customer Details</span>
                    <span className="text-[10px] font-normal text-zinc-400">(Optional)</span>
                  </div>
                  <button
                    type="button"
                    className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition"
                    aria-label={isCustomerFormExpanded ? 'Collapse customer details' : 'Expand customer details'}
                  >
                    {isCustomerFormExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {isCustomerFormExpanded && (
                  <div className="space-y-1.5 pt-0.5 animate-in fade-in duration-150">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {/* Customer Name */}
                      <div className="relative">
                        <User className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400" />
                        <input
                          type="text"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="Customer Name"
                          className="w-full h-8 pl-8 pr-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20"
                        />
                      </div>

                      {/* Mobile Number */}
                      <div className="relative">
                        <Phone className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400" />
                        <input
                          type="tel"
                          value={customerPhone}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^\d+]/g, '');
                            setCustomerPhone(val);
                            // Auto-populate whatsappPhone if currently empty or paymentMethod is WHATSAPP
                            if (paymentMethod === 'WHATSAPP' || !whatsappPhone) {
                              setWhatsappPhone(val);
                            }
                            if (customerPhoneError) setCustomerPhoneError(null);
                          }}
                          onBlur={() => {
                            const clean = customerPhone.replace(/\D/g, '');
                            if (clean && clean.length !== 10) {
                              setCustomerPhoneError('Enter a valid 10-digit mobile number');
                            } else {
                              setCustomerPhoneError(null);
                            }
                          }}
                          maxLength={13}
                          placeholder="Mobile Number"
                          className={`w-full h-8 pl-8 pr-2 text-xs rounded-lg border bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none transition ${
                            customerPhoneError
                              ? 'border-rose-400 focus:ring-1 focus:ring-rose-500/20'
                              : 'border-zinc-200 dark:border-zinc-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20'
                          }`}
                        />
                      </div>
                    </div>

                    {customerPhoneError && (
                      <p className="text-[10px] text-rose-500 font-medium flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                        {customerPhoneError}
                      </p>
                    )}

                    {/* Customer Address */}
                    <div className="relative">
                      <MapPin className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400" />
                      <input
                        type="text"
                        value={customerAddress}
                        onChange={(e) => setCustomerAddress(e.target.value)}
                        placeholder="Customer Address"
                        className="w-full h-8 pl-8 pr-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Payment Method Selector (Compact Segmented Switcher) */}
              <div>
                <div className="grid grid-cols-3 bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-xl gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod('CASH');
                      setUpiError(null);
                      setWhatsappError(null);
                      setCardErrors({});
                    }}
                    className={`py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition ${
                      paymentMethod === 'CASH'
                        ? 'bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                        : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                    }`}
                  >
                    <Banknote className="w-3.5 h-3.5" />
                    CASH
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod('UPI');
                      setUpiError(null);
                      setWhatsappError(null);
                      setCardErrors({});
                    }}
                    className={`py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition ${
                      paymentMethod === 'UPI'
                        ? 'bg-white dark:bg-zinc-900 text-violet-600 dark:text-violet-400 shadow-2xs'
                        : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    UPI
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod('CARD');
                      setUpiError(null);
                      setWhatsappError(null);
                      setCardErrors({});
                    }}
                    className={`py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition ${
                      paymentMethod === 'CARD'
                        ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                        : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    CARD
                  </button>
                </div>

                {/* Conditionally rendered Card Details Form */}
                {paymentMethod === 'CARD' && (
                  <div className="mt-2 p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/60 animate-in fade-in slide-in-from-top-1 duration-150 text-left space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        Card Details <span className="text-rose-500">*</span>
                      </label>
                      <div className="flex items-center gap-1">
                        {cardNumber && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                            {detectCardBrand(cardNumber)}
                          </span>
                        )}
                        <span className="text-[10px] text-blue-600/80 dark:text-blue-400/80 font-medium">
                          Debit / Credit
                        </span>
                      </div>
                    </div>

                    {/* Cardholder Name */}
                    <div>
                      <div className="relative">
                        <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                        <input
                          type="text"
                          value={cardHolderName}
                          onChange={(e) => {
                            setCardHolderName(e.target.value);
                            if (cardErrors.cardHolderName) {
                              setCardErrors((prev) => ({ ...prev, cardHolderName: undefined }));
                            }
                          }}
                          placeholder="Cardholder Name (e.g. John Doe)"
                          className={`w-full h-8 pl-8 pr-2.5 text-xs rounded-lg border bg-white dark:bg-zinc-900 font-medium focus:outline-none transition ${
                            cardErrors.cardHolderName
                              ? 'border-rose-400 focus:ring-2 focus:ring-rose-500/20 text-rose-900 dark:text-rose-100'
                              : 'border-blue-200 dark:border-zinc-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-zinc-900 dark:text-zinc-100'
                          }`}
                        />
                      </div>
                      {cardErrors.cardHolderName && (
                        <p className="mt-1 text-[10px] text-rose-500 font-medium flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                          {cardErrors.cardHolderName}
                        </p>
                      )}
                    </div>

                    {/* 16-Digit Card Number with Auto-formatting */}
                    <div>
                      <div className="relative">
                        <CreditCard className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                        <input
                          type="text"
                          value={cardNumber}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, '').slice(0, 16);
                            // Auto format as groups of 4: "4532 1234 5678 9012"
                            const formatted = raw.match(/.{1,4}/g)?.join(' ') || raw;
                            setCardNumber(formatted);
                            if (cardErrors.cardNumber) {
                              setCardErrors((prev) => ({ ...prev, cardNumber: undefined }));
                            }
                          }}
                          placeholder="Card Number (#### #### #### ####)"
                          maxLength={19}
                          className={`w-full h-8 pl-8 pr-2.5 text-xs font-mono rounded-lg border bg-white dark:bg-zinc-900 tracking-wider focus:outline-none transition ${
                            cardErrors.cardNumber
                              ? 'border-rose-400 focus:ring-2 focus:ring-rose-500/20 text-rose-900 dark:text-rose-100'
                              : 'border-blue-200 dark:border-zinc-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-zinc-900 dark:text-zinc-100'
                          }`}
                        />
                      </div>
                      {cardErrors.cardNumber && (
                        <p className="mt-1 text-[10px] text-rose-500 font-medium flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                          {cardErrors.cardNumber}
                        </p>
                      )}
                    </div>

                    {/* Expiry Date & CVV Row */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="relative">
                          <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                          <input
                            type="text"
                            value={cardExpiry}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/\D/g, '').slice(0, 4);
                              let formatted = raw;
                              if (raw.length >= 3) {
                                formatted = `${raw.slice(0, 2)}/${raw.slice(2, 4)}`;
                              }
                              setCardExpiry(formatted);
                              if (cardErrors.cardExpiry) {
                                setCardErrors((prev) => ({ ...prev, cardExpiry: undefined }));
                              }
                            }}
                            placeholder="MM / YY"
                            maxLength={5}
                            className={`w-full h-8 pl-8 pr-2 text-xs font-mono rounded-lg border bg-white dark:bg-zinc-900 focus:outline-none transition ${
                              cardErrors.cardExpiry
                                ? 'border-rose-400 focus:ring-2 focus:ring-rose-500/20 text-rose-900 dark:text-rose-100'
                                : 'border-blue-200 dark:border-zinc-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-zinc-900 dark:text-zinc-100'
                            }`}
                          />
                        </div>
                        {cardErrors.cardExpiry && (
                          <p className="mt-1 text-[10px] text-rose-500 font-medium flex items-center gap-1">
                            <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                            {cardErrors.cardExpiry}
                          </p>
                        )}
                      </div>

                      <div>
                        <input
                          type="password"
                          value={cardCvv}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, '').slice(0, 4);
                            setCardCvv(raw);
                            if (cardErrors.cardCvv) {
                              setCardErrors((prev) => ({ ...prev, cardCvv: undefined }));
                            }
                          }}
                          placeholder="CVV / CVC"
                          maxLength={4}
                          className={`w-full h-8 px-2.5 text-xs font-mono rounded-lg border bg-white dark:bg-zinc-900 focus:outline-none transition ${
                            cardErrors.cardCvv
                              ? 'border-rose-400 focus:ring-2 focus:ring-rose-500/20 text-rose-900 dark:text-rose-100'
                              : 'border-blue-200 dark:border-zinc-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-zinc-900 dark:text-zinc-100'
                          }`}
                        />
                        {cardErrors.cardCvv && (
                          <p className="mt-1 text-[10px] text-rose-500 font-medium flex items-center gap-1">
                            <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                            {cardErrors.cardCvv}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Conditionally rendered UPI ID Input */}
                {paymentMethod === 'UPI' && (
                  <div className="mt-2 p-2.5 rounded-xl bg-violet-50/70 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800/60 animate-in fade-in slide-in-from-top-1 duration-150 text-left">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-bold text-violet-900 dark:text-violet-200 flex items-center gap-1.5">
                        <Smartphone className="w-3 h-3 text-violet-600 dark:text-violet-400" />
                        Customer UPI ID <span className="text-rose-500">*</span>
                      </label>
                      <span className="text-[10px] text-violet-600/80 dark:text-violet-400/80 font-medium">
                        UPI Collect / Intent
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={upiId}
                        onChange={(e) => {
                          setUpiId(e.target.value);
                          if (upiError) setUpiError(null);
                        }}
                        placeholder="e.g. username@oksbi / username@upi"
                        className={`w-full h-8 px-2.5 pr-7 text-xs rounded-lg border bg-white dark:bg-zinc-900 font-medium focus:outline-none transition ${
                          upiError
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-500/20 text-rose-900 dark:text-rose-100'
                            : 'border-violet-200 dark:border-zinc-700 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 text-zinc-900 dark:text-zinc-100'
                        }`}
                      />
                      {upiId && (
                        <button
                          type="button"
                          onClick={() => {
                            setUpiId('');
                            setUpiError(null);
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {upiError && (
                      <p className="mt-1 text-[10px] text-rose-500 font-medium flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                        {upiError}
                      </p>
                    )}
                  </div>
                )}

                {/* Conditionally rendered WhatsApp Phone Input */}
                {paymentMethod === 'WHATSAPP' && (
                  <div className="mt-2 p-2.5 rounded-xl bg-teal-50/70 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800/60 animate-in fade-in slide-in-from-top-1 duration-150 text-left">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-bold text-teal-900 dark:text-teal-200 flex items-center gap-1.5">
                        <MessageSquareCode className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                        Customer WhatsApp Number <span className="text-rose-500">*</span>
                      </label>
                      <span className="text-[10px] text-teal-600/80 dark:text-teal-400/80 font-medium">
                        Razorpay Link
                      </span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-zinc-400 select-none">
                        +91
                      </span>
                      <input
                        type="tel"
                        value={whatsappPhone}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^\d+]/g, '');
                          setWhatsappPhone(val);
                          if (whatsappError) setWhatsappError(null);
                        }}
                        placeholder="e.g. 9876543210"
                        maxLength={13}
                        className={`w-full h-8 pl-10 pr-7 text-xs rounded-lg border bg-white dark:bg-zinc-900 font-medium focus:outline-none transition ${
                          whatsappError
                            ? 'border-rose-400 focus:ring-2 focus:ring-rose-500/20 text-rose-900 dark:text-rose-100'
                            : 'border-teal-200 dark:border-zinc-700 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 text-zinc-900 dark:text-zinc-100'
                        }`}
                      />
                      {whatsappPhone && (
                        <button
                          type="button"
                          onClick={() => {
                            setWhatsappPhone('');
                            setWhatsappError(null);
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {whatsappError ? (
                      <p className="mt-1 text-[10px] text-rose-500 font-medium flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                        {whatsappError}
                      </p>
                    ) : (
                      <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                        Razorpay payment link will be generated & sent via WhatsApp.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Subtotal & Taxes breakdown */}
              <div className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400 pt-1.5 border-t border-zinc-200 dark:border-zinc-800">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                    ₹{calculations.subtotal.toFixed(2)}
                  </span>
                </div>

                {calculations.discount > 0 && (
                  <div className="py-1 px-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-xs">
                    <div className="flex justify-between text-emerald-700 dark:text-emerald-300 font-bold">
                      <span className="flex items-center gap-1">
                        <Tag className="w-3 h-3 text-emerald-600" />
                        Coupon Discount ({appliedCoupon?.code})
                      </span>
                      <span>-₹{calculations.discount.toFixed(2)}</span>
                    </div>
                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                      Coupon Applied: ₹500 OFF on purchase of ₹3000+
                    </div>
                  </div>
                )}

                <div className="flex justify-between">
                  <span>Total GST Tax</span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                    ₹{calculations.totalGst.toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between text-sm font-black text-zinc-900 dark:text-white pt-1.5 border-t border-zinc-200 dark:border-zinc-700">
                  <span>Grand Total</span>
                  <span className="text-violet-600 dark:text-violet-400 text-base">
                    ₹{calculations.grandTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Complete Order / Pay Button, Hold Cart Button & Send WhatsApp Link */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isProcessingCheckout || cart.length === 0}
                  onClick={() => {
                    const timestampSlice = Date.now().toString().slice(-4);
                    const defaultRef = customerName.trim() ? `${customerName.trim()} (#${timestampSlice})` : `HOLD-#${timestampSlice}`;
                    setHoldReferenceInput(defaultRef);
                    setShowHoldModal(true);
                  }}
                  className="h-11 px-3 sm:px-3.5 rounded-xl font-bold text-xs border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 flex items-center justify-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  title="Park this cart to serve next customer"
                >
                  <PauseCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="hidden sm:inline">Hold Cart</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  disabled={isProcessingCheckout || cart.length === 0}
                  onClick={handleSendWhatsAppLink}
                  className="h-11 px-3 sm:px-3.5 rounded-xl font-bold text-xs border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 dark:hover:bg-emerald-500/30 flex items-center justify-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0 shadow-2xs"
                  title="Generate Razorpay link & send to customer via WhatsApp"
                >
                  <svg
                    className="w-4 h-4 fill-emerald-600 dark:fill-emerald-400 shrink-0"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                  </svg>
                  <span className="hidden sm:inline">Send WhatsApp Link</span>
                  <span className="sm:hidden">WhatsApp</span>
                </Button>

                <Button
                  type="button"
                  disabled={isProcessingCheckout || cart.length === 0}
                  onClick={handleCheckout}
                  className={`flex-1 h-11 rounded-xl font-bold text-xs sm:text-sm text-white shadow-md transition-all duration-150 ${
                    paymentMethod === 'WHATSAPP'
                      ? 'bg-gradient-to-r from-teal-600 via-emerald-600 to-green-600 hover:from-teal-700 hover:to-emerald-700 shadow-teal-500/20'
                      : paymentMethod === 'UPI'
                      ? 'bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 hover:from-violet-700 hover:to-purple-700 shadow-violet-500/20'
                      : paymentMethod === 'CARD'
                      ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/20'
                      : 'bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-700 hover:to-indigo-700 shadow-violet-500/20'
                  }`}
                >
                {isProcessingCheckout ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing Order...
                  </span>
                ) : paymentMethod === 'WHATSAPP' ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <MessageSquareCode className="w-4 h-4" />
                    Send WhatsApp Link &bull; ₹{calculations.grandTotal.toFixed(2)}
                  </span>
                ) : paymentMethod === 'UPI' ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <Smartphone className="w-4 h-4" />
                    Charge UPI &bull; ₹{calculations.grandTotal.toFixed(2)}
                  </span>
                ) : paymentMethod === 'CARD' ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <CreditCard className="w-4 h-4" />
                    Charge Card &bull; ₹{calculations.grandTotal.toFixed(2)}
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    Charge / Pay ₹{calculations.grandTotal.toFixed(2)}
                    <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>

      {/* ── Pending WhatsApp Payment Modal (Awaiting Customer Payment Before Invoice) ── */}
      {pendingWhatsAppPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-md w-full border border-teal-200 dark:border-teal-900 p-6 shadow-2xl space-y-4 text-center">
            {/* Animated Pulsing Icon */}
            <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-teal-400/20 animate-ping" />
              <div className="w-14 h-14 rounded-full bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-700 text-teal-600 dark:text-teal-400 flex items-center justify-center shadow-md">
                <MessageSquareCode className="w-7 h-7" />
              </div>
            </div>

            <div>
              <h3 className="text-lg font-black text-zinc-900 dark:text-white">
                Payment Link Sent via WhatsApp
              </h3>
              <p className="text-xs text-zinc-500 font-mono mt-0.5">
                Invoice No: {pendingWhatsAppPayment.invoiceNumber}
              </p>
            </div>

            {/* Amount & Status Card */}
            <div className="p-4 rounded-xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/60 text-left space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Amount Due:</span>
                <span className="text-lg font-black text-teal-600 dark:text-teal-400">
                  ₹{pendingWhatsAppPayment.grandTotal.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-500 dark:text-zinc-400">Sent to:</span>
                <span className="font-bold text-zinc-800 dark:text-zinc-200">
                  +91 {pendingWhatsAppPayment.whatsappPhone}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs pt-1 border-t border-teal-200/60 dark:border-teal-800/40">
                <span className="text-zinc-500 dark:text-zinc-400">Payment Status:</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  Awaiting Payment...
                </span>
              </div>
            </div>

            {/* Payment Link Card with Copy & Open buttons */}
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-left space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Razorpay Payment Link:
              </label>
              <p className="text-xs text-zinc-700 dark:text-zinc-300 break-all font-mono select-all bg-white dark:bg-zinc-900 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800">
                {pendingWhatsAppPayment.paymentLinkUrl}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const fullPhone = pendingWhatsAppPayment.whatsappPhone.length === 10 ? `91${pendingWhatsAppPayment.whatsappPhone}` : pendingWhatsAppPayment.whatsappPhone;
                    const url = pendingWhatsAppPayment.whatsappUrl || `https://wa.me/${fullPhone}?text=${encodeURIComponent(`Hello! Total Payable: ₹${(pendingWhatsAppPayment.grandTotal || 0).toFixed(2)}. Please complete your payment here: ${pendingWhatsAppPayment.paymentLinkUrl}`)}`;
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }}
                  className="flex-1 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition"
                >
                  <MessageSquareCode className="w-3.5 h-3.5" />
                  Open WhatsApp Chat
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(pendingWhatsAppPayment.paymentLinkUrl);
                    toast.success('Payment Link copied to clipboard!');
                  }}
                  className="px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 rounded-lg text-xs font-bold transition"
                >
                  Copy Link
                </button>
              </div>
            </div>

            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              ⚡ Live check active. The final invoice will automatically appear here once customer pays.
            </p>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              <Button
                type="button"
                disabled={isCheckingPayment || isConfirmingPayment}
                onClick={async () => {
                  if (!pendingWhatsAppPayment) return;
                  setIsCheckingPayment(true);
                  const toastId = toast.loading('Checking payment status on Razorpay...');
                  try {
                    const res: any = await api.post('/pos/check-payment-status', {
                      orderId: pendingWhatsAppPayment.orderId,
                      invoiceNumber: pendingWhatsAppPayment.invoiceNumber,
                      paymentLinkId: pendingWhatsAppPayment.paymentLinkId,
                    });

                    if (res && (res.isPaid || res.paymentStatus === 'PAID')) {
                      playScanSound('success');
                      toast.success(
                        `Payment Received! Generating Invoice ${res.order?.invoiceNumber || pendingWhatsAppPayment.invoiceNumber}`,
                        { id: toastId }
                      );
                      const finalOrder = res.order || pendingWhatsAppPayment.orderDoc;
                      finalOrder.paymentStatus = 'PAID';
                      finalOrder.isPaid = true;
                      setCompletedOrder(finalOrder);
                      setPendingWhatsAppPayment(null);
                      setUpiId('');
                      setWhatsappPhone('');
                      fetchProducts(true);
                    } else {
                      toast.info('Payment not received yet. Waiting for customer to complete payment on Razorpay.', {
                        id: toastId,
                      });
                    }
                  } catch (err: any) {
                    toast.error(err.message || 'Failed to check payment status', { id: toastId });
                  } finally {
                    setIsCheckingPayment(false);
                  }
                }}
                className="w-full h-10 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-teal-500/20"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isCheckingPayment ? 'animate-spin' : ''}`} />
                {isCheckingPayment ? 'Verifying with Razorpay...' : 'Check Payment Status'}
              </Button>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isConfirmingPayment || isCheckingPayment}
                  onClick={async () => {
                    if (!pendingWhatsAppPayment) return;
                    setIsConfirmingPayment(true);
                    const toastId = toast.loading('Confirming payment received...');
                    try {
                      const res: any = await api.post('/pos/check-payment-status', {
                        orderId: pendingWhatsAppPayment.orderId,
                        invoiceNumber: pendingWhatsAppPayment.invoiceNumber,
                        paymentLinkId: pendingWhatsAppPayment.paymentLinkId,
                        confirmPayment: true,
                      });

                      if (res && (res.isPaid || res.paymentStatus === 'PAID' || res.success)) {
                        playScanSound('success');
                        toast.success(
                          `Payment Confirmed! Generating invoice for ${pendingWhatsAppPayment.invoiceNumber}`,
                          { id: toastId }
                        );
                        const finalOrder = res.order || pendingWhatsAppPayment.orderDoc || pendingWhatsAppPayment;
                        finalOrder.paymentStatus = 'PAID';
                        finalOrder.isPaid = true;
                        setCompletedOrder(finalOrder);
                        setPendingWhatsAppPayment(null);
                        setUpiId('');
                        setWhatsappPhone('');
                        fetchProducts(true);
                      } else {
                        throw new Error(res.message || 'Could not confirm payment');
                      }
                    } catch (err: any) {
                      toast.error(err.message || 'Payment confirmation failed', { id: toastId });
                    } finally {
                      setIsConfirmingPayment(false);
                    }
                  }}
                  className="flex-1 h-9 rounded-xl border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-xs font-bold"
                >
                  {isConfirmingPayment ? 'Confirming...' : 'Confirm Paid (Customer Paid)'}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  disabled={isCancellingPayment}
                  onClick={async () => {
                    if (!pendingWhatsAppPayment) return;
                    setIsCancellingPayment(true);
                    const toastId = toast.loading('Cancelling pending payment...');
                    try {
                      await api.post('/pos/check-payment-status', {
                        orderId: pendingWhatsAppPayment.orderId,
                        invoiceNumber: pendingWhatsAppPayment.invoiceNumber,
                        paymentLinkId: pendingWhatsAppPayment.paymentLinkId,
                        cancelPayment: true,
                      });
                      toast.info('Payment link cancelled and product stock restored.', { id: toastId });
                      setPendingWhatsAppPayment(null);
                      fetchProducts(true);
                    } catch (err: any) {
                      setPendingWhatsAppPayment(null);
                    } finally {
                      setIsCancellingPayment(false);
                    }
                  }}
                  className="h-9 px-3 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 font-semibold"
                >
                  Cancel Order
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Completed Order Invoice Modal */}
      {completedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-md w-full border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl space-y-4">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-black text-zinc-900 dark:text-white">
                Payment Received Successfully!
              </h3>
              <p className="text-xs text-zinc-500 font-mono">
                Invoice No: {completedOrder.invoiceNumber || completedOrder.orderId}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">Total Items:</span>
                <span className="font-bold">{completedOrder.items?.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Subtotal:</span>
                <span className="font-semibold">₹{Number(completedOrder.subtotal || 0).toFixed(2)}</span>
              </div>
              {Number(completedOrder.discountAmount) > 0 && (
                <div className="py-1 px-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-xs">
                  <div className="flex justify-between text-emerald-700 dark:text-emerald-300 font-bold">
                    <span className="flex items-center gap-1.5">
                      <Tag className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      Coupon Code: {completedOrder.couponCode || 'SAVE1000'}
                    </span>
                    <span>-₹{Number(completedOrder.discountAmount).toFixed(2)}</span>
                  </div>
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium pt-0.5">
                    Coupon Applied: ₹500 OFF on purchase of ₹3000+
                  </div>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-zinc-500">Total GST Tax:</span>
                <span className="font-semibold">
                  ₹{Number(completedOrder.totalGst || completedOrder.taxPrice || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-sm font-black pt-2 border-t border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white">
                <span>Grand Total Paid:</span>
                <span className="text-emerald-600">
                  ₹{Number(completedOrder.grandTotal || completedOrder.totalPrice || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-[11px] text-zinc-400 pt-1">
                <span>Payment Method:</span>
                <span className="font-bold uppercase text-zinc-700 dark:text-zinc-300">
                  {completedOrder.paymentMethod}
                </span>
              </div>
              {completedOrder.customerName && completedOrder.customerName !== 'Walk-in Customer' && (
                <div className="flex justify-between text-[11px] text-zinc-400 pt-0.5">
                  <span>Customer Name:</span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                    {completedOrder.customerName}
                  </span>
                </div>
              )}
              {completedOrder.customerPhone && (
                <div className="flex justify-between text-[11px] text-zinc-400 pt-0.5">
                  <span>Customer Phone:</span>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {completedOrder.customerPhone}
                  </span>
                </div>
              )}
              {completedOrder.customerAddress && (
                <div className="flex justify-between text-[11px] text-zinc-400 pt-0.5">
                  <span>Customer Address:</span>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300 text-right max-w-[200px] truncate" title={completedOrder.customerAddress}>
                    {completedOrder.customerAddress}
                  </span>
                </div>
              )}
              {(completedOrder.upiId || completedOrder.paymentDetails?.upiId) && (
                <div className="flex justify-between text-[11px] text-zinc-400 pt-0.5">
                  <span>Customer UPI ID:</span>
                  <span className="font-mono font-medium text-violet-600 dark:text-violet-400">
                    {completedOrder.upiId || completedOrder.paymentDetails?.upiId}
                  </span>
                </div>
              )}
              {(completedOrder.paymentMethod === 'CARD' || completedOrder.paymentDetails?.cardLast4) && (
                <div className="flex justify-between text-[11px] text-zinc-400 pt-0.5">
                  <span>Card Used:</span>
                  <span className="font-mono font-medium text-blue-600 dark:text-blue-400">
                    •••• {completedOrder.paymentDetails?.cardLast4 || 'Card'} {completedOrder.paymentDetails?.cardNetwork ? `(${completedOrder.paymentDetails.cardNetwork})` : ''}
                  </span>
                </div>
              )}
              {(completedOrder.whatsappPhone || completedOrder.paymentDetails?.whatsappPhone) && (
                <div className="flex justify-between text-[11px] text-zinc-400 pt-0.5">
                  <span>WhatsApp Mobile:</span>
                  <span className="font-medium text-teal-600 dark:text-teal-400">
                    +{completedOrder.whatsappPhone || completedOrder.paymentDetails?.whatsappPhone}
                  </span>
                </div>
              )}
              {(completedOrder.paymentLinkUrl || completedOrder.paymentDetails?.paymentLinkUrl) && (
                <div className="pt-2 text-left space-y-1.5">
                  <div className="p-2.5 rounded-lg bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold text-teal-700 dark:text-teal-300 flex items-center gap-1">
                        <MessageSquareCode className="w-3.5 h-3.5" />
                        Razorpay Payment Link
                      </span>
                      <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300">
                        {completedOrder.paymentStatus || 'LINK SENT'}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-600 dark:text-zinc-300 break-all font-mono">
                      {completedOrder.paymentLinkUrl || completedOrder.paymentDetails?.paymentLinkUrl}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          const targetPhone = completedOrder.whatsappPhone || completedOrder.paymentDetails?.whatsappPhone || '';
                          const cleanTargetPhone = targetPhone.replace(/\D/g, '');
                          const fullTargetPhone = cleanTargetPhone.length === 10 ? `91${cleanTargetPhone}` : cleanTargetPhone;
                          const pLink = completedOrder.paymentLinkUrl || completedOrder.paymentDetails?.paymentLinkUrl || '';
                          const origBill = (Number(completedOrder.subtotal || 0) + Number(completedOrder.totalGst || completedOrder.taxPrice || 0)).toFixed(2);
                          const finalPay = Number(completedOrder.grandTotal || completedOrder.totalPrice || 0).toFixed(2);
                          const couponText = Number(completedOrder.discountAmount) > 0
                            ? ` Coupon ${completedOrder.couponCode || 'SAVE1000'} applied (-₹${Number(completedOrder.discountAmount).toFixed(0)} on shopping above ₹3000).`
                            : '';
                          const text = `Hello! Your bill amount is ₹${origBill}.${couponText} Total Payable: ₹${finalPay}. Please complete your payment here: ${pLink}`;
                          const url = completedOrder.whatsappUrl || `https://wa.me/${fullTargetPhone}?text=${encodeURIComponent(text)}`;
                          window.open(url, '_blank');
                        }}
                        className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded text-[10px] font-bold flex items-center gap-1 transition"
                      >
                        <MessageSquareCode className="w-3 h-3" />
                        Open WhatsApp
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const pLink = completedOrder.paymentLinkUrl || completedOrder.paymentDetails?.paymentLinkUrl || '';
                          navigator.clipboard.writeText(pLink);
                          toast.success('Payment Link copied to clipboard!');
                        }}
                        className="px-2.5 py-1 bg-white dark:bg-zinc-800 border border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 rounded text-[10px] font-bold flex items-center gap-1 transition"
                      >
                        Copy Link
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Optional/Interactive Email Input for Receipt */}
            {showEmailInput && (
              <div className="p-3 rounded-xl bg-violet-50/70 dark:bg-zinc-800/80 border border-violet-200 dark:border-zinc-700 space-y-2 text-left animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-violet-600" />
                    Customer Email Address
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowEmailInput(false)}
                    className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-[10px] font-semibold"
                  >
                    Cancel
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={customerEmailInput}
                    onChange={(e) => setCustomerEmailInput(e.target.value)}
                    placeholder="customer@example.com"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isSendingEmail) {
                        e.preventDefault();
                        handleSendInvoiceEmail();
                      }
                    }}
                    className="flex-1 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={isSendingEmail || !customerEmailInput.trim()}
                    onClick={() => handleSendInvoiceEmail()}
                    className="rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-3"
                  >
                    {isSendingEmail ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      'Send'
                    )}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => {
                  setCompletedOrder(null);
                  setShowEmailInput(false);
                  setCustomerEmailInput('');
                  searchInputRef.current?.focus();
                }}
                className="flex-1 rounded-xl text-xs font-semibold px-2"
              >
                New Order
              </Button>
              <Button
                onClick={() => handlePrintReceipt(completedOrder)}
                className="flex-1 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white px-2"
              >
                <Printer className="w-3.5 h-3.5 mr-1" />
                Print Receipt
              </Button>
              <Button
                onClick={() => {
                  if (!showEmailInput && !customerEmailInput.trim() && !completedOrder.customerEmail) {
                    setShowEmailInput(true);
                  } else {
                    handleSendInvoiceEmail();
                  }
                }}
                disabled={isSendingEmail}
                className="flex-1 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-2"
              >
                {isSendingEmail ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <Mail className="w-3.5 h-3.5 mr-1" />
                )}
                Send Email
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* High-Value Order Discount Popup (Above ₹3000) */}
      {showHighValueModal && !appliedCoupon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl max-w-sm w-full border border-violet-200 dark:border-violet-900/60 p-6 shadow-2xl space-y-4 text-center relative overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Background Glow */}
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-violet-500/10 dark:bg-violet-500/20 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-full blur-2xl pointer-events-none" />

            {/* Close Button */}
            <button
              type="button"
              onClick={() => {
                setShowHighValueModal(false);
                setHasDismissedHighValueModal(true);
              }}
              className="absolute top-4 right-4 p-1 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Sparkle Badge */}
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white mx-auto flex items-center justify-center shadow-lg shadow-violet-500/25">
              <Sparkles className="w-7 h-7 text-amber-300" />
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400 px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950/60">
                High-Value Order Reward
              </span>
              <h3 className="text-lg font-black text-zinc-900 dark:text-white pt-1">
                Congratulations!
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-snug font-medium">
                You are eligible for <span className="font-bold text-emerald-600 dark:text-emerald-400">₹500 OFF</span>. Apply coupon code now.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-violet-50/70 dark:bg-zinc-800/60 border border-violet-100 dark:border-zinc-700/60 flex items-center justify-between text-xs">
              <div className="text-left">
                <p className="text-[10px] text-zinc-400 font-medium">Total Bill Amount</p>
                <p className="font-bold text-zinc-800 dark:text-zinc-200">₹{billAmount.toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-emerald-600 font-medium">Eligible Discount</p>
                <p className="font-bold text-emerald-600">-₹500.00</p>
              </div>
            </div>

            <div className="flex gap-2.5 pt-1">
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setShowHighValueModal(false);
                  setHasDismissedHighValueModal(true);
                }}
                className="flex-1 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400"
              >
                Maybe Later
              </Button>
              <Button
                type="button"
                disabled={isApplyingCoupon}
                onClick={async () => {
                  await handleApplyCoupon(undefined, 'SAVE1000');
                  setShowHighValueModal(false);
                }}
                className="flex-1 rounded-xl text-xs font-bold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-md shadow-violet-500/20"
              >
                {isApplyingCoupon ? (
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Tag className="w-3.5 h-3.5 mr-1.5" />
                    Apply Coupon Now
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── 1. Hold / Park Order Modal ────────────────────────────────────── */}
      {showHoldModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-md w-full border border-amber-200 dark:border-amber-900/60 p-6 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center shadow-md">
              <PauseCircle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-black text-zinc-900 dark:text-white">
                Hold / Park Active Order
              </h3>
              <p className="text-xs text-zinc-500 mt-1">
                Snapshot this cart and free the register to bill next customer immediately.
              </p>
            </div>

            {/* Cart Snapshot Summary Card */}
            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-left space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-500 dark:text-zinc-400">Items in Cart:</span>
                <span className="font-bold text-zinc-800 dark:text-zinc-200">
                  {calculations.itemCount} items ({cart.length} unique)
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-500 dark:text-zinc-400">Cart Total:</span>
                <span className="text-base font-black text-violet-600 dark:text-violet-400">
                  ₹{calculations.grandTotal.toFixed(2)}
                </span>
              </div>
              {appliedCoupon && (
                <div className="flex justify-between items-center text-[11px] text-emerald-600 font-medium">
                  <span>Coupon Applied:</span>
                  <span>{appliedCoupon.code} (-₹{calculations.discount})</span>
                </div>
              )}
            </div>

            {/* Reference Label Input */}
            <div className="text-left space-y-1.5">
              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                Customer Reference / Token Label <span className="text-zinc-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                autoFocus
                value={holdReferenceInput}
                onChange={(e) => setHoldReferenceInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleHoldCurrentOrder();
                  }
                }}
                placeholder="e.g. Rahul Sharma, Table 4, or Token #12"
                className="w-full h-10 px-3 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-amber-500 transition font-medium"
              />
              <p className="text-[10px] text-zinc-400">
                Default auto-token will be generated if left blank.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2.5 pt-2">
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setShowHoldModal(false);
                  setHoldReferenceInput('');
                }}
                className="flex-1 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleHoldCurrentOrder}
                className="flex-1 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/20"
              >
                <PauseCircle className="w-3.5 h-3.5 mr-1.5" />
                Confirm & Park Cart
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── 2. Held Orders / Recall Modal ─────────────────────────────────── */}
      {showHeldListModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-3xl w-full border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/80 dark:bg-zinc-800/40 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-300 flex items-center justify-center">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                      Held Orders & Parked Carts
                    </h3>
                    <span className="px-2 py-0.5 text-xs font-extrabold rounded-full bg-violet-600 text-white">
                      {heldOrders.length}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500">
                    Recall any parked cart to resume billing seamlessly
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHeldListModal(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Held Orders List */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1 min-h-[220px]">
              {isLoadingHeldOrders ? (
                <div className="h-44 flex flex-col items-center justify-center gap-2 text-zinc-400">
                  <div className="w-7 h-7 border-3 border-violet-600 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs">Loading held carts...</span>
                </div>
              ) : heldOrders.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-center p-6 text-zinc-400 space-y-2">
                  <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400">
                    <PauseCircle className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                    No Orders on Hold
                  </h4>
                  <p className="text-xs text-zinc-500 max-w-sm">
                    Click "Hold Order" anytime to park a cart when a customer steps away or needs time.
                  </p>
                </div>
              ) : (
                heldOrders.map((held) => {
                  const itemsList = held.items || [];
                  const itemsCount = itemsList.reduce((acc, it) => acc + (it?.quantity || 1), 0);
                  const formattedTime = new Date(held.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={held.id}
                      className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 hover:border-violet-300 dark:hover:border-violet-700/60 shadow-xs transition space-y-3"
                    >
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2.5 py-1 rounded-lg bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 font-mono text-xs font-bold tracking-tight">
                            {held.reference}
                          </span>
                          <span className="text-[11px] text-zinc-400 font-medium flex items-center gap-1">
                            <Clock className="w-3 h-3 text-zinc-400" />
                            {formattedTime}
                          </span>
                          {held.isSynced ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Synced to Cloud
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Local Offline
                            </span>
                          )}
                          {held.customerName && held.customerName !== 'Walk-in Customer' && (
                            <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 flex items-center gap-1">
                              <User className="w-3 h-3 text-zinc-400" />
                              {held.customerName}
                              {held.customerPhone ? ` • ${held.customerPhone}` : ''}
                            </span>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-base font-black text-zinc-900 dark:text-white">
                            ₹{Number(held.grandTotal !== undefined ? held.grandTotal : held.totalAmount || 0).toFixed(2)}
                          </span>
                          <p className="text-[10px] font-medium text-zinc-400">
                            {itemsCount} item{itemsCount !== 1 ? 's' : ''} ({itemsList.length} unique)
                          </p>
                        </div>
                      </div>

                      {/* Structured Products List / Compact Table Layout */}
                      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 overflow-hidden shadow-2xs">
                        {/* Table Header */}
                        <div className="grid grid-cols-12 gap-2 px-3 py-1.5 bg-zinc-100/80 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 select-none">
                          <div className="col-span-6 sm:col-span-6">Item & Details</div>
                          <div className="col-span-2 text-center">Qty</div>
                          <div className="col-span-2 text-right">Unit Price</div>
                          <div className="col-span-2 text-right">Item Total</div>
                        </div>

                        {/* Scrollable Items Container (max-h-48 overflow-y-auto for >3 items) */}
                        <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60 max-h-48 overflow-y-auto">
                          {itemsList.length === 0 ? (
                            <div className="py-4 text-center text-xs text-zinc-400">
                              No items recorded in this held cart.
                            </div>
                          ) : (
                            itemsList.map((it, idx) => {
                              const unitPrice = Number(it.unitPrice !== undefined ? it.unitPrice : ((it as any).price || 0));
                              const qty = Number(it.quantity || 1);
                              const lineTotal = unitPrice * qty;
                              const sku = it.barcode || (it as any).sku || '';
                              const variant = (it as any).variant || (it as any).variantName || (it as any).size || '';
                              const category = it.category || '';
                              const itemDiscount = Number((it as any).discount || 0);

                              return (
                                <div
                                  key={it.productId || it.barcode || idx}
                                  className="grid grid-cols-12 gap-2 px-3 py-2 items-center hover:bg-zinc-100/60 dark:hover:bg-zinc-800/40 transition-colors text-xs"
                                >
                                  {/* Item Name & SKU / Variant info */}
                                  <div className="col-span-6 sm:col-span-6 min-w-0 pr-1">
                                    <p
                                      className="font-semibold text-zinc-800 dark:text-zinc-200 truncate leading-tight"
                                      title={it.name || 'Product'}
                                    >
                                      {it.name || 'Unnamed Product'}
                                    </p>
                                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                      {sku && (
                                        <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">
                                          SKU: {sku}
                                        </span>
                                      )}
                                      {variant && (
                                        <span className="px-1.5 py-0.5 rounded bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-[10px] font-medium leading-none">
                                          {variant}
                                        </span>
                                      )}
                                      {category && (
                                        <span className="px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 text-[10px] font-medium leading-none">
                                          {category}
                                        </span>
                                      )}
                                      {itemDiscount > 0 && (
                                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold leading-none">
                                          -₹{itemDiscount.toFixed(2)} off
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Quantity */}
                                  <div className="col-span-2 text-center">
                                    <span className="inline-block px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-xs">
                                      Qty: {qty}
                                    </span>
                                  </div>

                                  {/* Unit Price */}
                                  <div className="col-span-2 text-right font-medium text-zinc-600 dark:text-zinc-400 text-xs">
                                    ₹{unitPrice.toFixed(2)}
                                  </div>

                                  {/* Item Total Price */}
                                  <div className="col-span-2 text-right font-bold text-zinc-900 dark:text-zinc-100 text-xs">
                                    ₹{lineTotal.toFixed(2)}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>

                        {/* Applied Coupon / Item Discount Tag (Clearly Aligned) */}
                        {held.appliedCoupon && (
                          <div className="flex items-center justify-between px-3 py-1.5 bg-emerald-50/80 dark:bg-emerald-950/30 border-t border-emerald-100 dark:border-emerald-900/50 text-xs font-medium">
                            <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                              <Tag className="w-3.5 h-3.5 shrink-0" />
                              <span>Applied Coupon:</span>
                              <span className="px-1.5 py-0.5 rounded font-mono font-bold bg-emerald-100 dark:bg-emerald-900/60 text-[11px]">
                                {held.appliedCoupon.code}
                              </span>
                            </span>
                            <span className="font-bold text-emerald-700 dark:text-emerald-300">
                              -₹{Number(held.discountAmount || held.appliedCoupon.discount || 0).toFixed(2)}
                            </span>
                          </div>
                        )}

                        {/* Financial Sub-summary (Subtotal, GST, Net Total) */}
                        <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-100/60 dark:bg-zinc-800/40 border-t border-zinc-200/80 dark:border-zinc-800 text-[11px] text-zinc-500 dark:text-zinc-400">
                          <span>
                            Subtotal: ₹{Number(held.subtotal || 0).toFixed(2)}
                            {Number(held.totalGst || 0) > 0 ? ` • GST: ₹${Number(held.totalGst).toFixed(2)}` : ''}
                          </span>
                          <span className="font-extrabold text-zinc-900 dark:text-white text-xs">
                            Total: ₹{Number(held.grandTotal !== undefined ? held.grandTotal : held.totalAmount || 0).toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-200/60 dark:border-zinc-800">
                        <div className="text-[11px] text-zinc-400">
                          {held.customerAddress ? (
                            <span className="flex items-center gap-1 truncate max-w-[220px]" title={held.customerAddress}>
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span className="truncate">{held.customerAddress}</span>
                            </span>
                          ) : (
                            <span className="font-mono text-[10px] text-zinc-400">ID: {held.id}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDeleteHeldOrder(held)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition flex items-center gap-1 active:scale-95"
                            title="Discard this parked cart"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Discard
                          </button>
                          <Button
                            type="button"
                            onClick={() => handleResumeHeldOrder(held)}
                            className="h-8 px-3.5 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white shadow-2xs flex items-center gap-1.5 transition active:scale-95"
                            title="Recall this parked cart into active register"
                          >
                            <PlayCircle className="w-3.5 h-3.5" />
                            Resume / Recall
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-800/40 flex justify-between items-center text-xs shrink-0">
              <span className="text-zinc-500">
                {heldOrders.length} parked cart{heldOrders.length !== 1 ? 's' : ''} stored locally & cloud synced
              </span>
              <Button
                variant="outline"
                type="button"
                onClick={() => setShowHeldListModal(false)}
                className="h-8 px-4 rounded-xl text-xs font-semibold"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── 3. Active Cart Conflict Dialog (When Recalling into Non-Empty Cart) ── */}
      {showCartOverwriteConfirm && selectedHeldOrderToResume && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-md w-full border border-amber-200 dark:border-amber-900/60 p-6 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center shadow-md">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-black text-zinc-900 dark:text-white">
                Active Cart Has Items
              </h3>
              <p className="text-xs text-zinc-500 mt-1">
                Your current active cart contains <span className="font-bold text-zinc-800 dark:text-zinc-200">{cart.length} item(s)</span>. How would you like to proceed?
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <Button
                type="button"
                onClick={async () => {
                  // Park current cart first, then recall the selected held order
                  const currentHeldToResume = selectedHeldOrderToResume;
                  await handleHoldCurrentOrder();
                  await handleResumeHeldOrder(currentHeldToResume, true);
                }}
                className="w-full h-10 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/20"
              >
                <PauseCircle className="w-3.5 h-3.5 mr-1.5" />
                Park Current Cart First & Resume
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  handleResumeHeldOrder(selectedHeldOrderToResume, true);
                }}
                className="w-full h-10 rounded-xl text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 border-rose-200 dark:border-rose-800"
              >
                Overwrite Active Cart (Discard Current)
              </Button>

              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setShowCartOverwriteConfirm(false);
                  setSelectedHeldOrderToResume(null);
                }}
                className="w-full h-9 rounded-xl text-xs font-semibold text-zinc-500"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Live Camera Barcode/QR Scanner Modal */}
      <POSCameraScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        onScanBarcode={handleBarcodeScanned}
      />
    </div>
  );
}

export default POSBilling;
