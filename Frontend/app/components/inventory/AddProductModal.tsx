import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Scan,
  Sparkles,
  RefreshCw,
  Upload,
  Camera,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Barcode as BarcodeIcon,
  Tag,
  Hash,
  IndianRupee,
  Layers,
  Box,
  FileText,
  Printer,
  Trash2,
} from 'lucide-react';
import JsBarcode from 'jsbarcode';
import api from '../../api/apiService';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { CameraScannerModal } from './CameraScannerModal';
import { broadcastProductSync } from '../../utils/posProductSync';

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProductCreated?: (product: any) => void;
}

export function AddProductModal({ isOpen, onClose, onProductCreated }: AddProductModalProps) {
  // Form State
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState('General');
  const [price, setPrice] = useState<number | ''>('');
  const [stockLevel, setStockLevel] = useState<number | ''>(0);
  const [gst, setGst] = useState<number | ''>(0);
  const [description, setDescription] = useState('');
  const [dimensions, setDimensions] = useState({
    length: '' as number | '',
    width: '' as number | '',
    height: '' as number | '',
  });

  // Photo State (Mandatory)
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string>('');

  // UI Control States
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [printCopies, setPrintCopies] = useState<number>(1);

  // Refs
  const barcodeSvgRef = useRef<SVGSVGElement | null>(null);
  const printBarcodeSvgRef = useRef<SVGSVGElement | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);
  const productNameInputRef = useRef<HTMLInputElement | null>(null);
  const fileUploadInputRef = useRef<HTMLInputElement | null>(null);
  const cameraCaptureInputRef = useRef<HTMLInputElement | null>(null);

  // Generate SKU: RV-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}
  const generateAutoSku = useCallback((): string => {
    const timestampPart = Date.now().toString().slice(-6);
    const randomPart = Math.floor(1000 + Math.random() * 9000);
    return `RV-${timestampPart}-${randomPart}`;
  }, []);

  // Generate 12-digit numeric barcode
  const generate12DigitBarcode = useCallback((): string => {
    // 12-digit collision-resistant numeric string
    const part1 = Date.now().toString().slice(-7);
    const part2 = Math.floor(10000 + Math.random() * 90000).toString();
    return `${part1}${part2}`;
  }, []);

  // Initialize or reset form when modal opens, and auto-focus barcode field for hardware scanners
  useEffect(() => {
    if (isOpen) {
      const initialSku = generateAutoSku();
      setSku(initialSku);
      setName('');
      setBarcode('');
      setCategory('General');
      setPrice('');
      setStockLevel(0);
      setGst(0);
      setDescription('');
      setDimensions({ length: '', width: '', height: '' });
      setImagePreview(null);
      setImageBase64('');
      setValidationErrors({});

      // Auto-focus barcode input so handheld hardware scanners immediately write into it
      const focusTimer = setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 150);
      return () => clearTimeout(focusTimer);
    }
  }, [isOpen, generateAutoSku]);

  // Prevent background scrolling while modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Hardware Scanner Global Wedge Buffer Listener (handles rapid keystrokes from USB/Bluetooth scanners)
  useEffect(() => {
    if (!isOpen || isScannerOpen) return;

    let scanBuffer = '';
    let lastKeyTime = 0;

    const handleHardwareScan = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in textarea or general inputs unless rapid keystrokes indicate hardware scanner
      const target = e.target as HTMLElement;
      const isTargetInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      if (e.key === 'Enter') {
        // If buffer has multiple characters received within hardware scanner speed (< 50ms per key)
        if (scanBuffer.length >= 3) {
          e.preventDefault();
          e.stopPropagation();
          const capturedCode = scanBuffer.trim();
          setBarcode(capturedCode);
          setValidationErrors((prev) => {
            const next = { ...prev };
            delete next.barcode;
            return next;
          });
          toast.success(`Hardware scanner captured: ${capturedCode}`);
          productNameInputRef.current?.focus();
          scanBuffer = '';
        }
        return;
      }

      // If key is single printable character
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (timeDiff > 60) {
          // Normal human typing speed, reset buffer
          scanBuffer = e.key;
        } else {
          // High speed typing (< 60ms) typical of hardware barcode scanners
          scanBuffer += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleHardwareScan, true);
    return () => {
      window.removeEventListener('keydown', handleHardwareScan, true);
    };
  }, [isOpen, isScannerOpen]);

  // Render exact barcode to all printable SVG elements in #print-label-area
  const renderPrintBarcode = useCallback((codeToRender: string) => {
    const trimmedCode = codeToRender ? codeToRender.trim() : '';
    if (!trimmedCode) return false;

    const svgs = document.querySelectorAll<SVGSVGElement>(
      '#print-label-area .barcode-print-svg, #barcode-print'
    );
    if (!svgs || svgs.length === 0) return false;

    let successCount = 0;
    svgs.forEach((svgElem) => {
      try {
        (JsBarcode as any)(svgElem, trimmedCode, {
          format: 'CODE128',
          lineColor: '#000000',
          width: 1.8,
          height: 48,
          displayValue: true,
          fontSize: 12,
          font: 'monospace',
          textMargin: 2,
          margin: 4,
          background: '#ffffff',
        });
        successCount++;
      } catch (err) {
        console.error('[AddProductModal] Print barcode SVG render error:', err);
      }
    });

    return successCount > 0;
  }, []);

  // Sync print copies with stockLevel when stockLevel changes and is valid
  useEffect(() => {
    if (stockLevel !== '' && !isNaN(Number(stockLevel)) && Number(stockLevel) > 0) {
      setPrintCopies(Number(stockLevel));
    }
  }, [stockLevel]);

  // Live Barcode SVG Rendering & Print Barcode Sync (updates on barcode OR printCopies change)
  useEffect(() => {
    if (barcode.trim()) {
      if (barcodeSvgRef.current) {
        try {
          (JsBarcode as any)(barcodeSvgRef.current, barcode.trim(), {
            format: 'CODE128',
            lineColor: '#1e1b4b',
            width: 1.8,
            height: 44,
            displayValue: true,
            fontSize: 13,
            font: 'monospace',
            textMargin: 3,
            margin: 6,
            background: '#ffffff',
          });
        } catch (err) {
          console.warn('[AddProductModal] Live barcode preview render warning:', err);
        }
      }

      // Synchronize all printable SVG barcodes across all requested copies
      const timer = setTimeout(() => {
        renderPrintBarcode(barcode.trim());
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [barcode, printCopies, renderPrintBarcode]);

  // Print Label Handler for #print-label-area
  const handlePrintLabel = () => {
    const exactBarcode = barcode.trim();
    if (!exactBarcode) {
      toast.error('Please enter or generate a barcode first to print labels.');
      barcodeInputRef.current?.focus();
      return;
    }

    // Ensure all requested barcode label SVGs are rendered before calling window.print()
    const rendered = renderPrintBarcode(exactBarcode);
    if (!rendered) {
      setTimeout(() => {
        renderPrintBarcode(exactBarcode);
      }, 30);
    }

    // Add requestAnimationFrame + delay to guarantee SVGs are drawn before window.print()
    requestAnimationFrame(() => {
      setTimeout(() => {
        window.print();
      }, 100);
    });
  };

  // Regenerate SKU on demand
  const handleRefreshSku = () => {
    const nextSku = generateAutoSku();
    setSku(nextSku);
    toast.info(`Regenerated SKU: ${nextSku}`);
  };

  // Generate Barcode on demand
  const handleGenerateBarcode = () => {
    const nextBarcode = generate12DigitBarcode();
    setBarcode(nextBarcode);
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next.barcode;
      return next;
    });
    toast.success(`Generated 12-digit Barcode: ${nextBarcode}`);
  };

  // Handle Barcode Scan Success
  const handleScanSuccess = (scannedCode: string) => {
    setBarcode(scannedCode);
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next.barcode;
      return next;
    });
    toast.success(`Barcode scanned: ${scannedCode}`);
  };

  // Process selected or captured image to Base64 (with fast client compression)
  const processImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (PNG, JPG, WEBP).');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast.error('Image file must be under 12 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setImagePreview(result);

        // Offscreen canvas compression to ensure rapid upload
        const img = new Image();
        img.onload = () => {
          const maxDim = 900;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            const compressed = canvas.toDataURL('image/jpeg', 0.82);
            setImageBase64(compressed);
          } else {
            setImageBase64(result);
          }
        };
        img.onerror = () => {
          setImageBase64(result);
        };
        img.src = result;

        setValidationErrors((prev) => {
          const next = { ...prev };
          delete next.image;
          return next;
        });
      }
    };
    reader.onerror = () => {
      toast.error('Failed to read image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const handleRemoveImage = () => {
    setImagePreview(null);
    setImageBase64('');
    if (fileUploadInputRef.current) fileUploadInputRef.current.value = '';
    if (cameraCaptureInputRef.current) cameraCaptureInputRef.current.value = '';
  };

  // Validate form fields
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!barcode.trim()) {
      errors.barcode = 'Barcode is mandatory. Scan or generate one.';
    }

    if (!sku.trim()) {
      errors.sku = 'SKU is mandatory.';
    }

    if (!name.trim()) {
      errors.name = 'Product Name is mandatory.';
    }

    if (!imageBase64 && !imagePreview) {
      errors.image = 'Product photo is mandatory. Upload or capture an image.';
    }

    if (price === '' || isNaN(Number(price)) || Number(price) <= 0) {
      errors.price = 'Price is mandatory and must be greater than 0.';
    }

    if (stockLevel === '' || isNaN(Number(stockLevel)) || Number(stockLevel) < 0) {
      errors.stockLevel = 'Stock Level is mandatory and must be 0 or higher.';
    }

    setValidationErrors(errors);

    if (Object.keys(errors).length > 0) {
      const firstError = Object.values(errors)[0];
      toast.error(firstError);
      return false;
    }

    return true;
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);
    const toastId = toast.loading('Saving product to inventory & POS...');

    try {
      const payload = {
        name: name.trim(),
        sku: sku.trim(),
        barcode: barcode.trim(),
        price: Number(price),
        stockLevel: Number(stockLevel),
        gst: gst === '' ? 0 : Math.max(0, Number(gst) || 0),
        gstRate: gst === '' ? 0 : Math.max(0, Number(gst) || 0),
        image: imageBase64,
        category: category.trim() || 'General',
        dimensions: {
          length: dimensions.length === '' ? 0 : Number(dimensions.length),
          width: dimensions.width === '' ? 0 : Number(dimensions.width),
          height: dimensions.height === '' ? 0 : Number(dimensions.height),
        },
        description: description.trim(),
      };

      const res = await api.post('/inventory/products', payload);

      if (res.success || res.product || res.data) {
        const savedProduct = res.product || res.data || payload;

        // Broadcast instant update across all tabs, POS screens, and local IndexedDB cache
        broadcastProductSync(savedProduct, savedProduct.clientId);

        toast.success(res.message || 'Product created & synced to POS!', { id: toastId });

        if (onProductCreated) {
          onProductCreated(savedProduct);
        }

        // Reset form inputs cleanly
        setName('');
        setSku(generateAutoSku());
        setBarcode('');
        setPrice('');
        setStockLevel(0);
        setPrintCopies(1);
        setDescription('');
        setDimensions({ length: '', width: '', height: '' });
        setImagePreview(null);
        setImageBase64('');
        setValidationErrors({});

        // Directly submit and save the item without prompting for label print
        onClose();
      } else {
        throw new Error(res.message || 'Failed to save product');
      }
    } catch (err: any) {
      console.error('[AddProductModal] Submit error:', err);
      toast.error(err.message || 'Failed to save product. Please check input values.', {
        id: toastId,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <>
      {/* Print-specific CSS styles */}
      <style>{`
        #print-label-area {
          display: none;
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm;
          }

          html, body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
          }

          /* Hide all application and modal elements so they do NOT take up height */
          body > *:not(#print-label-area) {
            display: none !important;
          }

          body * {
            visibility: hidden !important;
          }

          #print-label-area,
          #print-label-area * {
            visibility: visible !important;
          }

          #print-label-area {
            position: relative !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-sizing: border-box !important;
            page-break-inside: auto !important;
            break-inside: auto !important;
          }

          #print-label-area.single-label {
            display: flex !important;
            justify-content: center !important;
            align-items: flex-start !important;
          }

          #print-label-area.single-label .print-label-card {
            width: fit-content !important;
            max-width: 80mm !important;
          }

          #print-label-area.multi-label {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 3.5mm 4mm !important;
          }

          .print-label-card {
            box-sizing: border-box !important;
            padding: 3mm 4mm !important;
            border: 0.5px dashed #666666 !important;
            border-radius: 4px !important;
            background: #ffffff !important;
            color: #000000 !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            text-align: center !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            width: 100% !important;
            min-height: 28mm !important;
            max-height: 33mm !important;
            overflow: hidden !important;
          }

          .print-label-name {
            font-size: 11px !important;
            font-weight: 700 !important;
            color: #000000 !important;
            line-height: 1.15 !important;
            margin-bottom: 1.5mm !important;
            text-align: center !important;
            word-break: break-word !important;
            max-height: 2.3em !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 2 !important;
            -webkit-box-orient: vertical !important;
            width: 100% !important;
          }

          .print-label-barcode-container {
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            width: 100% !important;
            background: #ffffff !important;
            overflow: hidden !important;
          }

          .barcode-print-svg {
            max-width: 100% !important;
            height: auto !important;
            display: block !important;
          }
        }
      `}</style>

      {/* Print Section strictly visible during print via #print-label-area */}
      <div
        id="print-label-area"
        className={printCopies === 1 ? 'single-label' : 'multi-label'}
      >
        {Array.from({ length: Math.max(1, printCopies) }).map((_, idx) => (
          <div key={idx} className="print-label-card">
            {/* Conditional Product Name Display:
                If Product Name is entered, display it clearly above the barcode on the label.
                If Product Name is empty, do NOT show any empty space, "undefined", "null", or placeholder text—render only the barcode label. */}
            {name && name.trim() ? (
              <div className="print-label-name">
                {name.trim()}
              </div>
            ) : null}

            <div className="print-label-barcode-container">
              <svg
                id={idx === 0 ? 'barcode-print' : undefined}
                ref={idx === 0 ? printBarcodeSvgRef : undefined}
                className="barcode-print-svg"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Camera Barcode Scanner Modal */}
      <CameraScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />

      {/* Main Modal Backdrop */}
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center p-4 overflow-y-auto bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
        role="dialog"
        aria-modal="true"
      >
        <div className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden my-6">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-gradient-to-r from-violet-600 via-indigo-600 to-indigo-700 text-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <BarcodeIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Add New Product</h2>
                <p className="text-xs text-indigo-100">
                  Register inventory item with barcode scanning, auto SKU & photo
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-white/80 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Main Add Product Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              {/* TOP BARCODE CONTROLS */}
              <div className="bg-indigo-50/70 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 rounded-2xl p-4.5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5 uppercase tracking-wide">
                    <BarcodeIcon className="w-4 h-4 text-indigo-600" />
                    Barcode (Mandatory) *
                  </label>
                  <span className="text-[11px] text-zinc-500">Scan or auto-generate 12 digits</span>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      ref={barcodeInputRef}
                      type="text"
                      placeholder="e.g. 890123456789 or scan"
                      value={barcode}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.stopPropagation();
                          if (barcode.trim()) {
                            toast.success(`Barcode scanned: ${barcode.trim()}`);
                            productNameInputRef.current?.focus();
                          }
                        }
                      }}
                      onChange={(e) => {
                        setBarcode(e.target.value);
                        if (validationErrors.barcode) {
                          setValidationErrors((prev) => {
                            const next = { ...prev };
                            delete next.barcode;
                            return next;
                          });
                        }
                      }}
                      className={`w-full px-3.5 py-2.5 text-sm font-mono rounded-xl border bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 ${
                        validationErrors.barcode
                          ? 'border-red-500 focus:ring-red-500/20'
                          : 'border-zinc-300 dark:border-zinc-700 focus:ring-indigo-500/20 focus:border-indigo-500'
                      }`}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsScannerOpen(true)}
                      className="flex-1 sm:flex-none rounded-xl border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100/50 dark:hover:bg-indigo-900/30 gap-1.5 text-xs font-semibold"
                    >
                      <Scan className="w-4 h-4 text-indigo-600" />
                      Scan
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleGenerateBarcode}
                      className="flex-1 sm:flex-none rounded-xl border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-1.5 text-xs font-semibold"
                    >
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      Generate
                    </Button>

                    {/* Quantity / Copies Input */}
                    <div className="flex items-center bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl px-2.5 py-1.5 shadow-sm gap-1.5">
                      <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 select-none">
                        Qty:
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={printCopies}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(500, parseInt(e.target.value, 10) || 1));
                          setPrintCopies(val);
                        }}
                        className="w-12 text-center text-xs font-bold bg-transparent text-zinc-900 dark:text-white focus:outline-none"
                        title="Enter number of barcode labels to print"
                      />
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={handlePrintLabel}
                      title={!barcode.trim() ? 'Enter or generate a barcode to print labels' : `Print ${printCopies} Barcode Labels`}
                      className={`flex-1 sm:flex-none rounded-xl gap-1.5 text-xs font-semibold transition-all ${
                        barcode.trim()
                          ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 shadow-sm'
                          : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <Printer className={`w-4 h-4 ${barcode.trim() ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500'}`} />
                      Print {printCopies} {printCopies === 1 ? 'Label' : 'Labels'}
                    </Button>
                  </div>
                </div>

                {validationErrors.barcode && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {validationErrors.barcode}
                  </p>
                )}

                {/* Live SVG Barcode Preview */}
                {barcode.trim() && (
                  <div className="mt-2 p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center">
                    <svg ref={barcodeSvgRef} className="max-w-full h-auto" />
                    <span className="text-[11px] font-mono text-zinc-500 mt-1">Live CODE128 Preview</span>
                  </div>
                )}
              </div>

              {/* SKU & PRODUCT NAME */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* SKU (Auto-generated with Refresh) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                      <Hash className="w-3.5 h-3.5 text-zinc-500" />
                      SKU (Auto-Generated) *
                    </label>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={sku}
                      onChange={(e) => {
                        setSku(e.target.value);
                        if (validationErrors.sku) {
                          setValidationErrors((prev) => {
                            const next = { ...prev };
                            delete next.sku;
                            return next;
                          });
                        }
                      }}
                      className={`w-full pl-3.5 pr-10 py-2.5 text-sm font-mono rounded-xl border bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 ${
                        validationErrors.sku
                          ? 'border-red-500 focus:ring-red-500/20'
                          : 'border-zinc-300 dark:border-zinc-700 focus:ring-indigo-500/20 focus:border-indigo-500'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={handleRefreshSku}
                      title="Regenerate SKU"
                      className="absolute right-2 p-1.5 text-zinc-400 hover:text-indigo-600 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                  {validationErrors.sku && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {validationErrors.sku}
                    </p>
                  )}
                </div>

                {/* Product Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5 text-zinc-500" />
                    Product Name *
                  </label>
                  <input
                    ref={productNameInputRef}
                    type="text"
                    placeholder="e.g. Organic Green Tea 100g"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (validationErrors.name) {
                        setValidationErrors((prev) => {
                          const next = { ...prev };
                          delete next.name;
                          return next;
                        });
                      }
                    }}
                    className={`w-full px-3.5 py-2.5 text-sm rounded-xl border bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 ${
                      validationErrors.name
                        ? 'border-red-500 focus:ring-red-500/20'
                        : 'border-zinc-300 dark:border-zinc-700 focus:ring-indigo-500/20 focus:border-indigo-500'
                    }`}
                  />
                  {validationErrors.name && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {validationErrors.name}
                    </p>
                  )}
                </div>
              </div>

              {/* MANDATORY PRODUCT PHOTO (UPLOAD + CAMERA) */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                  <ImageIcon className="w-3.5 h-3.5 text-zinc-500" />
                  Product Photo (Mandatory) *
                </label>

                {/* Hidden File Inputs */}
                {/* 1. File Upload */}
                <input
                  ref={fileUploadInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileChange}
                  className="hidden"
                />
                {/* 2. Direct Camera Capture */}
                <input
                  ref={cameraCaptureInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageFileChange}
                  className="hidden"
                />

                {imagePreview ? (
                  <div className="relative flex items-center gap-4 p-3 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-2xl">
                    <img
                      src={imagePreview}
                      alt="Product preview"
                      className="w-20 h-20 object-cover rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white shadow-sm"
                    />
                    <div className="flex-1 space-y-1">
                      <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                        Photo attached
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        Ready to encode and attach with product
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileUploadInputRef.current?.click()}
                          className="h-7 text-xs rounded-lg border-zinc-300 dark:border-zinc-700"
                        >
                          Change
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleRemoveImage}
                          className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center transition-colors ${
                      validationErrors.image
                        ? 'border-red-400 bg-red-50/20'
                        : 'border-zinc-300 dark:border-zinc-700 hover:border-indigo-400 bg-zinc-50/50 dark:bg-zinc-800/30'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
                      Mandatory Product Photo
                    </p>
                    <p className="text-[11px] text-zinc-500 max-w-xs mb-4">
                      Upload from file system or capture directly using your device camera
                    </p>

                    <div className="flex flex-wrap items-center justify-center gap-2.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileUploadInputRef.current?.click()}
                        className="rounded-xl border-zinc-300 dark:border-zinc-700 text-xs gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5 text-zinc-600" />
                        Upload File
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => cameraCaptureInputRef.current?.click()}
                        className="rounded-xl border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-xs gap-1.5"
                      >
                        <Camera className="w-3.5 h-3.5 text-indigo-600" />
                        Capture Camera
                      </Button>
                    </div>
                  </div>
                )}

                {validationErrors.image && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {validationErrors.image}
                  </p>
                )}
              </div>

              {/* PRICE & STOCK LEVEL */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Price */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                    <IndianRupee className="w-3.5 h-3.5 text-zinc-500" />
                    Price (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={price}
                    onChange={(e) => {
                      const val = e.target.value === '' ? '' : Number(e.target.value);
                      setPrice(val);
                      if (validationErrors.price) {
                        setValidationErrors((prev) => {
                          const next = { ...prev };
                          delete next.price;
                          return next;
                        });
                      }
                    }}
                    className={`w-full px-3.5 py-2.5 text-sm rounded-xl border bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 ${
                      validationErrors.price
                        ? 'border-red-500 focus:ring-red-500/20'
                        : 'border-zinc-300 dark:border-zinc-700 focus:ring-indigo-500/20 focus:border-indigo-500'
                    }`}
                  />
                  {validationErrors.price && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {validationErrors.price}
                    </p>
                  )}
                </div>

                {/* Stock Level */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-zinc-500" />
                    Stock Level *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={stockLevel}
                    onChange={(e) => {
                      const val = e.target.value === '' ? '' : parseInt(e.target.value, 10);
                      setStockLevel(val);
                      if (validationErrors.stockLevel) {
                        setValidationErrors((prev) => {
                          const next = { ...prev };
                          delete next.stockLevel;
                          return next;
                        });
                      }
                    }}
                    className={`w-full px-3.5 py-2.5 text-sm rounded-xl border bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 ${
                      validationErrors.stockLevel
                        ? 'border-red-500 focus:ring-red-500/20'
                        : 'border-zinc-300 dark:border-zinc-700 focus:ring-indigo-500/20 focus:border-indigo-500'
                    }`}
                  />
                  {validationErrors.stockLevel && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {validationErrors.stockLevel}
                    </p>
                  )}
                </div>
              </div>

              {/* OPTIONAL FIELDS: CATEGORY & DIMENSIONS */}
              <div className="space-y-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                    Optional Details
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Category */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Category
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Groceries, Electronics, Apparel"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* GST Rate (%) (Optional) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Tag className="w-3.5 h-3.5 text-emerald-500" />
                        GST Rate (%) (Optional)
                      </span>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-normal">Default: 0%</span>
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={[0, 5, 12, 18, 28].includes(Number(gst)) && gst !== '' ? Number(gst) : 'custom'}
                        onChange={(e) => {
                          if (e.target.value === 'custom') {
                            setGst('');
                          } else {
                            setGst(Number(e.target.value));
                          }
                        }}
                        className="w-1/2 px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value={0}>0% (Exempt)</option>
                        <option value={5}>5% GST</option>
                        <option value={12}>12% GST</option>
                        <option value={18}>18% GST</option>
                        <option value={28}>28% GST</option>
                        <option value="custom">Custom / Other</option>
                      </select>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        placeholder="0"
                        value={gst}
                        onChange={(e) => {
                          const v = e.target.value;
                          setGst(v === '' ? '' : Math.max(0, Number(v)));
                        }}
                        className="w-1/2 px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 placeholder:text-zinc-400"
                      />
                    </div>
                  </div>
                </div>

                  {/* Dimensions (Length × Width × Height) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Box className="w-3.5 h-3.5 text-zinc-400" />
                        Dimensions (L × W × H in cm)
                      </span>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-normal">(Optional)</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="L"
                        value={dimensions.length}
                        onChange={(e) =>
                          setDimensions((prev) => ({
                            ...prev,
                            length: e.target.value === '' ? '' : Number(e.target.value),
                          }))
                        }
                        className="w-full px-2.5 py-2 text-xs text-center rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="W"
                        value={dimensions.width}
                        onChange={(e) =>
                          setDimensions((prev) => ({
                            ...prev,
                            width: e.target.value === '' ? '' : Number(e.target.value),
                          }))
                        }
                        className="w-full px-2.5 py-2 text-xs text-center rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="H"
                        value={dimensions.height}
                        onChange={(e) =>
                          setDimensions((prev) => ({
                            ...prev,
                            height: e.target.value === '' ? '' : Number(e.target.value),
                          }))
                        }
                        className="w-full px-2.5 py-2 text-xs text-center rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5 text-zinc-400" />
                      Description
                    </span>
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-normal">(Optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Short product overview, features, or notes (optional)..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 resize-none"
                  />
                </div>
              </div>

              {/* ACTION FOOTER */}
              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="rounded-xl border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-600/25 px-6 font-semibold"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    'Save Product'
                  )}
                </Button>
              </div>
            </form>
        </div>
      </div>
    </>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
}
