import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, AlertCircle, Package, Hash, Tag, IndianRupee, Database, Image as ImageIcon, FileText, Camera, Store, Barcode } from 'lucide-react';
import api from '../../api/apiService';
import * as marketplaceApi from '../../services/marketplaceApi';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../ui/button';
import { Product } from '../../api/products';
import type { ClientRow } from '../../api/clients';
import type { InventoryEditMode } from '../../utils/inventoryPermissions';

function useScrollLock(lock: boolean) {
  useLayoutEffect(() => {
    if (!lock) return;
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, [lock]);
}

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (product: Product | Partial<Product>) => Promise<void>;
  product?: Product | null;
  mode: 'add' | 'edit';
  /** add mode always uses full form; edit mode respects this (mirrors backend roles). */
  inventoryEditMode?: InventoryEditMode;
  viewerRole?: string;
  assignableClients?: ClientRow[];
}

export function ProductModal({
  isOpen,
  onClose,
  onSave,
  product,
  mode,
  inventoryEditMode = 'admin',
  viewerRole,
  assignableClients = [],
}: ProductModalProps) {
  const isLimitedCopyEdit = mode === 'edit' && inventoryEditMode === 'inventory_manager';
  const showClientAssign =
    mode === 'add' &&
    viewerRole === 'super_admin' &&
    Array.isArray(assignableClients) &&
    assignableClients.length > 0;
  const [assignClientId, setAssignClientId] = useState('');
  const [connectedMarketplaces, setConnectedMarketplaces] = useState<string[]>([]);
  const [selectedMarketplaces, setSelectedMarketplaces] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    productName: '',
    sku: '',
    barcode: '',
    category: '',
    unitPrice: 0,
    stockLevel: 0,
    imageUrl: '',
    description: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const skuInputRef = useRef<HTMLInputElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showCameraCapture, setShowCameraCapture] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [isSkuFocused, setIsSkuFocused] = useState(false);
  const [isBarcodeFocused, setIsBarcodeFocused] = useState(false);
  const [scanStatusMessage, setScanStatusMessage] = useState<string | null>(null);

  const focusSkuInput = () => {
    skuInputRef.current?.focus();
  };

  const focusBarcodeInput = () => {
    barcodeInputRef.current?.focus();
  };

  const handleSkuKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const scannedSku = formData.sku?.trim();
      if (scannedSku) {
        setScanStatusMessage("SKU captured");
        if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
        statusTimeoutRef.current = setTimeout(() => {
          setScanStatusMessage(null);
        }, 2500);
      }
      barcodeInputRef.current?.focus();
    }
  };

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const scannedBarcode = formData.barcode?.trim();
      if (scannedBarcode) {
        setScanStatusMessage("Barcode captured");
        if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
        statusTimeoutRef.current = setTimeout(() => {
          setScanStatusMessage(null);
        }, 2500);
      }
      categoryRef.current?.focus();
    }
  };

  const stopCameraStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  /** Add mode: in-app webcam via getUserMedia. Edit mode: file picker. Fallback: file picker if webcam unavailable or denied. */
  const handleCameraClick = async () => {
    if (mode !== 'add') {
      fileInputRef.current?.click();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      setCameraReady(false);
      setShowCameraCapture(true);
    } catch {
      fileInputRef.current?.click();
    }
  };

  useEffect(() => {
    if (!showCameraCapture || !videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    video.play().catch(() => { });
  }, [showCameraCapture]);

  const handleCameraCancel = () => {
    stopCameraStream();
    setShowCameraCapture(false);
  };

  const handleCapturePhoto = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setFormData((prev) => ({ ...prev, imageUrl: dataUrl }));
    stopCameraStream();
    setShowCameraCapture(false);
  };

  useEffect(() => {
    if (!isOpen) {
      stopCameraStream();
      setShowCameraCapture(false);
      setScanStatusMessage(null);
      setIsSkuFocused(false);
    }
  }, [isOpen, stopCameraStream]);

  useEffect(() => {
    return () => {
      stopCameraStream();
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    };
  }, [stopCameraStream]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData((prev) => ({ ...prev, imageUrl: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (product && mode === 'edit') {
      setFormData({
        productName: product.name || '',
        sku: product.sku || '',
        barcode: product.barcode || product.sku || '',
        category: product.category || '',
        unitPrice: product.price || 0,
        stockLevel: product.stock || 0,
        imageUrl: product.image || '',
        description: product.description || '',
      });
    } else {
      setFormData({
        productName: '',
        sku: '',
        barcode: '',
        category: '',
        unitPrice: 0,
        stockLevel: 0,
        imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&q=80&w=1470',
        description: '',
      });
      setSelectedMarketplaces([]);
    }
    setAssignClientId('');
    setError(null);
  }, [product, mode, isOpen]);

  useEffect(() => {
    if (isOpen && mode === 'add') {
      marketplaceApi.getMarketplaceConnections()
        .then((connData: any) => {
          const connections = Array.isArray(connData) ? connData : (connData.connections || []);
          const activeMps = connections
            .filter((c: any) => c.status === 'connected')
            .map((c: any) => c.marketplace);
          setConnectedMarketplaces(activeMps);
          setSelectedMarketplaces(activeMps); // Auto select connected marketplaces by default
        })
        .catch(err => {
          console.error('[ProductModal] Failed to fetch marketplace connections:', err.message);
          setConnectedMarketplaces([]);
        });
    }
  }, [isOpen, mode]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'unitPrice' || name === 'stockLevel' ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    // Explicit Validation
    const missingFields: string[] = [];
    if (mode === 'add') {
      if (!formData.productName.trim()) missingFields.push("Product Name");
      if (!formData.sku.trim()) missingFields.push("SKU Code");
      if (!formData.category) missingFields.push("Category");
      if (!formData.imageUrl.trim()) missingFields.push("Image URL");
    }
    if (formData.unitPrice < 0) {
      setError("Unit Price cannot be negative");
      setIsSubmitting(false);
      return;
    }
    if (formData.stockLevel < 0) {
      setError("Stock Level cannot be negative");
      setIsSubmitting(false);
      return;
    }

    if (mode === 'add' && missingFields.length > 0) {
      setError(`Please fill in all required fields: ${missingFields.join(", ")}`);
      setIsSubmitting(false);
      return;
    }

    let mappedPayload: Product | Partial<Product>;
    if (isLimitedCopyEdit) {
      // inventory_manager: persist only changed title/description fields.
      const originalName = product?.name || '';
      const originalDescription = product?.description ?? '';
      const nameChanged = formData.productName !== originalName;
      const descChanged = (formData.description ?? '') !== originalDescription;
      const limitedPayload: Partial<Product> = {};

      if (nameChanged) limitedPayload.title = formData.productName;
      if (descChanged) limitedPayload.description = formData.description ?? '';

      // Keep existing behavior safe when nothing appears changed.
      if (!nameChanged && !descChanged) {
        limitedPayload.description = formData.description ?? '';
      }

      mappedPayload = limitedPayload;
    } else if (mode === 'edit' && product?._id) {
      // Merge form data with original product data so that all required
      // backend fields (name, sku, category, price, stock) are always present.
      const finalSku = (formData.sku || product.sku || '').trim();
      const finalBarcode = (formData.barcode || '').trim() || finalSku || (product.barcode || product.sku || '').trim();
      mappedPayload = {
        name: formData.productName || product.name || '',
        sku: finalSku,
        barcode: finalBarcode,
        category: formData.category || product.category || '',
        price: formData.unitPrice ?? product.price ?? 0,
        stock: Number(formData.stockLevel) ?? product.stock ?? 0,
        image: formData.imageUrl || product.image || '',
        description: formData.description ?? product.description ?? '',
      };
    } else {
      const finalSku = formData.sku.trim();
      const finalBarcode = (formData.barcode || '').trim() || finalSku;
      mappedPayload = {
        name: formData.productName.trim(),
        sku: finalSku,
        barcode: finalBarcode,
        category: formData.category,
        price: formData.unitPrice,
        stock: formData.stockLevel,
        image: formData.imageUrl,
        description: formData.description,
        publishTo: selectedMarketplaces,
      };
      if (showClientAssign && assignClientId) {
        (mappedPayload as Product).clientId = assignClientId;
      }
    }

    console.log("[Frontend Debug] Submitting Product Data:", mappedPayload);

    try {
      await onSave(mappedPayload);
      onClose();
    } catch (err: any) {
      console.error("[Frontend Debug] Error in handleSaveProduct:", err.message);
      
      // Extract error message from API response if possible
      let friendlyError = "Something went wrong. Please try again.";
      if (err.response?.data?.message) {
        friendlyError = err.response.data.message;
      } else if (err.message) {
        friendlyError = err.message;
      }
      
      setError(friendlyError);
    } finally {
      setIsSubmitting(false);
    }
  };

  useScrollLock(isOpen);

  if (!isOpen) return null;

  const modalContent = (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] bg-black/40" onClick={onClose}>
        <div className="fixed inset-0 z-[101] flex items-center justify-center overflow-y-auto p-2 sm:p-4" onClick={(e) => e.stopPropagation()}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative flex w-full max-w-2xl flex-col rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-[#09090b] max-h-[calc(100dvh-24px)] min-h-0"
          >
            {showCameraCapture && mode === 'add' && (
              <div className="absolute inset-0 z-[60] flex flex-col bg-black/90 p-4">
                <p className="text-sm text-white/90 mb-2 text-center">Camera preview</p>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  onLoadedMetadata={() => setCameraReady(true)}
                  className="w-full flex-1 min-h-[180px] max-h-[280px] object-contain rounded-lg bg-black"
                />
                <div className="flex justify-center gap-3 mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCameraCancel}
                    className="rounded-xl border-white/30 text-white hover:bg-white/10"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleCapturePhoto}
                    disabled={!cameraReady}
                    className="rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    Capture photo
                  </Button>
                </div>
              </div>
            )}

            {/* Header */}
            <div className="shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-white/5 flex items-center justify-between gap-3 bg-gray-50/50 dark:bg-white/[0.02]">
            <div className="flex min-w-0 items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                {mode === 'add' ? <Package className="w-5 h-5" /> : <Save className="w-5 h-5" />}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {mode === 'add' ? 'Add New Product' : 'Edit Product'}
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {mode === 'add'
                    ? 'Fill in the details to create a new inventory item'
                    : isLimitedCopyEdit
                      ? 'You can update the product title and description only'
                      : 'Update the existing product information'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-gray-200 dark:hover:bg-white/10 rounded-full transition-colors text-gray-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <form onSubmit={handleSubmit} className="px-4 sm:px-6 py-3 sm:py-4 pb-24 sm:pb-28">
              <button type="submit" className="hidden" />
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm flex items-center gap-3"
                >
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  {error}
                </motion.div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                {/* Name */}
                <div className={`space-y-2 ${isLimitedCopyEdit ? 'md:col-span-2' : ''}`}>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-indigo-500" />
                    {isLimitedCopyEdit ? 'Product title' : 'Product Name'}
                  </label>
                  <input
                    type="text"
                    name="productName"
                    required
                    value={formData.productName}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-400"
                    placeholder="e.g. Wireless Headset"
                  />
                </div>

                {!isLimitedCopyEdit && (
                  <>
                    {/* SKU */}
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        <Hash className="w-4 h-4 text-indigo-500" />
                        SKU Code
                      </label>
                      <div className="relative flex items-center">
                        <input
                          ref={skuInputRef}
                          type="text"
                          name="sku"
                          required
                          maxLength={100}
                          value={formData.sku}
                          onChange={handleChange}
                          onKeyDown={handleSkuKeyDown}
                          onFocus={() => setIsSkuFocused(true)}
                          onBlur={() => setIsSkuFocused(false)}
                          className="w-full pl-4 pr-11 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-400"
                          placeholder="Scan barcode or enter SKU"
                        />
                        <button
                          type="button"
                          onClick={focusSkuInput}
                          aria-label="Focus SKU field for barcode scanning"
                          title="Focus SKU field for barcode scanning"
                          className="absolute right-2 p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        >
                          <Barcode className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between text-xs mt-1">
                        <span className="text-gray-500 dark:text-gray-400">
                          Click the SKU field and scan the product barcode.
                        </span>
                        {scanStatusMessage ? (
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">
                            {scanStatusMessage}
                          </span>
                        ) : isSkuFocused ? (
                          <span className="font-medium text-indigo-600 dark:text-indigo-400">
                            Scanner ready
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Barcode */}
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        <Barcode className="w-4 h-4 text-purple-500" />
                        Barcode (Optional)
                      </label>
                      <div className="relative flex items-center">
                        <input
                          ref={barcodeInputRef}
                          type="text"
                          name="barcode"
                          autoComplete="off"
                          maxLength={64}
                          value={formData.barcode}
                          onChange={handleChange}
                          onKeyDown={handleBarcodeKeyDown}
                          onFocus={() => setIsBarcodeFocused(true)}
                          onBlur={() => setIsBarcodeFocused(false)}
                          className="w-full pl-4 pr-11 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all placeholder:text-gray-400 font-mono"
                          placeholder="Leave blank to use SKU as barcode"
                        />
                        <button
                          type="button"
                          onClick={focusBarcodeInput}
                          aria-label="Focus Barcode field for barcode scanning"
                          title="Focus Barcode field for barcode scanning"
                          className="absolute right-2 p-1.5 rounded-lg text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                        >
                          <Barcode className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between text-xs mt-1">
                        <span className="text-gray-500 dark:text-gray-400">
                          Leave blank to use SKU as barcode.
                        </span>
                        {isBarcodeFocused ? (
                          <span className="font-medium text-purple-600 dark:text-purple-400">
                            Scanner ready
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Category */}
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        <Database className="w-4 h-4 text-indigo-500" />
                        Category
                      </label>
                      <select
                        ref={categoryRef}
                        name="category"
                        required
                        value={formData.category}
                        onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                      >
                        <option value="">Select Category</option>
                        <option value="Electronics">Electronics</option>
                        <option value="Accessories">Accessories</option>
                        <option value="Food & Beverage">Food & Beverage</option>
                        <option value="Home & Living">Home & Living</option>
                        <option value="Health & Beauty">Health & Beauty</option>
                        <option value="Footwear">Footwear</option>
                        <option value="Sports & Fitness">Sports & Fitness</option>
                      </select>
                    </div>

                    {/* Price */}
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        <IndianRupee className="w-4 h-4 text-indigo-500" />
                        Unit Price (₹)
                      </label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400 dark:text-slate-500">₹</span>
                        <input
                          type="number"
                          name="unitPrice"
                          required
                          min="0"
                          step="0.01"
                          value={formData.unitPrice}
                          onChange={handleChange}
                          className="w-full pl-7 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    {/* Stock */}
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        <Package className="w-4 h-4 text-indigo-500" />
                        Stock Level
                      </label>
                      <input
                        type="number"
                        name="stockLevel"
                        required
                        min="0"
                        value={formData.stockLevel}
                        onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                        placeholder="0"
                      />
                    </div>

                    {showClientAssign && (
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                          <Database className="w-4 h-4 text-indigo-500" />
                          Assign to client (optional)
                        </label>
                        <select
                          value={assignClientId}
                          onChange={(e) => setAssignClientId(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                        >
                          <option value="">No assignment</option>
                          {assignableClients.map((c) => (
                            <option key={c._id} value={c._id}>
                              {c.shopName || c.companyName} ({c.companyName})
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Leave unassigned for legacy catalog items, or pick a client so the inventory table shows their shop name.
                        </p>
                      </div>
                    )}

                    {/* Image URL */}
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-indigo-500" />
                        Image URL
                      </label>
                      <div className="flex gap-3">
                        <div className="flex-1 flex gap-2">
                          <input
                            type="text"
                            name="imageUrl"
                            value={formData.imageUrl}
                            onChange={handleChange}
                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-400"
                            placeholder="https://images.unsplash.com/..."
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleCameraClick}
                            className="shrink-0 rounded-xl h-[46px] w-[46px] p-0 border-gray-200 dark:border-white/10 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-white/5"
                            title="Take photo"
                          >
                            <Camera className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                          </Button>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                          />
                        </div>
                        <div className="h-[46px] w-[46px] shrink-0 rounded-xl overflow-hidden border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-white/5">
                          <img
                            src={formData.imageUrl || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&q=80&w=1470'}
                            alt="Preview"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=100&h=100&fit=crop';
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Publish To Marketplaces Checkboxes */}
                    {mode === 'add' && (
                      <div className="space-y-3 md:col-span-2 border-t border-gray-100 dark:border-white/5 pt-4">
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                          <Store className="w-4.5 h-4.5 text-indigo-500" />
                          Publish To Connected Marketplaces
                        </label>
                        {connectedMarketplaces.length === 0 ? (
                          <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-150 dark:border-zinc-800 text-xs text-slate-500 leading-relaxed">
                            No connected accounts found. You can link your Amazon, Flipkart, or Shopify stores in the{' '}
                            <a href="/dashboard/marketplaces" className="text-indigo-600 font-semibold hover:underline">
                              Marketplaces Settings
                            </a>{' '}
                            to auto-publish listings.
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {[
                              { id: 'amazon', name: 'Amazon' },
                              { id: 'flipkart', name: 'Flipkart' },
                              { id: 'shopify', name: 'Shopify' }
                            ].map((mp) => {
                              const isConnected = connectedMarketplaces.includes(mp.id);
                              const isSelected = selectedMarketplaces.includes(mp.id);
                              return (
                                <label
                                  key={mp.id}
                                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-200 select-none ${
                                    isSelected
                                      ? 'border-indigo-500 bg-indigo-50/20 dark:border-indigo-500/30 dark:bg-indigo-950/20 shadow-sm'
                                      : isConnected
                                        ? 'border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'
                                        : 'border-gray-100 dark:border-white/5 bg-gray-50/30 dark:bg-white/[0.01] opacity-50 cursor-not-allowed'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    disabled={!isConnected}
                                    onChange={() => {
                                      if (isSelected) {
                                        setSelectedMarketplaces(prev => prev.filter(id => id !== mp.id));
                                      } else {
                                        setSelectedMarketplaces(prev => [...prev, mp.id]);
                                      }
                                    }}
                                    className="rounded text-indigo-600 focus:ring-indigo-500/20 w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
                                  />
                                  <div className="min-w-0 leading-tight">
                                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 truncate">{mp.name}</p>
                                    <p className="text-[10px] text-gray-400">
                                      {isConnected ? 'Connected' : 'Not Connected'}
                                    </p>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Description */}
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-500" />
                    Description
                  </label>
                  <textarea
                    name="description"
                    rows={isLimitedCopyEdit ? 5 : 3}
                    value={formData.description}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-400 resize-none"
                    placeholder="Tell something about the product..."
                  />
                </div>
              </div>

            </form>
          </div>

          {/* Footer - always visible */}
          <div className="shrink-0 border-t border-gray-200 bg-white dark:border-white/10 dark:bg-[#09090b] px-4 py-3 flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="rounded-xl h-11 px-6 border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 font-bold"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmit}
              className="rounded-xl h-11 px-8 bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:opacity-90 shadow-lg shadow-indigo-500/20 font-bold transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </div>
              ) : (
                mode === 'add' ? 'Create Product' : 'Save Changes'
              )}
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
    </AnimatePresence >
  );

  return createPortal(modalContent, document.body);
}
