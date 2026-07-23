import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, Link } from 'react-router';
import {
  Plus,
  Minus,
  ShoppingCart,
  Search,
  Package2,
  Wifi,
  WifiOff,
  CheckCircle2,
  Banknote,
  CreditCard,
  Smartphone,
  Heart,
  RotateCcw,
  Loader2,
  AlertCircle,
  FileText,
  Printer,
  ArrowLeft,
  Download,
  Mail,
  X,
} from 'lucide-react';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { productApi, Product } from '../api/products';
import { wishlistApi } from '../api/wishlist';
import { useAuth } from '../context/AuthContext';
import { ImpersonationBanner } from '../components/ImpersonationBanner';
import type { Product as ShopProduct } from '../types/product';
import {
  slugifyProductName,
  buildWishlistKeyForProduct,
  buildWishlistRemoveParams,
  buildWishlistToggleBody,
} from '../utils/wishlistPayload';
import { createOrder, type OrderPayload } from '../api/orders';
import { loadPosProductsCache, savePosProductsCache } from '../lib/posProductCache';
import { formatINR, formatINRForPDF } from '../utils/formatINR';
import {
  getPendingOfflinePosOrdersCount,
  newOfflineOrderId,
  savePendingOfflinePosOrder,
  syncPendingPosOfflineOrders,
} from '../lib/posOfflineOrders';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { getFullImageUrl, getProductImageUrl } from '../utils/imageUrl';
import ApiService from '../api/apiService';
import { isStaffRole } from '../utils/staffRoles';

interface CartItem extends Product {
  cartQuantity: number;
}

type PosProductSource = 'live' | 'cache' | 'none';

/** Stable values for POS checkout; included in order payload for future API use */
type PosPaymentMethod = 'cod' | 'card' | 'upi' | 'swipe';

const POS_PAYMENT_OPTIONS: {
  value: PosPaymentMethod;
  label: string;
  icon: typeof Banknote;
}[] = [
    { value: 'cod', label: 'Cash on Delivery (COD)', icon: Banknote },
    { value: 'card', label: 'Card Payment', icon: CreditCard },
    { value: 'upi', label: 'UPI Payment', icon: Smartphone },
    { value: 'swipe', label: 'Cash', icon: CreditCard },
  ];

type PaymentFieldKey = 'cardholderName' | 'cardNumber' | 'expiryDate' | 'cvv' | 'upiId';

/** Payment grid, COD shipping, Card shipping, or Card details (same modal) */
type PosModalStep = 'payment' | 'cod-shipping' | 'card-shipping' | 'card-payment' | 'invoice';

type CodShippingFieldKey =
  | 'fullName'
  | 'phone'
  | 'addressLine1'
  | 'addressLine2'
  | 'city'
  | 'state'
  | 'postalCode'
  | 'country';

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

function isPlausiblePhone(raw: string): boolean {
  const d = digitsOnly(raw);
  const placeholders = ["9999999999", "0000000000", "1234567890", "1111111111", "8888888888", "7777777777"];
  if (placeholders.includes(d)) return false;
  return d.length >= 10 && d.length <= 15;
}

function isValidExpiryMMYY(raw: string): boolean {
  const s = raw.replace(/\s/g, '');
  const m = /^(\d{2})\/(\d{2})$/.exec(s);
  if (!m) return false;
  const mo = Number(m[1]);
  return mo >= 1 && mo <= 12;
}

function isPlausibleUpiId(raw: string): boolean {
  const t = raw.trim();
  if (t.length < 3) return false;
  const i = t.indexOf('@');
  return i > 0 && i < t.length - 1 && !/\s/.test(t);
}

/** Map API POS product to shop shape for wishlist keys/payloads (aligned with ProductDetail / ProductCard). */
function posProductToShopProduct(p: Product): ShopProduct & { _id?: string } {
  const slug = slugifyProductName(p.name);
  const img = getProductImageUrl(p);
  return {
    id: p._id || slug,
    _id: p._id,
    name: p.name,
    slug,
    price: p.price,
    description: p.description || '',
    category: p.category,
    image: getFullImageUrl(img),
    images: img ? [getFullImageUrl(img)] : [],
    stock: p.stock,
    rating: p.rating ?? 0,
    reviews: 0,
    sku: p.sku,
  };
}

