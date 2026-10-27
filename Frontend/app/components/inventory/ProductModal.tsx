import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
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
  Database,
  Store,
  ChevronDown,
  SlidersHorizontal,
  Check,
} from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu';
import { CameraScannerModal } from './CameraScannerModal';
import { CameraPhotoModal } from './CameraPhotoModal';
import {
  PrintLabelSizeModal,
  LabelSizeId,
  LABEL_SIZE_OPTIONS,
  generateDynamicPrintCss,
} from './PrintLabelSizeModal';
import { printViaIsolatedIframe } from '../../lib/thermalPrinter';
import { useThermalPrinter } from '../../hooks/useThermalPrinter';
import { Product } from '../../api/products';
import type { ClientRow } from '../../api/clients';
import type { InventoryEditMode } from '../../utils/inventoryPermissions';
import { PRODUCT_PLACEHOLDER, getFullImageUrl } from '../../utils/imageUrl';
import * as marketplaceApi from '../../services/marketplaceApi';

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
  const {
    printBarcodeLabel,
    settings: thermalSettings,
    usbDevice,
    openHardwareModal,
  } = useThermalPrinter();
  const isLimitedCopyEdit = mode === 'edit' && inventoryEditMode === 'inventory_manager';
  const showClientAssign =
    viewerRole === 'super_admin' &&
    Array.isArray(assignableClients) &&
    assignableClients.length > 0;

  // Form States
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

  // Client Assignment & Marketplaces
  const [assignClientId, setAssignClientId] = useState('');
  const [connectedMarketplaces, setConnectedMarketplaces] = useState<string[]>([]);
  const [selectedMarketplaces, setSelectedMarketplaces] = useState<string[]>([]);

  // Photo State
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string>('');
  const [isPhotoCameraOpen, setIsPhotoCameraOpen] = useState(false);

  // UI Control States
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [printCopies, setPrintCopies] = useState<number>(1);
  const [selectedLabelSize, setSelectedLabelSize] = useState<LabelSizeId>('58mm');
  const [isLabelSizeModalOpen, setIsLabelSizeModalOpen] = useState(false);

  // Resolve Store / Brand Name for Print Labels
  const storeName = React.useMemo(() => {
    if (product) {
      const p = product as any;
      const s = p.client?.storeName || p.clientName || p.storeName;
      if (s && typeof s === 'string' && s.trim()) return s.trim();
    }
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      return u.storeName || u.shopName || u.companyName || u.businessName || '';
    } catch {
      return '';
    }
  }, [product]);

  // Compact size label format (e.g. "50×30mm", "72×40mm", or "A4 Sheet")
  const compactSizeLabel = React.useMemo(() => {
    const opt = LABEL_SIZE_OPTIONS.find((o) => o.id === selectedLabelSize);
    if (!opt) return 'Select Size';
    if (opt.id === 'a4') return 'A4 Sheet';
    return opt.dimensions.replace(/mm\s*×\s*/g, '×').replace(/\s+/g, '');
  }, [selectedLabelSize]);

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
    const part1 = Date.now().toString().slice(-7);
    const part2 = Math.floor(10000 + Math.random() * 90000).toString();
    return `${part1}${part2}`;
  }, []);

  // Initialize or pre-populate form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && product) {
        const initialImg = (product.image || (product as any).imageUrl || (product as any).photoUrl || '').trim();
        setName(product.name || (product as any).productName || (product as any).title || '');
        setSku(product.sku || '');
        setBarcode(product.barcode || product.sku || '');
        setCategory(product.category || 'General');
        setPrice(product.price !== undefined && product.price !== null ? product.price : ((product as any).unitPrice ?? ''));
        const initialStock = product.stock !== undefined && product.stock !== null ? product.stock : ((product as any).stockLevel ?? 0);
        setStockLevel(initialStock);
        setGst((product as any).gst ?? (product as any).gstRate ?? 0);
        setDescription(product.description || '');
        setDimensions({
          length: (product as any).dimensions?.length ?? '',
          width: (product as any).dimensions?.width ?? '',
          height: (product as any).dimensions?.height ?? '',
        });
        setImagePreview(initialImg || null);
        setImageBase64('');
        setPrintCopies(Math.max(1, Number(initialStock) || 1));
        setAssignClientId(product.clientId || '');
        setValidationErrors({});
        setSelectedLabelSize('58mm');
        setIsLabelSizeModalOpen(false);
        setIsPhotoCameraOpen(false);
      } else {
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
        setPrintCopies(1);
        setAssignClientId('');
        setValidationErrors({});
        setSelectedLabelSize('58mm');
        setIsLabelSizeModalOpen(false);
        setIsPhotoCameraOpen(false);
      }

      const focusTimer = setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 150);
      return () => clearTimeout(focusTimer);
    }
  }, [isOpen, mode, product, generateAutoSku]);

  // Load marketplace connections if in add mode
  useEffect(() => {
    if (isOpen && mode === 'add') {
      marketplaceApi
        .getMarketplaceConnections()
        .then((connData: any) => {
          const connections = Array.isArray(connData) ? connData : connData.connections || [];
          const activeMps = connections
            .filter((c: any) => c.status === 'connected')
            .map((c: any) => c.marketplace);
          setConnectedMarketplaces(activeMps);
          setSelectedMarketplaces(activeMps);
        })
        .catch((err) => {
          console.error('[ProductModal] Failed to fetch marketplace connections:', err.message);
          setConnectedMarketplaces([]);
        });
    }
  }, [isOpen, mode]);

  // Prevent background scrolling while modal is open
  useScrollLock(isOpen);

  // Hardware Scanner Global Wedge Buffer Listener (handles rapid keystrokes from USB/Bluetooth scanners)
  useEffect(() => {
    if (!isOpen || isScannerOpen) return;

    let scanBuffer = '';
    let lastKeyTime = 0;

    const handleHardwareScan = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTargetInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      if (e.key === 'Enter') {
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

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (timeDiff > 60) {
          scanBuffer = e.key;
        } else {
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
  const renderPrintBarcode = useCallback(
    (codeToRender: string, sizeId: LabelSizeId = selectedLabelSize) => {
      const trimmedCode = codeToRender ? codeToRender.trim() : '';
      if (!trimmedCode) return false;

      const svgs = document.querySelectorAll<SVGSVGElement>(
        '#print-label-area .barcode-print-svg, #barcode-print'
      );
      if (!svgs || svgs.length === 0) return false;

      const option =
        LABEL_SIZE_OPTIONS.find((o) => o.id === sizeId) || LABEL_SIZE_OPTIONS[0];
      const { width, height, margin } = option.barcodeConfig;

      let successCount = 0;
      svgs.forEach((svgElem) => {
        try {
          (JsBarcode as any)(svgElem, trimmedCode, {
            format: 'CODE128',
            lineColor: '#000000',
            width: sizeId === '58mm' ? 1.3 : width,
            height: sizeId === '58mm' ? 28 : height,
            displayValue: false,
            margin: 0,
            background: '#ffffff',
          });
          successCount++;
        } catch (err) {
          console.error('[ProductModal] Print barcode SVG render error:', err);
        }
      });

      return successCount > 0;
    },
    [selectedLabelSize]
  );

  // Sync print copies with stockLevel when stockLevel changes and is valid
  useEffect(() => {
    if (stockLevel !== '' && !isNaN(Number(stockLevel)) && Number(stockLevel) > 0) {
      setPrintCopies(Number(stockLevel));
    }
  }, [stockLevel]);

  // Live Barcode SVG Rendering & Print Barcode Sync
  useEffect(() => {
    if (barcode.trim()) {
      if (barcodeSvgRef.current) {
        try {
          (JsBarcode as any)(barcodeSvgRef.current, barcode.trim(), {
            format: 'CODE128',
            lineColor: '#000000',
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
          console.warn('[ProductModal] Live barcode preview render warning:', err);
        }
      }

      const timer = setTimeout(() => {
        renderPrintBarcode(barcode.trim(), selectedLabelSize);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [barcode, printCopies, selectedLabelSize, renderPrintBarcode]);

  // Print Label Handler: opens Label Size Selector modal
  const handlePrintLabel = () => {
    const exactBarcode = barcode.trim();
    if (!exactBarcode) {
      toast.error('Please enter or generate a barcode first to print labels.');
      barcodeInputRef.current?.focus();
      return;
    }

    setIsLabelSizeModalOpen(true);
  };

  // Immediate print execution via isolated thermal engine (WebUSB or isolated iframe)
  const executePrint = async (targetSize: LabelSizeId = selectedLabelSize) => {
    const exactBarcode = barcode.trim();
    if (!exactBarcode) {
      toast.error('Please enter or generate a barcode first to print labels.');
      barcodeInputRef.current?.focus();
      return;
    }

    const dimensionMap: Record<LabelSizeId, string> = {
      '58mm': '50mm 30mm',
      '80mm': '72mm 40mm',
      '40x30': '40mm 30mm',
      '100x150': '100mm 150mm',
      'a4': 'A4 portrait',
    };
    const exactDim = dimensionMap[targetSize] || '50mm 30mm';

    // 1. Direct WebUSB hardware driver if connected (bypasses browser dialog completely)
    if (usbDevice && targetSize !== 'a4') {
      try {
        const res = await printBarcodeLabel(
          {
            name: name.trim() || 'Product',
            sku: sku.trim(),
            barcode: exactBarcode,
            price: price,
            storeName: storeName || thermalSettings.storeName,
          },
          printCopies,
          exactDim
        );
        if (res.success) {
          setIsLabelSizeModalOpen(false);
          return;
        }
      } catch (usbErr) {
        console.warn('[ProductModal] WebUSB direct print failed, falling back to isolated iframe:', usbErr);
      }
    }

    // Ensure all requested barcode label SVGs are rendered before printing
    const rendered = renderPrintBarcode(exactBarcode, targetSize);
    if (!rendered) {
      setTimeout(() => {
        renderPrintBarcode(exactBarcode, targetSize);
      }, 30);
    }

    setTimeout(async () => {
      const printArea = document.getElementById('print-label-area');
      if (printArea) {
        try {
          const dynamicCss = generateDynamicPrintCss(targetSize);
          await printViaIsolatedIframe({
            html: `<style>${dynamicCss}</style><div class="thermal-label-print-zone ${targetSize === 'a4' ? 'a4-grid' : 'thermal-roll'}" style="display:${targetSize === 'a4' ? 'grid' : 'flex'} !important;">${printArea.innerHTML}</div>`,
            title: `Barcode Labels - ${exactBarcode}`,
            exactDimensions: targetSize === 'a4' ? 'auto' : exactDim,
          });
          toast.success(`Sent ${printCopies} barcode label${printCopies === 1 ? '' : 's'} to thermal printer`);
          setIsLabelSizeModalOpen(false);
        } catch (iframeErr: any) {
          console.error('[ProductModal] Isolated thermal iframe print failed:', iframeErr);
          toast.error(`Thermal printing failed: ${iframeErr?.message || 'Print error'}`);
        }
      } else {
        // Fallback to printBarcodeLabel engine
        try {
          const res = await printBarcodeLabel(
            {
              name: name.trim() || 'Product',
              sku: sku.trim(),
              barcode: exactBarcode,
              price: price,
              storeName: storeName || thermalSettings.storeName,
            },
            printCopies,
            exactDim
          );
          if (res.success) {
            setIsLabelSizeModalOpen(false);
          }
        } catch (err: any) {
          console.error('[ProductModal] Label print engine failed:', err);
          toast.error(`Thermal print engine failed: ${err?.message || 'Error'}`);
        }
      }
    }, 120);
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
    if (isLimitedCopyEdit) {
      if (!name.trim()) {
        toast.error('Product Name is mandatory.');
        return false;
      }
      return true;
    }

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

    if (price === '' || isNaN(Number(price)) || Number(price) < 0) {
      errors.price = 'Price is mandatory and cannot be negative.';
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
    const toastId = toast.loading(mode === 'edit' ? 'Saving changes to product...' : 'Creating product in inventory...');

    try {
      const trimmedName = name.trim();
      const trimmedSku = sku.trim();
      const trimmedBarcode = barcode.trim() || trimmedSku;
      const finalImage = imageBase64 || imagePreview || '';

      if (isLimitedCopyEdit) {
        await onSave({
          title: trimmedName,
          name: trimmedName,
          description: description.trim(),
        });
        toast.dismiss(toastId);
        onClose();
        return;
      }

      const payload: any = {
        name: trimmedName,
        productName: trimmedName,
        title: trimmedName,
        sku: trimmedSku,
        barcode: trimmedBarcode,
        category: category.trim() || 'General',
        price: Number(price) || 0,
        unitPrice: Number(price) || 0,
        stock: Number(stockLevel) || 0,
        stockLevel: Number(stockLevel) || 0,
        quantity: Number(stockLevel) || 0,
        gst: gst === '' ? 0 : Math.max(0, Number(gst) || 0),
        gstRate: gst === '' ? 0 : Math.max(0, Number(gst) || 0),
        image: finalImage,
        imageUrl: finalImage,
        photoUrl: finalImage,
        dimensions: {
          length: dimensions.length === '' ? 0 : Number(dimensions.length),
          width: dimensions.width === '' ? 0 : Number(dimensions.width),
          height: dimensions.height === '' ? 0 : Number(dimensions.height),
        },
        description: description.trim(),
      };

      if (showClientAssign && assignClientId) {
        payload.clientId = assignClientId;
      }
      if (mode === 'add') {
        payload.publishTo = selectedMarketplaces;
      }

      await onSave(payload);
      toast.dismiss(toastId);
      onClose();
    } catch (err: any) {
      console.error('[ProductModal] Submit error:', err);
      toast.error(err.message || 'Failed to save product. Please check input values.', { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <>
      {/* Dynamic Print-specific CSS styles generated for selectedLabelSize */}
      <style>{generateDynamicPrintCss(selectedLabelSize)}</style>

      {/* Print Section strictly visible during print via #print-label-area */}
      <div
        id="print-label-area"
        className={`thermal-label-print-zone ${selectedLabelSize === 'a4' ? 'a4-grid' : 'thermal-roll'}`}
      >
        {Array.from({ length: Math.max(1, printCopies) }).map((_, idx) => (
          <div key={idx} className="thermal-sticker-card print-label-card">
            {/* 1. Product Title */}
            <div className="sticker-title print-label-name">
              {name && name.trim() ? name.trim() : 'Product'}
            </div>

            {/* 2. Barcode SVG Container */}
            <div className="sticker-barcode-container print-label-barcode-container">
              <svg
                id={idx === 0 ? 'barcode-print' : undefined}
                ref={idx === 0 ? printBarcodeSvgRef : undefined}
                className="barcode-print-svg"
                style={{ shapeRendering: 'crispEdges', imageRendering: 'pixelated' }}
              />
            </div>

            {/* 3. Barcode Number */}
            <div className="sticker-number print-label-code-sku">
              {barcode.trim()}
            </div>

            {/* 4. MRP */}
            <div className="sticker-mrp print-label-mrp">
              MRP: ₹{price !== '' && price !== undefined && !isNaN(Number(price))
                ? Number(price).toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : '0.00'} (Incl. of all taxes)
            </div>
          </div>
        ))}
      </div>

      {/* Select Label Size & Print Modal */}
      <PrintLabelSizeModal
        isOpen={isLabelSizeModalOpen}
        onClose={() => setIsLabelSizeModalOpen(false)}
        barcode={barcode}
        productName={name}
        sku={sku}
        price={price}
        printCopies={printCopies}
        onCopiesChange={setPrintCopies}
        selectedSize={selectedLabelSize}
        storeName={storeName}
        usbDevice={usbDevice}
        onOpenHardwareModal={openHardwareModal}
        onSelectSize={(newSize) => {
          setSelectedLabelSize(newSize);
          renderPrintBarcode(barcode.trim(), newSize);
        }}
        onConfirmPrint={() => {
          executePrint(selectedLabelSize);
        }}
      />

      {/* Camera Barcode Scanner Modal */}
      <CameraScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />

      {/* Live Camera Photo Capture Modal */}
      <CameraPhotoModal
        isOpen={isPhotoCameraOpen}
        onClose={() => setIsPhotoCameraOpen(false)}
        onCapture={(capturedBase64) => {
          setImagePreview(capturedBase64);
          setImageBase64(capturedBase64);
          setValidationErrors((prev) => {
            const next = { ...prev };
            delete next.image;
            return next;
          });
          toast.success('Product photo captured successfully!');
        }}
      />

      {/* Main Modal Backdrop */}
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center p-4 overflow-y-auto bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
        role="dialog"
        aria-modal="true"
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden my-6"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-gradient-to-r from-violet-600 via-indigo-600 to-indigo-700 text-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <BarcodeIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold">
                  {mode === 'edit' ? 'Edit Product' : 'Add New Product'}
                </h2>
                <p className="text-xs text-indigo-100">
                  {mode === 'edit'
                    ? isLimitedCopyEdit
                      ? 'You can update the product title and description only'
                      : 'Update inventory item with barcode scanning, SKU & photo'
                    : 'Register inventory item with barcode scanning, auto SKU & photo'}
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

          {/* Main Product Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
            {isLimitedCopyEdit && (
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>Limited Edit Mode: As an Inventory Manager, you can edit the Product Name and Description.</span>
              </div>
            )}

            {!isLimitedCopyEdit && (
              /* TOP PROMINENT BARCODE CONTROLS */
              <div className="bg-indigo-50/70 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 rounded-2xl p-4.5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5 uppercase tracking-wide">
                    <BarcodeIcon className="w-4 h-4 text-indigo-600" />
                    Barcode (Mandatory) *
                  </label>
                  <span className="text-[11px] text-zinc-500">Scan or auto-generate 12 digits</span>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 sm:gap-2">
                  <div className="relative flex-1 min-w-[130px]">
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
                      className={`w-full h-8 px-3 py-1.5 text-xs sm:text-sm font-mono rounded-xl border bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 ${
                        validationErrors.barcode
                          ? 'border-red-500 focus:ring-red-500/20'
                          : 'border-zinc-300 dark:border-zinc-700 focus:ring-indigo-500/20 focus:border-indigo-500'
                      }`}
                    />
                  </div>

                  <div className="flex items-center flex-wrap sm:flex-nowrap gap-1.5 shrink-0 overflow-x-auto py-0.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setIsScannerOpen(true)}
                      className="h-8 px-2.5 py-1.5 rounded-xl border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100/50 dark:hover:bg-indigo-900/30 gap-1 text-xs font-semibold shrink-0"
                    >
                      <Scan className="h-3.5 w-3.5 text-indigo-600" />
                      Scan
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleGenerateBarcode}
                      className="h-8 px-2.5 py-1.5 rounded-xl border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-1 text-xs font-semibold shrink-0"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                      Generate
                    </Button>

                    {/* Compact Label Size Selector with Dropdown Menu */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          title={`Label Size: ${LABEL_SIZE_OPTIONS.find((o) => o.id === selectedLabelSize)?.name || selectedLabelSize}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 h-8 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-semibold shadow-sm transition-all shrink-0 cursor-pointer"
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <span className="whitespace-nowrap">{compactSizeLabel}</span>
                          <ChevronDown className="h-3 w-3 text-zinc-400 shrink-0" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="z-[110] w-64 p-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-2xl">
                        <div className="px-2 py-1 text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                          Select Label Size
                        </div>
                        {LABEL_SIZE_OPTIONS.map((option) => {
                          const isSelected = selectedLabelSize === option.id;
                          const OptionIcon = option.icon;
                          return (
                            <DropdownMenuItem
                              key={option.id}
                              onClick={() => {
                                setSelectedLabelSize(option.id);
                                if (barcode.trim()) {
                                  renderPrintBarcode(barcode.trim(), option.id);
                                }
                              }}
                              className={`flex items-center justify-between gap-2.5 px-2.5 py-2 cursor-pointer rounded-xl text-xs transition-colors ${
                                isSelected
                                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-950 dark:text-indigo-200 font-semibold'
                                  : 'text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <OptionIcon
                                  className={`h-3.5 w-3.5 shrink-0 ${
                                    isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'
                                  }`}
                                />
                                <div className="flex flex-col min-w-0 text-left">
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate">{option.name}</span>
                                    {option.badge && (
                                      <span
                                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 ${
                                          option.badge === 'Default'
                                            ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300'
                                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                                        }`}
                                      >
                                        {option.badge}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
                                    {option.dimensions}
                                  </span>
                                </div>
                              </div>
                              {isSelected && (
                                <Check className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0 ml-1" />
                              )}
                            </DropdownMenuItem>
                          );
                        })}
                        <DropdownMenuSeparator className="my-1 border-zinc-100 dark:border-zinc-800" />
                        <DropdownMenuItem
                          onClick={() => {
                            setIsLabelSizeModalOpen(true);
                          }}
                          className="flex items-center gap-2 px-2.5 py-2 cursor-pointer rounded-xl text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 font-semibold"
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
                          <span>All Sizes & Live Preview...</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Quantity / Copies Input */}
                    <div className="flex items-center h-8 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl px-2 py-1 shadow-sm gap-1 shrink-0">
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
                        className="w-8 text-center text-xs font-bold bg-transparent text-zinc-900 dark:text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        title="Enter number of barcode labels to print"
                      />
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handlePrintLabel}
                      title={!barcode.trim() ? 'Enter or generate a barcode to print labels' : `Print ${printCopies} Barcode Labels (${selectedLabelSize})`}
                      className={`h-8 px-2.5 py-1.5 rounded-xl gap-1 text-xs font-semibold transition-all shrink-0 ${
                        barcode.trim()
                          ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 shadow-sm'
                          : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <Printer className={`h-3.5 w-3.5 shrink-0 ${barcode.trim() ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500'}`} />
                      <span>Print {printCopies} {printCopies === 1 ? 'Label' : 'Labels'}</span>
                    </Button>
                  </div>
                </div>

                {validationErrors.barcode && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {validationErrors.barcode}
                  </p>
                )}

                {/* Live SVG Barcode Preview (High Contrast Pure Black) */}
                {barcode.trim() && (
                  <div className="mt-2 p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center">
                    <svg
                      ref={barcodeSvgRef}
                      className="max-w-full h-auto"
                      style={{ shapeRendering: 'crispEdges', imageRendering: 'pixelated' }}
                    />
                    <span className="text-[11px] font-mono text-zinc-500 mt-1">Live CODE128 Preview</span>
                  </div>
                )}
              </div>
            )}

            {/* SKU & PRODUCT NAME */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {!isLimitedCopyEdit && (
                /* SKU (Auto-generated with Refresh) */
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
              )}

              {/* Product Name */}
              <div className={`space-y-1.5 ${isLimitedCopyEdit ? 'md:col-span-2' : ''}`}>
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

            {!isLimitedCopyEdit && (
              <>
                {/* PRODUCT PHOTO (UPLOAD + CAMERA) PRE-FILLED & EDITABLE */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5 text-zinc-500" />
                    Product Photo (Mandatory) *
                  </label>

                  {/* Hidden File Inputs */}
                  <input
                    ref={fileUploadInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileChange}
                    className="hidden"
                  />
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
                        src={getFullImageUrl(imagePreview) || PRODUCT_PLACEHOLDER}
                        alt="Product preview"
                        className="w-20 h-20 object-cover rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white shadow-sm"
                        onError={(e) => {
                          const target = e.currentTarget;
                          target.onerror = null;
                          target.src = PRODUCT_PLACEHOLDER;
                        }}
                      />
                      <div className="flex-1 space-y-1">
                        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Photo attached
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          {mode === 'edit' ? 'Current image loaded. You can change or replace it.' : 'Ready to attach with product'}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setIsPhotoCameraOpen(true)}
                            className="h-7 text-xs rounded-lg border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 gap-1 font-semibold"
                          >
                            <Camera className="w-3 h-3 text-indigo-600" />
                            Capture Camera
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => fileUploadInputRef.current?.click()}
                            className="h-7 text-xs rounded-lg border-zinc-300 dark:border-zinc-700 gap-1"
                          >
                            <Upload className="w-3 h-3 text-zinc-500" />
                            Change File
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
                          onClick={() => setIsPhotoCameraOpen(true)}
                          className="rounded-xl border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-xs gap-1.5 font-semibold"
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
                      Price / Unit Price (₹) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
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

                {/* OPTIONAL FIELDS: CATEGORY & GST & DIMENSIONS */}
                <div className="space-y-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                      Product Details & Taxes
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
                </div>

                {showClientAssign && (
                  <div className="space-y-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-indigo-500" />
                      Assign to client (optional)
                    </label>
                    <select
                      value={assignClientId}
                      onChange={(e) => setAssignClientId(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">No assignment</option>
                      {assignableClients.map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.shopName || c.companyName} ({c.companyName})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Publish To Marketplaces Checkboxes (in Add mode) */}
                {mode === 'add' && (
                  <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                      <Store className="w-3.5 h-3.5 text-indigo-500" />
                      Publish To Connected Marketplaces
                    </label>
                    {connectedMarketplaces.length === 0 ? (
                      <p className="text-xs text-zinc-400">No active marketplace connections linked.</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {['amazon', 'flipkart', 'shopify'].map((mp) => {
                          const isConnected = connectedMarketplaces.includes(mp);
                          const isSelected = selectedMarketplaces.includes(mp);
                          return (
                            <label
                              key={mp}
                              className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs cursor-pointer select-none transition-colors ${
                                isSelected
                                  ? 'border-indigo-500 bg-indigo-50/30 dark:bg-indigo-950/20'
                                  : isConnected
                                  ? 'border-zinc-200 dark:border-zinc-700'
                                  : 'border-zinc-100 dark:border-zinc-800 opacity-50 cursor-not-allowed'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={!isConnected}
                                onChange={() => {
                                  if (isSelected) {
                                    setSelectedMarketplaces((prev) => prev.filter((id) => id !== mp));
                                  } else {
                                    setSelectedMarketplaces((prev) => [...prev, mp]);
                                  }
                                }}
                                className="rounded text-indigo-600 focus:ring-indigo-500/20 w-3.5 h-3.5"
                              />
                              <span className="font-semibold capitalize text-zinc-700 dark:text-zinc-300">{mp}</span>
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
            <div className="space-y-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-zinc-400" />
                  Description
                </span>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-normal">(Optional)</span>
              </label>
              <textarea
                rows={isLimitedCopyEdit ? 5 : 2}
                placeholder="Short product overview, features, or notes (optional)..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 resize-none"
              />
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
                  mode === 'add' ? 'Create Product' : 'Save Changes'
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