export function Pos() {
  const [searchParams] = useSearchParams();
  const showSaleOnly = searchParams.get('sale') === 'true';
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [sortOrder, setSortOrder] = useState<'default' | 'price-asc' | 'price-desc' | 'name-asc'>('default');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [networkOnline, setNetworkOnline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine
  );
  const [productSource, setProductSource] = useState<PosProductSource>('none');
  const [checkoutComplete, setCheckoutComplete] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PosPaymentMethod | null>(null);
  const [orderPlacing, setOrderPlacing] = useState(false);
  const [swipePaymentStatus, setSwipePaymentStatus] = useState<'idle' | 'waiting' | 'processing' | 'success' | 'failed'>('idle');
  const [paymentValidationMessage, setPaymentValidationMessage] = useState<string | null>(null);
  const [cardholderName, setCardholderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [upiId, setUpiId] = useState('');
  const [paymentFieldErrors, setPaymentFieldErrors] = useState<Partial<Record<PaymentFieldKey, string>>>({});
  const [modalStep, setModalStep] = useState<PosModalStep>('payment');
  const [codFullName, setCodFullName] = useState('');
  const [codPhone, setCodPhone] = useState('');
  const [codAddressLine1, setCodAddressLine1] = useState('');
  const [codAddressLine2, setCodAddressLine2] = useState('');
  const [codCity, setCodCity] = useState('');
  const [codState, setCodState] = useState('');
  const [codPostalCode, setCodPostalCode] = useState('');
  const [codCountry, setCodCountry] = useState('');
  const [shippingFieldErrors, setShippingFieldErrors] = useState<
    Partial<Record<CodShippingFieldKey, string>>
  >({});
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);
  const [lastCheckoutOffline, setLastCheckoutOffline] = useState(false);
  const [selectedCartItemId, setSelectedCartItemId] = useState<string | null>(null);
  const [previewImageFailed, setPreviewImageFailed] = useState(false);
  /** Optional — when set to a registered customer email, backend links POS orders to that account for admin customer totals. */
  const [posCustomerEmail, setPosCustomerEmail] = useState('');
  /** Optional — same purpose as above; collected on shipping step so staff can link without scrolling to the top field. */
  const [codEmail, setCodEmail] = useState('');
  const { user } = useAuth();
  const [wishlistKeySet, setWishlistKeySet] = useState<Set<string>>(() => new Set());
  const [wishlistBusyKey, setWishlistBusyKey] = useState<string | null>(null);
  const [latestOrderData, setLatestOrderData] = useState<any | null>(null);
  const [latestInvoiceData, setLatestInvoiceData] = useState<any | null>(null);
  const [isFetchingInvoice, setIsFetchingInvoice] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const posInvoiceRef = useRef<HTMLDivElement>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailInputValue, setEmailInputValue] = useState('');
  const [emailInputError, setEmailInputError] = useState('');
  const [showAddedToast, setShowAddedToast] = useState(false);
  const addedToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wishlistPool = useMemo(
    () => products.map(posProductToShopProduct),
    [products]
  );

  const refreshWishlistKeys = useCallback(async () => {
    if (!user) {
      setWishlistKeySet(new Set());
      return;
    }
    try {
      const res = await wishlistApi.getList();
      if (!res.success || !res.data) return;
      const root = res.data as unknown as {
        productIds?: string[];
        items?: { productKey?: string }[];
        data?: { productIds?: string[]; items?: { productKey?: string }[] };
      };
      const wl =
        root.productIds !== undefined || root.items !== undefined ? root : root.data;
      if (!wl) return;
      const next = new Set<string>();
      (wl.productIds || []).forEach((id) => next.add(`mongo:${id}`));
      (wl.items || []).forEach((row) => {
        if (row.productKey) next.add(row.productKey);
      });
      setWishlistKeySet(next);
    } catch {
      setWishlistKeySet(new Set());
    }
  }, [user]);

  useEffect(() => {
    void refreshWishlistKeys();
  }, [refreshWishlistKeys]);

  const refreshPendingOfflineCount = useCallback(async () => {
    try {
      const n = await getPendingOfflinePosOrdersCount();
      setPendingOfflineCount(n);
    } catch {
      setPendingOfflineCount(0);
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    const online = typeof navigator !== 'undefined' && navigator.onLine;
    const clientIdForCache = localStorage.getItem('retail_verse_client_id') || undefined;

    try {
      let dbProducts: Product[] = [];
      if (online) {
        try {
          const response = await productApi.getManage();
          if (response.success && Array.isArray(response.data)) {
            dbProducts = response.data as Product[];
            setProductSource(dbProducts.length > 0 ? 'live' : 'none');
            await savePosProductsCache(dbProducts, clientIdForCache);
          } else {
            // Try cache on unexpected response
            const cached = await loadPosProductsCache(clientIdForCache);
            if (cached && cached.length > 0) {
              dbProducts = cached;
              setProductSource('cache');
            } else {
              setProductSource('none');
            }
          }
        } catch {
          const cached = await loadPosProductsCache(clientIdForCache);
          if (cached && cached.length > 0) {
            dbProducts = cached;
            setProductSource('cache');
          } else {
            setProductSource('none');
          }
        }
      } else {
        const cached = await loadPosProductsCache(clientIdForCache);
        if (cached && cached.length > 0) {
          dbProducts = cached;
          setProductSource('cache');
        } else {
          setProductSource('none');
        }
      }

      // Only use real inventory products — no static/demo product merging
      setProducts(dbProducts);
    } catch (err: unknown) {
      console.error('POS fetchProducts error:', err);
      // On catastrophic error, show empty state — do NOT fall back to static products
      setProducts([]);
      setProductSource('none');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Polling for swipe payment success - structural placeholder for future integration
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (selectedPaymentMethod === 'swipe' && swipePaymentStatus === 'waiting' && paymentModalOpen) {
      // In a real integration, we would poll a backend endpoint here
      // For example: /api/payments/swipe/status/:referenceId
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [selectedPaymentMethod, swipePaymentStatus, paymentModalOpen]);

  useEffect(() => {
    const syncOnline = () => setNetworkOnline(typeof navigator !== 'undefined' && navigator.onLine);
    const onOnline = () => {
      setNetworkOnline(true);
      fetchProducts();
      void syncPendingPosOfflineOrders().then(() => {
        void refreshPendingOfflineCount();
      });
    };
    const onOffline = () => setNetworkOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    syncOnline();
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [fetchProducts, refreshPendingOfflineCount]);

  useEffect(() => {
    void syncPendingPosOfflineOrders().then(() => {
      void refreshPendingOfflineCount();
    });
  }, [refreshPendingOfflineCount]);

  const resetPaymentFormFields = useCallback(() => {
    setCardholderName('');
    setCardNumber('');
    setExpiryDate('');
    setCvv('');
    setUpiId('');
    setPaymentFieldErrors({});
    setModalStep('payment');
    setCodFullName('');
    setCodPhone('');
    setCodAddressLine1('');
    setCodAddressLine2('');
    setCodCity('');
    setCodState('');
    setCodPostalCode('');
    setCodCountry('');
    setShippingFieldErrors({});
    setPosCustomerEmail('');
    setCodEmail('');
  }, []);

  /** Passed on every POS order so website + POS sales aggregate in Admin > Customers (same `orders` collection). */
  const getPosCustomerFieldsForPayload = (): Pick<OrderPayload, 'customerEmail' | 'customerName'> => {
    const raw = posCustomerEmail.trim() || codEmail.trim();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
    const nameFromCod = codFullName.trim();
    const nameFromCard = cardholderName.trim();
    const customerName = nameFromCod || nameFromCard || undefined;
    return {
      ...(emailOk ? { customerEmail: raw.trim().toLowerCase() } : {}),
      ...(customerName ? { customerName } : {}),
    };
  };

  /** UPI / quick POS paths skip COD shipping; still send defaults + optional email so backend can link to User.email. */
  const buildDefaultPosShippingAddress = (): NonNullable<OrderPayload['shippingAddress']> => {
    const fields = getPosCustomerFieldsForPayload();
    const emailRaw = fields.customerEmail?.trim();
    return {
      fullName: 'POS Customer',
      address: 'In-store purchase',
      city: 'N/A',
      state: 'N/A',
      zipCode: '000000',
      country: 'N/A',
      ...(emailRaw ? { email: emailRaw.toLowerCase() } : {}),
    };
  };

  useEffect(() => {
    if (cart.length === 0 && paymentModalOpen) {
      setPaymentModalOpen(false);
      setSelectedPaymentMethod(null);
      setPaymentValidationMessage(null);
      resetPaymentFormFields();
    }
  }, [cart.length, paymentModalOpen, resetPaymentFormFields]);

  useEffect(() => {
    if (cart.length === 0) {
      setSelectedCartItemId(null);
      return;
    }
    setSelectedCartItemId(prev => {
      const stillValid = prev && cart.some(item => item._id === prev);
      if (stillValid) return prev;
      return cart[0]._id ?? null;
    });
  }, [cart]);

  useEffect(() => {
    setPreviewImageFailed(false);
  }, [selectedCartItemId]);

  // Derive unique categories from the logged-in client's inventory products
  const inventoryCategories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach(p => { if (p.category) cats.add(p.category); });
    return ['All', ...Array.from(cats).sort()];
  }, [products]);

  const filteredProducts = useMemo(() => {
    let list = products.filter(p => {
      const matchSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchSearch) return false;

      if (selectedCategory !== 'All' && p.category !== selectedCategory) return false;

      if (showSaleOnly) {
        const isDiscounted =
          p.isOnSale ||
          (p.salePercentage && p.salePercentage > 0) ||
          (p.originalPrice && p.originalPrice > p.price) ||
          // @ts-ignore: if product data has salePrice instead
          (p.salePrice && p.salePrice < p.price);
        return !!isDiscounted;
      }

      return true;
    });

    if (sortOrder === 'price-asc') {
      list = [...list].sort((a, b) => a.price - b.price);
    } else if (sortOrder === 'price-desc') {
      list = [...list].sort((a, b) => b.price - a.price);
    } else if (sortOrder === 'name-asc') {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    }

    return list;
  }, [products, searchQuery, selectedCategory, sortOrder, showSaleOnly]);

  const handlePosWishlist = useCallback(
    async (e: React.MouseEvent, product: Product) => {
      e.preventDefault();
      e.stopPropagation();
      if (!user) {
        toast.error('Please sign in to save items to your wishlist.');
        return;
      }
      if (!networkOnline) {
        toast.error('Connect to the internet to update your wishlist.');
        return;
      }
      const shop = posProductToShopProduct(product);
      let body = buildWishlistToggleBody(shop, wishlistPool);
      if ('item' in body) {
        try {
          const response = await productApi.getManage();
          if (response.success && Array.isArray(response.data)) {
            const list = (response.data as Product[]).map(posProductToShopProduct);
            const retry = buildWishlistToggleBody(shop, list);
            if ('productId' in retry) body = retry;
          }
        } catch {
          /* keep snapshot body */
        }
      }
      const removeParams = buildWishlistRemoveParams(shop, wishlistPool);
      const key = buildWishlistKeyForProduct(shop, wishlistPool);
      const inWishlist = !!(user && wishlistKeySet.has(key));

      setWishlistBusyKey(key);
      try {
        if (!inWishlist) {
          const res = await wishlistApi.add(body);
          if (res.success) {
            toast.success(
              res.message || (res.alreadyExists ? 'Already in wishlist' : 'Added to wishlist')
            );
            await refreshWishlistKeys();
          }
        } else {
          const res = await wishlistApi.remove(removeParams);
          if (res.success) {
            toast.success(res.message || 'Removed from wishlist');
            await refreshWishlistKeys();
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Wishlist could not be updated';
        toast.error(msg);
      } finally {
        setWishlistBusyKey(null);
      }
    },
    [user, networkOnline, wishlistPool, wishlistKeySet, refreshWishlistKeys]
  );

  const currentOrderPreviewItem =
    cart.length === 0
      ? null
      : (cart.find(i => i._id === selectedCartItemId) ?? cart[0] ?? null);

  const addToCart = (product: Product) => {
    setCheckoutComplete(false);

    if (product.stock > 0 && product.stock < 10) {
      toast.warning(`Low Stock: Only ${product.stock} items left in stock`);
    }

    setCart(prev => {
      const existing = prev.find(item => item._id === product._id);
      if (existing) {
        if (existing.cartQuantity >= product.stock) {
          toast.error('Cannot exceed available stock');
          return prev;
        }
        return prev.map(item =>
          item._id === product._id
            ? { ...item, cartQuantity: item.cartQuantity + 1 }
            : item
        );
      }
      if (product.stock < 1) {
        toast.error('Product is out of stock');
        return prev;
      }
      return [...prev, { ...product, cartQuantity: 1 }];
    });

    setShowAddedToast(true);
    if (addedToastTimer.current) clearTimeout(addedToastTimer.current);
    addedToastTimer.current = setTimeout(() => {
      setShowAddedToast(false);
      addedToastTimer.current = null;
    }, 1800);
  };

  const updateQuantity = (id: string, delta: number) => {
    const item = cart.find(i => i._id === id);
    if (item && delta > 0 && item.stock > 0 && item.stock < 10) {
      toast.warning(`Low Stock: Only ${item.stock} items left in stock`);
    }

    setCart(prev => prev.map(item => {
      if (item._id === id) {
        const newQuantity = item.cartQuantity + delta;
        if (newQuantity < 1) return item; // Will be filtered out or handled by remove
        if (newQuantity > item.stock) {
          toast.error('Cannot exceed available stock');
          return item;
        }
        return { ...item, cartQuantity: newQuantity };
      }
      return item;
    }).filter(item => item.cartQuantity > 0));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item._id !== id));
  };

  const calculateTotal = () => {
    return cart.reduce((total, item) => total + (item.price * item.cartQuantity), 0);
  };

  const handlePaymentDialogOpenChange = (open: boolean) => {
    // If the user is closing the modal from the invoice step, complete the checkout flow
    if (!open && modalStep === 'invoice') {
      setCart([]);
      setCheckoutComplete(true);
    }

    setPaymentModalOpen(open);
    if (!open) {
      setSelectedPaymentMethod(null);
      setPaymentValidationMessage(null);
      setOrderPlacing(false);
      resetPaymentFormFields();
      setLatestOrderData(null);
      setLatestInvoiceData(null);
      setIsFetchingInvoice(false);
    }
  };

  const openPaymentStep = () => {
    if (cart.length === 0) return;
    setSelectedPaymentMethod(null);
    setPaymentValidationMessage(null);
    resetPaymentFormFields();
    setPaymentModalOpen(true);
  };

  const validateCodShippingFields = (): Partial<Record<CodShippingFieldKey, string>> => {
    const errs: Partial<Record<CodShippingFieldKey, string>> = {};
    if (!codFullName.trim()) errs.fullName = 'Please enter full name';
    if (!codPhone.trim()) errs.phone = 'Please enter phone number';
    else if (!isPlausiblePhone(codPhone)) errs.phone = 'Please enter a valid phone number';
    else {
      const d = digitsOnly(codPhone);
      const isIndia = codCountry.trim().toLowerCase() === 'india' || codCountry.trim() === 'IN';
      if (isIndia && !/^[6-9]\d{9}$/.test(d)) {
        errs.phone = 'Please enter a valid 10-digit Indian mobile number (e.g. 9876543210)';
      }
    }
    if (!codAddressLine1.trim()) errs.addressLine1 = 'Please enter address line 1';
    if (!codCity.trim()) errs.city = 'Please enter city';
    if (!codState.trim()) errs.state = 'Please enter state / region';
    if (!codPostalCode.trim()) errs.postalCode = 'Please enter postal code';
    else if (codPostalCode.trim().length < 3) errs.postalCode = 'Please enter a valid postal code';
    if (!codCountry.trim()) errs.country = 'Please enter country';
    return errs;
  };

  const buildCodShippingPayload = (): NonNullable<OrderPayload['shippingAddress']> => {
    const line1 = codAddressLine1.trim();
    const line2 = codAddressLine2.trim();
    const address = line2 ? `${line1}\n${line2}` : line1;
    const emailTrim = codEmail.trim();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim);
    return {
      fullName: codFullName.trim(),
      ...(emailOk ? { email: emailTrim.toLowerCase() } : {}),
      phone: codPhone.trim(),
      address,
      city: codCity.trim(),
      state: codState.trim(),
      zipCode: codPostalCode.trim(),
      country: codCountry.trim(),
    };
  };

  const goBackFromShippingStep = () => {
    setModalStep('payment');
    setSelectedPaymentMethod(null);
    setShippingFieldErrors({});
    setPaymentValidationMessage(null);
  };

  const goBackFromCardPaymentStep = () => {
    setModalStep('card-shipping');
    setPaymentFieldErrors({});
    setPaymentValidationMessage(null);
  };

  const validatePaymentFields = (method: PosPaymentMethod): Partial<Record<PaymentFieldKey, string>> => {
    const errs: Partial<Record<PaymentFieldKey, string>> = {};
    if (method === 'card') {
      if (!cardholderName.trim()) errs.cardholderName = 'Please enter cardholder name';
      const num = digitsOnly(cardNumber);
      if (!num) errs.cardNumber = 'Please enter card number';
      else if (num.length < 13 || num.length > 19) errs.cardNumber = 'Please enter a valid card number';
      if (!expiryDate.trim()) errs.expiryDate = 'Please enter expiry date';
      else if (!isValidExpiryMMYY(expiryDate)) errs.expiryDate = 'Please enter a valid expiry date (MM/YY)';
      const cvvDigits = digitsOnly(cvv);
      if (!cvvDigits) errs.cvv = 'Please enter CVV';
      else if (cvvDigits.length < 3 || cvvDigits.length > 4) errs.cvv = 'Please enter a valid CVV';
    }
    if (method === 'upi') {
      if (!upiId.trim()) errs.upiId = 'Please enter UPI ID';
      else if (!isPlausibleUpiId(upiId)) errs.upiId = 'Please enter a valid UPI ID';
    }
    return errs;
  };

  const onOrderSuccess = async (order: any, isOffline = false) => {
    setLatestOrderData(order);
    // REMOVED: setCart([]) and setCheckoutComplete(true) - now handled after invoice
    setLastCheckoutOffline(isOffline);
    setPaymentValidationMessage(null);
    setSelectedPaymentMethod(null);

    // Refresh products to show updated stock immediately
    void fetchProducts();

    if (isOffline) {
      // For offline orders, we don't have a backend invoice yet.
      // We'll generate a preview from the order data.
      setLatestInvoiceData({
        invoiceNumber: `PRO-FORMA-${order.orderId}`,
        orderId: order.orderId,
        customerName: order.customerName || (order.shippingAddress && order.shippingAddress.fullName) || "POS Customer",
        customerEmail: order.customerEmail || (order.shippingAddress && order.shippingAddress.email) || "",
        customerPhone: order.customerPhone || (order.shippingAddress && order.shippingAddress.phone) || "",
        items: order.items.map((i: any) => ({
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          subtotal: i.price * i.quantity
        })),
        subtotal: order.totalPrice,
        tax: 0,
        totalAmount: order.totalPrice,
        paymentMethod: order.paymentMethod,
        paymentStatus: "Pending (Offline)",
        createdAt: new Date().toISOString()
      });
      setModalStep('invoice');
    } else {
      setIsFetchingInvoice(true);
      setModalStep('invoice');

      try {
        // Try to fetch the invoice from the backend
        // We might need to retry a few times as it's generated asynchronously
        let retryCount = 0;
        let foundInvoice = null;

        while (retryCount < 3 && !foundInvoice) {
          if (retryCount > 0) await new Promise(resolve => setTimeout(resolve, 1000));

          const res = await ApiService.get('/invoices');
          if (res.success && Array.isArray(res.data)) {
            foundInvoice = res.data.find((i: any) => i.orderId === order.orderId);
          }
          retryCount++;
        }

        if (foundInvoice) {
          setLatestInvoiceData(foundInvoice);
        } else {
          // Fallback to deriving from order data if backend invoice not found yet
          setLatestInvoiceData({
            invoiceNumber: `INV-${order.orderId}`,
            orderId: order.orderId,
            customerName: order.customerName || (order.shippingAddress && order.shippingAddress.fullName) || "POS Customer",
            customerEmail: order.customerEmail || (order.shippingAddress && order.shippingAddress.email) || "",
            customerPhone: order.customerPhone || (order.shippingAddress && order.shippingAddress.phone) || "",
            items: order.items.map((i: any) => ({
              name: i.name,
              quantity: i.quantity,
              price: i.price,
              subtotal: i.price * i.quantity
            })),
            subtotal: order.totalPrice,
            tax: 0,
            totalAmount: order.totalPrice,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus || "Completed",
            createdAt: order.createdAt || new Date().toISOString()
          });
        }
      } catch (err) {
        console.error('Invoice fetch error:', err);
      } finally {
        setIsFetchingInvoice(false);
      }
    }
  };

  const handlePlaceOrder = async () => {
    if (cart.length === 0) return;

    const orderTotal = cart.reduce((total, item) => total + item.price * item.cartQuantity, 0);
    const subtotal = orderTotal;
    const itemsPayload = cart.map(({ _id, name, price, cartQuantity, image, category }) => ({
      productId: String(_id ?? ''),
      name,
      price,
      quantity: cartQuantity,
      image: image ?? '',
      category: category ?? 'Uncategorized',
    }));
    const offline = typeof navigator === 'undefined' ? false : !navigator.onLine;

    if (modalStep === 'cod-shipping') {
      const shipErrs = validateCodShippingFields();
      if (Object.keys(shipErrs).length > 0) {
        setShippingFieldErrors(shipErrs);
        setPaymentValidationMessage(null);
        setPaymentFieldErrors({});
        const first = Object.values(shipErrs)[0];
        if (first) toast.error(first);
        return;
      }
      setShippingFieldErrors({});
      setPaymentFieldErrors({});
      setPaymentValidationMessage(null);
      setSelectedPaymentMethod('cod');
      setOrderPlacing(true);

      const shippingAddress = buildCodShippingPayload();

      if (offline) {
        try {
          const offlineOrderId = newOfflineOrderId();
          const orderPayload: OrderPayload = {
            orderId: `ORD-POS-OFF-${offlineOrderId}`,
            isPos: true,
            orderSource: 'pos',
            source: 'pos',
            orderType: 'pos',
            channel: 'pos',
            items: itemsPayload,
            shippingAddress,
            paymentMethod: 'COD',
            totalPrice: orderTotal,
            ...getPosCustomerFieldsForPayload(),
          };
          await savePendingOfflinePosOrder({
            offlineOrderId,
            orderPayload,
            subtotal,
            total: orderTotal,
          });
          toast.success(
            'Order saved offline successfully and will sync when internet returns.'
          );
          await onOrderSuccess(orderPayload, true);
          void refreshPendingOfflineCount();
        } catch (err: unknown) {
          const message =
            err instanceof Error
              ? err.message
              : 'Could not save offline order. Please try again.';
          toast.error(message);
        } finally {
          setOrderPlacing(false);
        }
        return;
      }

      try {
        const orderPayload = {
          orderId: `ORD-POS-${Date.now()}`,
          isPos: true,
          orderSource: 'pos',
          source: 'pos',
          orderType: 'pos',
          channel: 'pos',
          items: itemsPayload,
          shippingAddress,
          paymentMethod: 'COD',
          totalPrice: orderTotal,
          ...getPosCustomerFieldsForPayload(),
        };
        console.log('[POS] COD order payload:', JSON.stringify(orderPayload, null, 2));
        const result = await createOrder(orderPayload);

        if (result.success) {
          toast.success('Order placed successfully');
          await onOrderSuccess(result.data, false);
        } else {
          throw new Error(result.message || 'Failed to place order.');
        }
      } catch (err: unknown) {
        console.error('[POS] COD order error:', err);
        const message =
          err instanceof Error ? err.message : 'Failed to place order. Please try again.';
        toast.error(message);
      } finally {
        setOrderPlacing(false);
      }
      return;
    }

    if (modalStep === 'card-shipping') {
      const shipErrs = validateCodShippingFields();
      if (Object.keys(shipErrs).length > 0) {
        setShippingFieldErrors(shipErrs);
        setPaymentValidationMessage(null);
        setPaymentFieldErrors({});
        const first = Object.values(shipErrs)[0];
        if (first) toast.error(first);
        return;
      }
      setShippingFieldErrors({});
      setPaymentValidationMessage(null);
      setSelectedPaymentMethod('card');
      setModalStep('card-payment');
      return;
    }

    if (modalStep === 'card-payment') {
      const cardErrs = validatePaymentFields('card');
      if (Object.keys(cardErrs).length > 0) {
        setPaymentFieldErrors(cardErrs);
        setPaymentValidationMessage(null);
        const first = Object.values(cardErrs)[0];
        if (first) toast.error(first);
        return;
      }
      setPaymentFieldErrors({});
      setPaymentValidationMessage(null);
      setSelectedPaymentMethod('card');
      setOrderPlacing(true);

      const last4 = digitsOnly(cardNumber).slice(-4);
      const paymentDetails: OrderPayload['paymentDetails'] = {
        cardholderName: cardholderName.trim(),
        last4,
        expiryDate: expiryDate.replace(/\s/g, ''),
      };
      const shippingAddress = buildCodShippingPayload();

      if (offline) {
        try {
          const offlineOrderId = newOfflineOrderId();
          const orderPayload: OrderPayload = {
            orderId: `ORD-POS-OFF-${offlineOrderId}`,
            isPos: true,
            orderSource: 'pos',
            source: 'pos',
            orderType: 'pos',
            channel: 'pos',
            items: itemsPayload,
            shippingAddress,
            paymentMethod: 'Card',
            paymentDetails,
            totalPrice: orderTotal,
            ...getPosCustomerFieldsForPayload(),
          };
          await savePendingOfflinePosOrder({
            offlineOrderId,
            orderPayload,
            subtotal,
            total: orderTotal,
          });
          toast.success(
            'Order saved offline successfully and will sync when internet returns.'
          );
          await onOrderSuccess(orderPayload, true);
          void refreshPendingOfflineCount();
        } catch (err: unknown) {
          const message =
            err instanceof Error
              ? err.message
              : 'Could not save offline order. Please try again.';
          toast.error(message);
        } finally {
          setOrderPlacing(false);
        }
        return;
      }

      try {
        const orderPayload = {
          orderId: `ORD-POS-${Date.now()}`,
          isPos: true,
          orderSource: 'pos',
          source: 'pos',
          orderType: 'pos',
          channel: 'pos',
          items: itemsPayload,
          shippingAddress,
          paymentMethod: 'Card',
          paymentDetails,
          totalPrice: orderTotal,
          ...getPosCustomerFieldsForPayload(),
        };
        console.log('[POS] Card order payload:', JSON.stringify(orderPayload, null, 2));
        const result = await createOrder(orderPayload);

        if (result.success) {
          toast.success('Order placed successfully');
          await onOrderSuccess(result.data, false);
        } else {
          throw new Error(result.message || 'Failed to place order.');
        }
      } catch (err: unknown) {
        console.error('[POS] Card order error:', err);
        const message =
          err instanceof Error ? err.message : 'Failed to place order. Please try again.';
        toast.error(message);
      } finally {
        setOrderPlacing(false);
      }
      return;
    }

    if (!selectedPaymentMethod) {
      const msg = 'Please select a payment method';
      setPaymentValidationMessage(msg);
      setPaymentFieldErrors({});
      setShippingFieldErrors({});
      toast.error(msg);
      return;
    }

    const fieldErrs = validatePaymentFields(selectedPaymentMethod);
    if (Object.keys(fieldErrs).length > 0) {
      setPaymentFieldErrors(fieldErrs);
      setPaymentValidationMessage(null);
      const first = Object.values(fieldErrs)[0];
      if (first) toast.error(first);
      return;
    }

    setPaymentFieldErrors({});
    setPaymentValidationMessage(null);
    setOrderPlacing(true);
    if (selectedPaymentMethod === 'swipe') {
      setSwipePaymentStatus('processing');
    }

    let paymentDetails: OrderPayload['paymentDetails'];
    if (selectedPaymentMethod === 'upi') {
      paymentDetails = { upiId: upiId.trim() };
    } else {
      paymentDetails = undefined;
    }

    if (offline) {
      try {
        const offlineOrderId = newOfflineOrderId();
        const methodMap: Record<PosPaymentMethod, string> = {
          cod: 'COD',
          card: 'Card',
          upi: 'UPI',
          swipe: 'Cash',
        };

        const orderPayload: OrderPayload = {
          orderId: `ORD-POS-OFF-${offlineOrderId}`,
          isPos: true,
          orderSource: 'pos',
          source: 'pos',
          orderType: 'pos',
          channel: 'pos',
          items: itemsPayload,
          shippingAddress: buildDefaultPosShippingAddress(),
          paymentMethod: methodMap[selectedPaymentMethod],
          paymentDetails,
          totalPrice: orderTotal,
          ...getPosCustomerFieldsForPayload(),
        };
        await savePendingOfflinePosOrder({
          offlineOrderId,
          orderPayload,
          subtotal,
          total: orderTotal,
        });
        toast.success(
          'Order saved offline successfully and will sync when internet returns.'
        );
        await onOrderSuccess(orderPayload, true);
        void refreshPendingOfflineCount();
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : 'Could not save offline order. Please try again.';
        toast.error(message);
      } finally {
        setOrderPlacing(false);
      }
      return;
    }

    try {
      const methodMap: Record<PosPaymentMethod, string> = {
        cod: 'COD',
        card: 'Card',
        upi: 'UPI',
        swipe: 'Cash',
      };

      const orderPayload = {
        orderId: `ORD-POS-${Date.now()}`,
        isPos: true,
        orderSource: 'pos',
        source: 'pos',
        orderType: 'pos',
        channel: 'pos',
        items: itemsPayload,
        shippingAddress: buildDefaultPosShippingAddress(),
        paymentMethod: methodMap[selectedPaymentMethod],
        paymentDetails,
        totalPrice: orderTotal,
        ...getPosCustomerFieldsForPayload(),
      };
      console.log('[POS] Order payload:', JSON.stringify(orderPayload, null, 2));
      const result = await createOrder(orderPayload);

      if (result.success) {
        toast.success('Order placed successfully');
        if (selectedPaymentMethod === 'swipe') {
          setSwipePaymentStatus('success');
        }
        await onOrderSuccess(result.data, false);
      } else {
        throw new Error(result.message || 'Failed to place order.');
      }
    } catch (err: unknown) {
      console.error('[POS] Order error:', err);
      const message =
        err instanceof Error ? err.message : 'Failed to place order. Please try again.';
      toast.error(message);
      if (selectedPaymentMethod === 'swipe') {
        setSwipePaymentStatus('failed');
      }
    } finally {
      setOrderPlacing(false);
    }
  };

  const handleContinueShopping = () => {
    setCheckoutComplete(false);
    setLastCheckoutOffline(false);
  };

  /** Send invoice to a given email via backend. */
  const sendInvoiceToEmail = async (email: string) => {
    if (!latestInvoiceData) {
      toast.error('No invoice data available.');
      return;
    }
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error('Please enter a valid email address.');
      return;
    }
    setEmailSending(true);

    // Client-side timeout so the button never stays stuck on "Sending…"
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 65000); // 65s — slightly longer than backend's 55s timeout

    try {
      const res = await ApiService.post('/invoices/send-email', {
        recipientEmail: trimmed,
        invoiceData: latestInvoiceData,
      }, { signal: controller.signal, pageName: 'POS Invoice Email' } as any);
      if (res.success) {
        toast.success('Invoice sent successfully!');
        setEmailModalOpen(false);
        setEmailInputValue('');
        setEmailInputError('');
        window.dispatchEvent(new CustomEvent('invalidate-support-tickets'));
      } else {
        throw new Error(res.message || 'Failed to send invoice email.');
      }
    } catch (err: unknown) {
      let msg = 'Failed to send invoice email.';
      if (err instanceof DOMException && err.name === 'AbortError') {
        msg = 'Email sending timed out. Please check your network and try again.';
      } else if (err instanceof TypeError && (err as any).message?.includes('fetch')) {
        msg = 'Could not reach the server. Please check your internet connection.';
      } else if (err instanceof Error) {
        msg = err.message || 'An unknown error occurred while sending the email.';
      }
      console.error('[POS] sendInvoiceToEmail error:', err);
      toast.error(msg);
    } finally {
      clearTimeout(timeoutId);
      setEmailSending(false);
    }
  };

  /** Handler for "Send via Email" button click. */
  const handleSendInvoiceEmail = () => {
    // Try to use the customer email from the invoice / payment form
    const autoEmail =
      latestInvoiceData?.customerEmail?.trim() ||
      posCustomerEmail.trim() ||
      codEmail.trim();

    if (autoEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(autoEmail)) {
      // Automatically send to the known email
      void sendInvoiceToEmail(autoEmail);
    } else {
      // No email available — show input modal
      setEmailInputValue('');
      setEmailInputError('');
      setEmailModalOpen(true);
    }
  };

  /** Handler for "Download PDF" button click. */
  const handleDownloadPDF = () => {
    try {
      setIsDownloading(true);

      const doc = new jsPDF("p", "mm", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();

      const invoice = latestInvoiceData;
      const order = latestOrderData;

      const invoiceNo =
        invoice?.invoiceNumber ||
        order?.invoiceNumber ||
        order?.invoiceId ||
        order?._id ||
        "invoice";

      const orderId = order?.orderId || order?._id || invoice?.orderId || "N/A";

      const customerName =
        order?.customer?.name ||
        invoice?.customer?.name ||
        order?.customerName ||
        "N/A";

      const customerEmail =
        order?.customer?.email ||
        invoice?.customer?.email ||
        order?.email ||
        "N/A";

      const paymentMethod =
        order?.paymentMethod ||
        invoice?.paymentMethod ||
        "N/A";

      const paymentStatus =
        order?.paymentStatus ||
        invoice?.paymentStatus ||
        order?.status ||
        "Paid";

      const items =
        order?.items ||
        invoice?.items ||
        order?.products ||
        [];

      const subtotal =
        order?.subtotal ||
        invoice?.subtotal ||
        items.reduce((sum: number, item: any) => {
          const qty = item.quantity || item.qty || 1;
          const price = item.price || item.unitPrice || 0;
          return sum + qty * price;
        }, 0);

      const tax = order?.tax || invoice?.tax || 0;

      const total =
        order?.total ||
        order?.totalAmount ||
        invoice?.total ||
        invoice?.totalAmount ||
        subtotal + tax;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text("RETAIL VERSE", 14, 20);

      doc.setFontSize(18);
      doc.text("INVOICE", pageWidth - 14, 20, { align: "right" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text("Premium E-Commerce", 14, 27);
      doc.text("123 Business Avenue Suite 500", 14, 34);
      doc.text("New Delhi, India 110001", 14, 40);
      doc.text("contact@retailverse.com", 14, 46);

      doc.setFont("helvetica", "bold");
      doc.text(`Invoice No: ${invoiceNo}`, pageWidth - 14, 34, { align: "right" });
      doc.text(`Order ID: ${orderId}`, pageWidth - 14, 42, { align: "right" });

      doc.line(14, 55, pageWidth - 14, 55);

      doc.setFontSize(12);
      doc.text("Billed To", 14, 65);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(String(customerName), 14, 73);
      doc.text(String(customerEmail), 14, 80);

      doc.setFont("helvetica", "bold");
      doc.text("Payment Details", pageWidth - 14, 65, { align: "right" });

      doc.setFont("helvetica", "normal");
      doc.text(`Method: ${paymentMethod}`, pageWidth - 14, 73, { align: "right" });
      doc.text(`Status: ${paymentStatus}`, pageWidth - 14, 80, { align: "right" });

      const tableBody = items.map((item: any) => {
        const name =
          item.name ||
          item.productName ||
          item.title ||
          item.product?.name ||
          "Item";

        const qty = item.quantity || item.qty || 1;
        const price = item.price || item.unitPrice || item.product?.price || 0;
        const amount = item.subtotal || item.total || (qty * price);

        return [
          name,
          String(qty),
          formatINRForPDF(price),
          formatINRForPDF(amount)
        ];
      });

      autoTable(doc, {
        startY: 92,
        head: [["Item", "Qty", "Price", "Amount"]],
        body: tableBody,
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 10,
          cellPadding: 4
        },
        headStyles: {
          fillColor: [245, 245, 245],
          textColor: [0, 0, 0]
        }
      });

      let finalY = (doc as any).lastAutoTable.finalY + 10;

      doc.setFont("helvetica", "bold");
      doc.text("Subtotal:", pageWidth - 60, finalY);
      doc.text(formatINRForPDF(subtotal), pageWidth - 14, finalY, { align: "right" });

      finalY += 8;
      doc.text("Tax:", pageWidth - 60, finalY);
      doc.text(formatINRForPDF(tax), pageWidth - 14, finalY, { align: "right" });

      finalY += 10;
      doc.setFontSize(14);
      doc.text("Total Amount:", pageWidth - 60, finalY);
      doc.text(formatINRForPDF(total), pageWidth - 14, finalY, { align: "right" });

      doc.save(`receipt-${invoiceNo}.pdf`);

      toast.success("PDF downloaded successfully.");
    } catch (error: any) {
      console.error("PDF generation failed:", error);
      toast.error(error?.message || "Failed to generate PDF. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      <ImpersonationBanner />
      <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-84px)] bg-[#f7f6f2] lg:overflow-hidden">
        {/* Products Section */}
        <div className="flex-1 flex flex-col lg:h-full border-b lg:border-b-0 lg:border-r border-black/10 lg:overflow-hidden">
          <div className="p-4 sm:p-6 bg-white/50 backdrop-blur-sm border-b border-black/10">
            <Link
              to="/"
              className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-[#111111] transition-colors mb-3"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Menu</span>
            </Link>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-start mb-3">
              <h1 className="text-2xl font-bold text-[#111111]">Point of Sale</h1>
              <div className="flex flex-col items-start sm:items-end gap-1.5">
                <div
                  className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full w-fit ${networkOnline
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80'
                    : 'bg-amber-50 text-amber-900 border border-amber-200/80'
                    }`}
                  role="status"
                  aria-live="polite"
                >
                  {networkOnline ? (
                    <Wifi className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  )}
                  {networkOnline
                    ? 'Online Mode'
                    : productSource === 'cache'
                      ? 'Offline Mode — cached products'
                      : 'Offline Mode'}
                </div>
                {pendingOfflineCount > 0 ? (
                  <span
                    className="text-[11px] font-medium text-amber-900/90 whitespace-nowrap"
                    title="Orders waiting to sync to the server"
                  >
                    {pendingOfflineCount} offline order{pendingOfflineCount === 1 ? '' : 's'} pending sync
                  </span>
                ) : null}
              </div>
            </div>
            {productSource === 'cache' && (
              <p className="text-xs text-amber-800/90 bg-amber-50/90 border border-amber-200/60 rounded-lg px-3 py-2 mb-3">
                Showing last synced products
              </p>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search products by name or SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black/20 bg-white"
              />
            </div>
            {/* Category filter + Sort row */}
            {!isLoading && products.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2 items-center justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {inventoryCategories.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-all ${
                        selectedCategory === cat
                          ? 'bg-[#111111] text-white border-[#111111]'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
                  className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-black/10 text-gray-600"
                  aria-label="Sort products"
                >
                  <option value="default">Sort: Default</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                  <option value="name-asc">Name: A–Z</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex-1 lg:overflow-y-auto p-4 sm:p-6">
            {/* Dynamic product count */}
            {!isLoading && (
              <p className="text-xs text-gray-500 mb-3">
                {filteredProducts.length === 0
                  ? '0 products found'
                  : `${filteredProducts.length} product${filteredProducts.length === 1 ? '' : 's'} found`}
              </p>
            )}
            {isLoading ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
              </div>
            ) : products.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center max-w-md mx-auto h-48 px-4">
                <Package2 className="w-10 h-10 text-gray-300 mb-3" aria-hidden />
                {!networkOnline ? (
                  <p className="text-sm text-gray-600 leading-relaxed">
                    You are offline. No cached POS products are available yet. Please connect to the internet once to sync products.
                  </p>
                ) : (
                  <p className="text-sm text-gray-600 leading-relaxed">
                    No products found. Please add products from Inventory first.
                  </p>
                )}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center max-w-md mx-auto h-48 px-4">
                <Search className="w-10 h-10 text-gray-300 mb-3" aria-hidden />
                <p className="text-sm text-gray-600 leading-relaxed">
                  No products match your search or filter. Try a different keyword or category.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredProducts.map((product) => {
                  const shop = posProductToShopProduct(product);
                  const wKey = buildWishlistKeyForProduct(shop, wishlistPool);
                  const inWishlist = !!(user && wishlistKeySet.has(wKey));
                  return (
                    <div
                      key={product._id}
                      className="bg-white rounded-2xl p-4 border border-black/5 shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col"
                      onClick={() => addToCart(product)}
                    >
                      <div className="relative aspect-square bg-gray-50 rounded-xl mb-3 flex items-center justify-center overflow-hidden group/card">
                        <button
                          type="button"
                          onClick={(e) => void handlePosWishlist(e, product)}
                          disabled={wishlistBusyKey === wKey}
                          aria-pressed={inWishlist}
                          title={
                            user
                              ? inWishlist
                                ? 'Remove from wishlist'
                                : 'Add to wishlist'
                              : 'Sign in to use wishlist'
                          }
                          className={`absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full border shadow-sm backdrop-blur-sm transition-all duration-300 hover:scale-105 disabled:opacity-60 ${inWishlist
                            ? 'border-red-200/90 bg-red-50/95 text-red-600'
                            : 'border-white/80 bg-white/90 text-[#111111]'
                            }`}
                        >
                          <Heart className={`h-4 w-4 ${inWishlist ? 'fill-current' : ''}`} />
                        </button>
                        {getProductImageUrl(product) ? (
                          <img src={getFullImageUrl(getProductImageUrl(product))} alt={product.name} className="w-full h-full object-cover transition-transform duration-300 group-hover/card:scale-[1.02]" />
                        ) : (
                          <Package2 className="w-10 h-10 text-gray-300" />
                        )}
                        {/* Quick-add button */}
                        <button
                          type="button"
                          title={product.stock > 0 ? 'Add to Cart' : 'Out of stock'}
                          aria-label={`Add ${product.name} to cart`}
                          disabled={product.stock < 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            addToCart(product);
                          }}
                          className={`absolute bottom-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full shadow-md transition-all duration-200 hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${product.stock > 0
                            ? 'bg-purple-600 text-white hover:bg-purple-700 focus-visible:ring-purple-500'
                            : 'cursor-not-allowed bg-gray-300 text-gray-500'
                            }`}
                        >
                          <Plus className="h-4 w-4" strokeWidth={2.5} />
                        </button>
                      </div>
                      <h3 className="font-semibold text-sm line-clamp-2 text-[#111111] mb-1">{product.name}</h3>
                      <div className="text-xs text-gray-500 mb-2">{product.category}</div>

                      <div className="mt-auto flex items-center justify-between">
                        <span className="font-bold text-[#111111]">{formatINR(product.price)}</span>
                        <span className={`text-[10px] px-2 py-1 rounded-full font-medium ${product.stock <= 0
                          ? 'bg-red-100 text-red-700'
                          : product.stock < 10
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-green-100 text-green-700'
                          }`}>
                          {product.stock <= 0
                            ? 'Out of stock'
                            : product.stock < 10
                              ? 'Low Stock'
                              : `${product.stock} in stock`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Cart Section */}
        <div className="w-full lg:w-[350px] xl:w-[400px] flex flex-col bg-white lg:h-full shadow-[-4px_0_24px_rgba(0,0,0,0.02)]">
          <div className="p-5 border-b border-black/5 bg-[#111111] text-white">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Current Order
            </h2>
          </div>

          <div className="flex-1 lg:overflow-y-auto p-5">
            {checkoutComplete && cart.length === 0 ? (
              <div
                className="h-full min-h-[200px] flex flex-col items-center justify-center text-center px-2"
                role="status"
                aria-live="polite"
              >
                <div className="w-full max-w-[320px] rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/90 to-white p-6 shadow-sm">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <CheckCircle2 className="h-8 w-8" aria-hidden />
                  </div>
                  <p className="text-base font-semibold text-[#111111]">
                    {lastCheckoutOffline ? 'Offline order saved' : 'Order placed successfully'}
                  </p>
                  <p className="mt-1.5 text-xs text-gray-600 leading-relaxed">
                    {lastCheckoutOffline
                      ? 'This order is stored on this device and will sync to the server when you are back online.'
                      : 'Thank you. You can start a new order whenever you are ready.'}
                  </p>
                  <Button
                    type="button"
                    className="mt-5 w-full h-12 text-sm font-semibold bg-[#111111] hover:bg-black text-white rounded-xl"
                    onClick={handleContinueShopping}
                  >
                    Continue Shopping
                  </Button>
                </div>
              </div>
            ) : cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 space-y-3">
                <ShoppingCart className="w-12 h-12 opacity-20" />
                <p className="text-sm font-medium text-gray-500">Cart is empty</p>
                <p className="text-xs">Click on products to add them to the order</p>
              </div>
            ) : (
              <div className="space-y-4">
                {currentOrderPreviewItem ? (
                  <div
                    className="rounded-xl border border-black/10 bg-gray-50/90 p-3 shadow-sm transition-shadow"
                    aria-live="polite"
                  >
                    <div className="flex h-[200px] w-full items-center justify-center overflow-hidden rounded-lg bg-white/80">
                      {getProductImageUrl(currentOrderPreviewItem) && !previewImageFailed ? (
                        <img
                          src={getFullImageUrl(getProductImageUrl(currentOrderPreviewItem))}
                          alt=""
                          className="max-h-full max-w-full object-contain"
                          onError={() => setPreviewImageFailed(true)}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-2 text-gray-400">
                          <Package2 className="h-12 w-12 opacity-50" aria-hidden />
                          <span className="text-xs font-medium text-gray-500">No image</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 space-y-0.5 px-0.5">
                      <p className="line-clamp-2 text-sm font-semibold text-[#111111]">
                        {currentOrderPreviewItem.name}
                      </p>
                      <p className="text-sm text-gray-600">{formatINR(currentOrderPreviewItem.price)}</p>
                    </div>

                  </div>
                ) : null}
                <div className="space-y-3">
                  {cart.map(item => {
                    const isSelected = item._id === selectedCartItemId;
                    return (
                      <div
                        key={item._id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedCartItemId(item._id ?? null)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedCartItemId(item._id ?? null);
                          }
                        }}
                        className={`flex cursor-pointer gap-3 items-center rounded-xl p-2 -mx-2 transition-all duration-200 group outline-none focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:ring-offset-2 ${isSelected
                          ? 'bg-gray-50 ring-1 ring-black/12 shadow-sm'
                          : 'hover:bg-gray-50/90'
                          }`}
                        aria-pressed={isSelected}
                        aria-label={`${item.name}, ${isSelected ? 'selected' : 'select for preview'}`}
                      >
                        <div className="h-10 w-10 shrink-0 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center border border-black/5">
                          {getProductImageUrl(item) ? (
                            <img
                              src={getFullImageUrl(getProductImageUrl(item))}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Package2 className="w-5 h-5 text-gray-300" aria-hidden />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-[#111111] text-sm line-clamp-1">{item.name}</div>
                          <div className="text-sm text-gray-500">{formatINR(item.price)}</div>
                        </div>

                        <div
                          className="flex items-center gap-2 bg-gray-50 rounded-lg p-1 border border-gray-100 shrink-0"
                          onClick={e => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              if (item.cartQuantity === 1) {
                                removeFromCart(item._id!);
                              } else {
                                updateQuantity(item._id!, -1);
                              }
                            }}
                            className="w-7 h-7 flex items-center justify-center rounded bg-white shadow-sm text-gray-600 hover:text-black hover:bg-gray-100 transition-colors"
                            aria-label={item.cartQuantity === 1 ? `Remove ${item.name} from cart` : `Decrease ${item.name} quantity`}
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-6 text-center text-sm font-semibold">{item.cartQuantity}</span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item._id!, 1)}
                            className="w-7 h-7 flex items-center justify-center rounded bg-white shadow-sm text-gray-600 hover:text-black hover:bg-gray-100 transition-colors"
                            aria-label={`Increase ${item.name} quantity`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="p-5 bg-gray-50 border-t border-black/5 space-y-4">
            <div className="flex justify-between items-center text-gray-500 text-sm">
              <span>Subtotal</span>
              <span>{formatINR(calculateTotal())}</span>
            </div>
            <div className="flex justify-between items-center text-gray-500 text-sm">
              <span>Tax (0%)</span>
              <span>{formatINR(0)}</span>
            </div>
            <div className="h-px bg-black/10 w-full my-2"></div>
            <div className="flex justify-between items-center text-[#111111] text-xl font-bold">
              <span>Total</span>
              <span>{formatINR(calculateTotal())}</span>
            </div>

            <Button
              className="w-full h-12 text-base font-bold bg-[#111111] hover:bg-black text-white rounded-xl shadow-lg mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={openPaymentStep}
              disabled={cart.length === 0 || orderPlacing || paymentModalOpen}
            >
              Checkout • {formatINR(calculateTotal())}
            </Button>
          </div>
        </div>

        <Dialog open={paymentModalOpen} onOpenChange={handlePaymentDialogOpenChange}>
          <DialogContent className="max-w-md flex flex-col gap-0 overflow-hidden max-h-[90vh] sm:max-h-[95vh] rounded-2xl border-black/10 bg-white p-0 sm:max-w-md [&_[data-slot=dialog-close]]:text-gray-500 [&_[data-slot=dialog-close]]:hover:text-[#111111] [&_[data-slot=dialog-close]]:top-5 [&_[data-slot=dialog-close]]:right-5">
            <div className="shrink-0 px-6 pt-6 pb-4 border-b border-black/5 bg-white z-10">
              <DialogHeader className="text-left pr-6">
                <DialogTitle className="text-xl font-bold text-[#111111]">
                  {modalStep === 'cod-shipping'
                    ? ''
                    : modalStep === 'card-shipping'
                      ? 'Shipping address'
                      : modalStep === 'card-payment'
                        ? 'Card payment'
                        : modalStep === 'invoice'
                          ? 'Invoice Generated'
                          : 'Payment method'}
                </DialogTitle>
                <DialogDescription className="text-sm text-gray-600">
                  {modalStep === 'cod-shipping'
                    ? 'Cash on Delivery — enter the delivery address. Required fields must be completed before placing the order.'
                    : modalStep === 'card-shipping'
                      ? 'Card payment — enter the delivery address, then continue to card details.'
                      : modalStep === 'card-payment'
                        ? 'Enter valid card details, then place the order. Only the last four digits and name are stored with the order.'
                        : modalStep === 'invoice'
                          ? 'Your order has been placed. You can now preview, print or download your invoice.'
                          : 'Choose how the customer will pay, then place the order.'}
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pt-4 pb-8 space-y-4">

              {modalStep === 'invoice' ? (
                <div className="space-y-6">
                  {isFetchingInvoice ? (
                    <div className="flex flex-col items-center justify-center py-12 space-y-4">
                      <div className="relative">
                        <Loader2 className="h-10 w-10 animate-spin text-[#b89146]" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="h-4 w-4 bg-[#b89146]/20 rounded-full animate-pulse"></div>
                        </div>
                      </div>
                      <p className="text-sm font-medium text-gray-500">Preparing your premium invoice...</p>
                    </div>
                  ) : latestInvoiceData ? (
                    <div
                      id="pos-invoice-content"
                      ref={posInvoiceRef}
                      className="invoice-pdf-content bg-[#fffcf5] rounded-2xl border border-[#e6d5b8] p-6 shadow-xl relative overflow-hidden print:shadow-none print:border-none print:p-0 print:bg-white"
                    >
                      {/* Premium Accent Corner */}
                      <div className="absolute top-0 right-0 w-32 h-32 bg-[#b89146]/5 -mr-16 -mt-16 rounded-full blur-2xl print:hidden"></div>

                      {/* Invoice Header */}
                      <div className="flex justify-between items-start mb-8 pb-6 border-b border-[#e6d5b8]/50 relative z-10">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="h-8 w-1.5 bg-[#b89146] rounded-full"></div>
                            <h3 className="text-3xl font-black text-[#111111] tracking-tight">INVOICE</h3>
                          </div>
                          <p className="text-sm text-[#b89146] font-bold tracking-wider">{latestInvoiceData.invoiceNumber}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Order ID:</p>
                            <p className="text-[10px] text-[#111111] font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-black/5">{latestInvoiceData.orderId}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold uppercase tracking-wider mb-4">
                            <CheckCircle2 className="h-3 w-3" />
                            {latestInvoiceData.paymentStatus === 'Paid' || latestInvoiceData.paymentStatus === 'Completed' ? 'Payment Success' : latestInvoiceData.paymentStatus}
                          </div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Issue Date</p>
                          <p className="text-sm font-bold text-[#111111]">
                            {new Date(latestInvoiceData.createdAt || Date.now()).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'long',
                              year: 'numeric'
                            })}
                          </p>
                        </div>
                      </div>

                      {/* Customer Info */}
                      <div className="grid grid-cols-2 gap-8 mb-8 relative z-10">
                        <div className="space-y-3">
                          <p className="text-[10px] font-black text-[#b89146] uppercase tracking-[0.2em]">Billed To</p>
                          <div className="p-3 bg-white/60 rounded-xl border border-[#e6d5b8]/30">
                            <p className="text-sm font-bold text-[#111111]">{latestInvoiceData.customerName}</p>
                            {latestInvoiceData.customerEmail && (
                              <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1.5 italic">
                                {latestInvoiceData.customerEmail}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right space-y-3">
                          <p className="text-[10px] font-black text-[#b89146] uppercase tracking-[0.2em]">Payment Method</p>
                          <div className="p-3 bg-white/60 rounded-xl border border-[#e6d5b8]/30 inline-block min-w-[140px]">
                            <p className="text-sm font-bold text-[#111111]">{latestInvoiceData.paymentMethod}</p>
                            <p className="text-[10px] text-emerald-600 mt-1 font-bold uppercase tracking-tight">Verified Transaction</p>
                          </div>
                        </div>
                      </div>

                      {/* Items Table */}
                      <div className="mb-8 overflow-hidden rounded-2xl border border-[#e6d5b8]/50 bg-white/40 backdrop-blur-sm relative z-10">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-[#b89146]/5 text-[#b89146]">
                              <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest">Item Description</th>
                              <th className="px-5 py-3 text-center text-[10px] font-black uppercase tracking-widest">Qty</th>
                              <th className="px-5 py-3 text-right text-[10px] font-black uppercase tracking-widest">Price</th>
                              <th className="px-5 py-3 text-right text-[10px] font-black uppercase tracking-widest">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#e6d5b8]/20">
                            {latestInvoiceData.items?.map((item: any, idx: number) => (
                              <tr key={idx} className="hover:bg-white/40 transition-colors">
                                <td className="px-5 py-4 font-bold text-[#111111]">{item.name}</td>
                                <td className="px-5 py-4 text-center text-gray-600 font-medium">{item.quantity}</td>
                                <td className="px-5 py-4 text-right text-gray-600 font-medium">{formatINR(item.price)}</td>
                                <td className="px-5 py-4 text-right font-bold text-[#111111]">{formatINR(item.subtotal)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Totals Section */}
                      <div className="flex justify-end relative z-10">
                        <div className="w-full max-w-[240px] space-y-3 p-4 bg-[#b89146]/5 rounded-2xl border border-[#e6d5b8]/30">
                          <div className="flex justify-between text-xs">
                            <span className="font-bold text-gray-500 uppercase tracking-tighter">Subtotal</span>
                            <span className="font-bold text-[#111111]">{formatINR(latestInvoiceData.subtotal)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="font-bold text-gray-500 uppercase tracking-tighter">GST / Tax (0%)</span>
                            <span className="font-bold text-[#111111]">{formatINR(latestInvoiceData.tax || 0)}</span>
                          </div>
                          <div className="pt-3 border-t border-[#b89146]/20 flex justify-between items-center">
                            <span className="text-[10px] font-black text-[#b89146] uppercase tracking-widest">Grand Total</span>
                            <span className="text-xl font-black text-[#111111] drop-shadow-sm">{formatINR(latestInvoiceData.totalAmount)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Footer Note */}
                      <div className="mt-8 text-center">
                        <p className="text-[10px] text-gray-400 font-medium italic">Thank you for your business. We hope to see you again soon!</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-[#fffcf5] rounded-2xl border border-dashed border-[#e6d5b8]">
                      <AlertCircle className="h-8 w-8 text-[#b89146] mx-auto mb-3 opacity-50" />
                      <p className="text-sm font-medium text-gray-500">Could not retrieve invoice details.</p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex flex-col gap-3 pt-2 print:hidden">
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        variant="outline"
                        type="button"
                        disabled={isDownloading}
                        className="h-12 rounded-xl border-[#e6d5b8] bg-white text-[#b89146] hover:bg-[#b89146]/5 hover:text-[#b89146] gap-1.5 font-bold transition-all active:scale-[0.98] text-xs sm:text-sm px-2 disabled:opacity-70"
                        onClick={handleDownloadPDF}
                      >
                        {isDownloading ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 shrink-0" />
                        )}
                        {isDownloading ? 'Downloading...' : 'Download PDF'}
                      </Button>
                      <Button
                        variant="outline"
                        type="button"
                        className="h-12 rounded-xl border-[#e6d5b8] bg-white text-[#b89146] hover:bg-[#b89146]/5 hover:text-[#b89146] gap-1.5 font-bold transition-all active:scale-[0.98] text-xs sm:text-sm px-2"
                        onClick={() => window.print()}
                      >
                        <Printer className="h-4 w-4 shrink-0" />
                        Print
                      </Button>
                      <Button
                        variant="outline"
                        type="button"
                        disabled={emailSending}
                        className="h-12 rounded-xl border-[#b89146] bg-[#b89146]/5 text-[#b89146] hover:bg-[#b89146]/10 hover:text-[#96762e] gap-1.5 font-bold transition-all active:scale-[0.98] text-xs sm:text-sm px-2 disabled:opacity-60"
                        onClick={handleSendInvoiceEmail}
                      >
                        {emailSending ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                        ) : (
                          <Mail className="h-4 w-4 shrink-0" />
                        )}
                        {emailSending ? 'Sending…' : 'Email'}
                      </Button>
                    </div>
                    <Button
                      type="button"
                      className="w-full h-12 rounded-xl bg-[#111111] hover:bg-black text-white font-bold shadow-lg shadow-black/10 transition-all active:scale-[0.98]"
                      onClick={() => {
                        handlePaymentDialogOpenChange(false);
                        setLatestOrderData(null);
                        setLatestInvoiceData(null);
                      }}
                    >
                      Continue Shopping
                    </Button>
                  </div>

                  {/* Email Input Modal — shown when no customer email is available */}
                  {emailModalOpen && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                      <div className="relative w-full max-w-sm mx-4 bg-white rounded-2xl border border-[#e6d5b8] shadow-2xl p-6 animate-in zoom-in-95 slide-in-from-bottom-2 duration-300">
                        <button
                          type="button"
                          className="absolute right-3 top-3 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                          onClick={() => {
                            setEmailModalOpen(false);
                            setEmailInputValue('');
                            setEmailInputError('');
                          }}
                          aria-label="Close"
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <div className="flex items-center gap-2.5 mb-4">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#b89146]/10 text-[#b89146]">
                            <Mail className="h-5 w-5" />
                          </div>
                          <div>
                            <h4 className="text-base font-bold text-[#111111]">Send Invoice via Email</h4>
                            <p className="text-xs text-gray-500">Enter the customer's email address</p>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Input
                            type="email"
                            autoFocus
                            placeholder="customer@example.com"
                            value={emailInputValue}
                            onChange={(e) => {
                              setEmailInputValue(e.target.value);
                              if (emailInputError) setEmailInputError('');
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !emailSending) {
                                e.preventDefault();
                                const v = emailInputValue.trim();
                                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
                                  setEmailInputError('Please enter a valid email address.');
                                } else {
                                  setEmailInputError('');
                                  void sendInvoiceToEmail(v);
                                }
                              }
                            }}
                            disabled={emailSending}
                            aria-invalid={Boolean(emailInputError)}
                            className="h-11 rounded-xl border-black/15 bg-[#f7f6f2]/50 text-sm"
                          />
                          {emailInputError && (
                            <p className="text-xs font-medium text-red-600">{emailInputError}</p>
                          )}
                        </div>
                        <div className="flex gap-2 mt-4">
                          <Button
                            type="button"
                            variant="outline"
                            className="flex-1 h-10 rounded-xl border-black/15 font-semibold text-sm"
                            disabled={emailSending}
                            onClick={() => {
                              setEmailModalOpen(false);
                              setEmailInputValue('');
                              setEmailInputError('');
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            className="flex-1 h-10 rounded-xl bg-[#b89146] hover:bg-[#a07d3a] text-white font-semibold text-sm gap-2 disabled:opacity-60"
                            disabled={emailSending || !emailInputValue.trim()}
                            onClick={() => {
                              const v = emailInputValue.trim();
                              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
                                setEmailInputError('Please enter a valid email address.');
                              } else {
                                setEmailInputError('');
                                void sendInvoiceToEmail(v);
                              }
                            }}
                          >
                            {emailSending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Mail className="h-4 w-4" />
                            )}
                            {emailSending ? 'Sending…' : 'Send Invoice'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-black/10 bg-[#f7f6f2]/80 px-4 py-3">
                    <div className="flex items-center justify-between text-sm text-gray-600">
                      <span>Order total</span>
                      <span className="text-lg font-bold text-[#111111]">{formatINR(calculateTotal())}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5 rounded-xl border border-dashed border-black/15 bg-white/70 px-4 py-3">
                    <Label htmlFor="pos-customer-email" className="text-sm text-[#111111]">
                      Registered customer email <span className="font-normal text-gray-500">(optional)</span>
                    </Label>
                    <Input
                      id="pos-customer-email"
                      type="email"
                      autoComplete="email"
                      placeholder="customer@example.com"
                      value={posCustomerEmail}
                      onChange={e => setPosCustomerEmail(e.target.value)}
                      disabled={orderPlacing}
                      className="h-10 rounded-xl border-black/15 bg-[#f7f6f2]/50"
                    />
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                      If the buyer has a store account, enter their email so this sale counts in the admin customer directory. Leave
                      blank for anonymous walk-in sales.
                    </p>
                  </div>

                  {modalStep === 'cod-shipping' || modalStep === 'card-shipping' ? (
                    <div className="space-y-3 rounded-xl border border-black/10 bg-white p-4 shadow-sm">
                      <p className="text-xs text-gray-500 leading-relaxed">
                        Payment method:{' '}
                        <span className="font-semibold text-[#111111]">
                          {modalStep === 'cod-shipping' ? 'Cash on Delivery (COD)' : 'Card Payment'}
                        </span>
                      </p>
                      <div className="space-y-1.5">
                        <Label htmlFor="pos-cod-full-name" className="text-sm text-[#111111]">
                          Full name
                        </Label>
                        <Input
                          id="pos-cod-full-name"
                          autoComplete="name"
                          placeholder="Customer name"
                          value={codFullName}
                          onChange={e => setCodFullName(e.target.value)}
                          disabled={orderPlacing}
                          aria-invalid={Boolean(shippingFieldErrors.fullName)}
                          className="h-10 rounded-xl border-black/15 bg-[#f7f6f2]/50"
                        />
                        {shippingFieldErrors.fullName ? (
                          <p className="text-xs font-medium text-red-600">{shippingFieldErrors.fullName}</p>
                        ) : null}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pos-cod-phone" className="text-sm text-[#111111]">
                          Phone
                        </Label>
                        <Input
                          id="pos-cod-phone"
                          type="tel"
                          autoComplete="tel"
                          placeholder="Mobile number"
                          value={codPhone}
                          onChange={e => setCodPhone(e.target.value)}
                          disabled={orderPlacing}
                          aria-invalid={Boolean(shippingFieldErrors.phone)}
                          className="h-10 rounded-xl border-black/15 bg-[#f7f6f2]/50"
                        />
                        {shippingFieldErrors.phone ? (
                          <p className="text-xs font-medium text-red-600">{shippingFieldErrors.phone}</p>
                        ) : null}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pos-cod-email" className="text-sm text-[#111111]">
                          Customer email <span className="font-normal text-gray-500">(optional)</span>
                        </Label>
                        <Input
                          id="pos-cod-email"
                          type="email"
                          autoComplete="email"
                          placeholder="Store account email — links this sale in Admin › Customers"
                          value={codEmail}
                          onChange={e => setCodEmail(e.target.value)}
                          disabled={orderPlacing}
                          className="h-10 rounded-xl border-black/15 bg-[#f7f6f2]/50"
                        />
                        <p className="text-[11px] text-gray-500 leading-relaxed">
                          If the buyer has a website account, enter the same email as their login so POS orders count with their online orders.
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pos-cod-addr1" className="text-sm text-[#111111]">
                          Address line 1
                        </Label>
                        <Input
                          id="pos-cod-addr1"
                          autoComplete="address-line1"
                          placeholder="Street, building, unit"
                          value={codAddressLine1}
                          onChange={e => setCodAddressLine1(e.target.value)}
                          disabled={orderPlacing}
                          aria-invalid={Boolean(shippingFieldErrors.addressLine1)}
                          className="h-10 rounded-xl border-black/15 bg-[#f7f6f2]/50"
                        />
                        {shippingFieldErrors.addressLine1 ? (
                          <p className="text-xs font-medium text-red-600">{shippingFieldErrors.addressLine1}</p>
                        ) : null}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pos-cod-addr2" className="text-sm text-[#111111]">
                          Address line 2 <span className="font-normal text-gray-500">(optional)</span>
                        </Label>
                        <Input
                          id="pos-cod-addr2"
                          autoComplete="address-line2"
                          placeholder="Apt, suite, etc."
                          value={codAddressLine2}
                          onChange={e => setCodAddressLine2(e.target.value)}
                          disabled={orderPlacing}
                          aria-invalid={Boolean(shippingFieldErrors.addressLine2)}
                          className="h-10 rounded-xl border-black/15 bg-[#f7f6f2]/50"
                        />
                        {shippingFieldErrors.addressLine2 ? (
                          <p className="text-xs font-medium text-red-600">{shippingFieldErrors.addressLine2}</p>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="pos-cod-city" className="text-sm text-[#111111]">
                            City
                          </Label>
                          <Input
                            id="pos-cod-city"
                            autoComplete="address-level2"
                            placeholder="City"
                            value={codCity}
                            onChange={e => setCodCity(e.target.value)}
                            disabled={orderPlacing}
                            aria-invalid={Boolean(shippingFieldErrors.city)}
                            className="h-10 rounded-xl border-black/15 bg-[#f7f6f2]/50"
                          />
                          {shippingFieldErrors.city ? (
                            <p className="text-xs font-medium text-red-600">{shippingFieldErrors.city}</p>
                          ) : null}
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="pos-cod-state" className="text-sm text-[#111111]">
                            State / region
                          </Label>
                          <Input
                            id="pos-cod-state"
                            autoComplete="address-level1"
                            placeholder="State"
                            value={codState}
                            onChange={e => setCodState(e.target.value)}
                            disabled={orderPlacing}
                            aria-invalid={Boolean(shippingFieldErrors.state)}
                            className="h-10 rounded-xl border-black/15 bg-[#f7f6f2]/50"
                          />
                          {shippingFieldErrors.state ? (
                            <p className="text-xs font-medium text-red-600">{shippingFieldErrors.state}</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="pos-cod-postal" className="text-sm text-[#111111]">
                            Postal code
                          </Label>
                          <Input
                            id="pos-cod-postal"
                            autoComplete="postal-code"
                            placeholder="ZIP / postal"
                            value={codPostalCode}
                            onChange={e => setCodPostalCode(e.target.value)}
                            disabled={orderPlacing}
                            aria-invalid={Boolean(shippingFieldErrors.postalCode)}
                            className="h-10 rounded-xl border-black/15 bg-[#f7f6f2]/50"
                          />
                          {shippingFieldErrors.postalCode ? (
                            <p className="text-xs font-medium text-red-600">{shippingFieldErrors.postalCode}</p>
                          ) : null}
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="pos-cod-country" className="text-sm text-[#111111]">
                            Country
                          </Label>
                          <Input
                            id="pos-cod-country"
                            autoComplete="country-name"
                            placeholder="Country"
                            value={codCountry}
                            onChange={e => setCodCountry(e.target.value)}
                            disabled={orderPlacing}
                            aria-invalid={Boolean(shippingFieldErrors.country)}
                            className="h-10 rounded-xl border-black/15 bg-[#f7f6f2]/50"
                          />
                          {shippingFieldErrors.country ? (
                            <p className="text-xs font-medium text-red-600">{shippingFieldErrors.country}</p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : modalStep === 'card-payment' ? (
                    <div className="space-y-3 rounded-xl border border-black/10 bg-white p-4 shadow-sm">
                      <p className="text-xs text-gray-500 leading-relaxed">
                        Card details are validated here only. Only the last four digits and name are stored with the order.
                      </p>
                      <div className="space-y-1.5">
                        <Label htmlFor="pos-card-name" className="text-sm text-[#111111]">
                          Cardholder name
                        </Label>
                        <Input
                          id="pos-card-name"
                          autoComplete="cc-name"
                          placeholder="Name on card"
                          value={cardholderName}
                          onChange={e => setCardholderName(e.target.value)}
                          disabled={orderPlacing}
                          aria-invalid={Boolean(paymentFieldErrors.cardholderName)}
                          className="h-10 rounded-xl border-black/15 bg-[#f7f6f2]/50"
                        />
                        {paymentFieldErrors.cardholderName ? (
                          <p className="text-xs font-medium text-red-600">{paymentFieldErrors.cardholderName}</p>
                        ) : null}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pos-card-number" className="text-sm text-[#111111]">
                          Card number
                        </Label>
                        <Input
                          id="pos-card-number"
                          inputMode="numeric"
                          autoComplete="cc-number"
                          placeholder="•••• •••• •••• ••••"
                          value={cardNumber}
                          onChange={e => setCardNumber(e.target.value)}
                          disabled={orderPlacing}
                          aria-invalid={Boolean(paymentFieldErrors.cardNumber)}
                          className="h-10 rounded-xl border-black/15 bg-[#f7f6f2]/50"
                        />
                        {paymentFieldErrors.cardNumber ? (
                          <p className="text-xs font-medium text-red-600">{paymentFieldErrors.cardNumber}</p>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="pos-card-expiry" className="text-sm text-[#111111]">
                            Expiry date
                          </Label>
                          <Input
                            id="pos-card-expiry"
                            inputMode="numeric"
                            autoComplete="cc-exp"
                            placeholder="MM/YY"
                            value={expiryDate}
                            onChange={e => setExpiryDate(e.target.value)}
                            disabled={orderPlacing}
                            aria-invalid={Boolean(paymentFieldErrors.expiryDate)}
                            className="h-10 rounded-xl border-black/15 bg-[#f7f6f2]/50"
                          />
                          {paymentFieldErrors.expiryDate ? (
                            <p className="text-xs font-medium text-red-600">{paymentFieldErrors.expiryDate}</p>
                          ) : null}
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="pos-card-cvv" className="text-sm text-[#111111]">
                            CVV
                          </Label>
                          <Input
                            id="pos-card-cvv"
                            type="password"
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder="•••"
                            value={cvv}
                            onChange={e => setCvv(e.target.value)}
                            disabled={orderPlacing}
                            aria-invalid={Boolean(paymentFieldErrors.cvv)}
                            className="h-10 rounded-xl border-black/15 bg-[#f7f6f2]/50"
                          />
                          {paymentFieldErrors.cvv ? (
                            <p className="text-xs font-medium text-red-600">{paymentFieldErrors.cvv}</p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-2" role="radiogroup" aria-label="Payment method">
                        {POS_PAYMENT_OPTIONS.map(({ value, label, icon: Icon }) => {
                          const selected = selectedPaymentMethod === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              disabled={orderPlacing}
                              onClick={() => {
                                setPaymentValidationMessage(null);
                                setPaymentFieldErrors({});
                                setShippingFieldErrors({});
                                if (value === 'cod') {
                                  setSelectedPaymentMethod('cod');
                                  setModalStep('cod-shipping');
                                  setSwipePaymentStatus('idle');
                                } else if (value === 'card') {
                                  setSelectedPaymentMethod('card');
                                  setModalStep('card-shipping');
                                  setSwipePaymentStatus('idle');
                                } else {
                                  setSelectedPaymentMethod(value);
                                  setModalStep('payment');
                                  if (value === 'swipe') {
                                    setSwipePaymentStatus('waiting');
                                  } else {
                                    setSwipePaymentStatus('idle');
                                  }
                                }
                              }}
                              className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${selected
                                ? 'border-[#111111] bg-gray-50 ring-2 ring-[#111111]/15'
                                : 'border-black/10 bg-white hover:border-black/20 hover:bg-gray-50/80'
                                } disabled:cursor-not-allowed disabled:opacity-60`}
                            >
                              <span
                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${selected ? 'border-[#111111]/20 bg-white text-[#111111]' : 'border-black/10 bg-gray-50 text-gray-600'
                                  }`}
                              >
                                <Icon className="h-5 w-5" aria-hidden />
                              </span>
                              <span className="font-semibold text-[#111111] text-sm">{label}</span>
                            </button>
                          );
                        })}
                      </div>

                      {selectedPaymentMethod === 'upi' ? (
                        <div className="space-y-3 rounded-xl border border-black/10 bg-white p-4 shadow-sm">
                          <p className="text-xs text-gray-500 leading-relaxed">
                            Enter the customer&apos;s UPI ID (e.g. name@upi).
                          </p>
                          <div className="space-y-1.5">
                            <Label htmlFor="pos-upi-id" className="text-sm text-[#111111]">
                              UPI ID
                            </Label>
                            <Input
                              id="pos-upi-id"
                              autoComplete="off"
                              placeholder="customer@upi"
                              value={upiId}
                              onChange={e => setUpiId(e.target.value)}
                              disabled={orderPlacing}
                              aria-invalid={Boolean(paymentFieldErrors.upiId)}
                              className="h-10 rounded-xl border-black/15 bg-[#f7f6f2]/50"
                            />
                            {paymentFieldErrors.upiId ? (
                              <p className="text-xs font-medium text-red-600">{paymentFieldErrors.upiId}</p>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      {selectedPaymentMethod === 'swipe' ? (
                        <div className="space-y-4 rounded-xl border border-black/10 bg-white p-5 shadow-sm animate-in fade-in slide-in-from-bottom-2">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-bold text-[#111111] flex items-center gap-2">
                              <CreditCard className="w-5 h-5 text-blue-600" />
                              Cash Payment
                            </p>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                              {swipePaymentStatus === 'waiting' && (
                                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                                  <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                  </span>
                                  Waiting for Payment
                                </span>
                              )}
                              {swipePaymentStatus === 'processing' && (
                                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                  Processing...
                                </span>
                              )}
                              {swipePaymentStatus === 'success' && (
                                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                                  <CheckCircle2 className="h-2.5 w-2.5" />
                                  Payment Successful
                                </span>
                              )}
                              {swipePaymentStatus === 'failed' && (
                                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-100">
                                  <AlertCircle className="h-2.5 w-2.5" />
                                  Payment Failed
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-gray-600 leading-relaxed">
                            Cash payment received. Click &quot;Confirm Payment&quot; to finalize the order.
                          </p>

                          {swipePaymentStatus === 'success' && (
                            <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-50/50 border border-emerald-100 p-2.5 text-emerald-800 text-xs animate-in zoom-in-95 duration-300">
                              <CheckCircle2 className="h-4 w-4 shrink-0" />
                              <p>Cash payment verified. Order finalized.</p>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </>
                  )}

                  {modalStep === 'payment' && paymentValidationMessage ? (
                    <p className="text-sm font-medium text-red-600" role="alert">
                      {paymentValidationMessage}
                    </p>
                  ) : null}
                </>
              )}
            </div>

            {modalStep !== 'invoice' && (
              <div className="shrink-0 border-t border-black/5 bg-white px-6 py-4 z-10">
                <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end sm:gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full rounded-xl border-black/15 sm:w-auto"
                    disabled={orderPlacing}
                    onClick={() => {
                      if (modalStep === 'cod-shipping' || modalStep === 'card-shipping') {
                        goBackFromShippingStep();
                      } else if (modalStep === 'card-payment') {
                        goBackFromCardPaymentStep();
                      } else {
                        handlePaymentDialogOpenChange(false);
                      }
                    }}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    className="w-full rounded-xl bg-[#111111] font-semibold text-white hover:bg-black sm:w-auto"
                    disabled={orderPlacing}
                    onClick={handlePlaceOrder}
                  >
                    {orderPlacing
                      ? 'Placing order…'
                      : modalStep === 'card-shipping'
                        ? 'Continue'
                        : selectedPaymentMethod === 'swipe'
                          ? 'Confirm Payment'
                          : 'Place Order'}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {showAddedToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[#111111] text-white px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold flex items-center gap-2 transition-all duration-300">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Added to cart
        </div>
      )}
    </>
  );
}
