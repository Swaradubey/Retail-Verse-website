import React, { useEffect, useRef } from 'react';
import {
  X,
  Printer,
  Check,
  Plus,
  Minus,
  Sparkles,
  Layers,
  Tag,
  SlidersHorizontal,
  CheckCircle2,
  FileSpreadsheet,
  PackageCheck,
  Receipt,
  ScanLine,
  Usb,
  Settings2,
} from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { Button } from '../ui/button';

export type LabelSizeId = '58mm' | '80mm' | '40x30' | '100x150' | 'a4';

export interface LabelSizeOption {
  id: LabelSizeId;
  name: string;
  badge?: string;
  dimensions: string;
  description: string;
  printerType: string;
  icon: React.ComponentType<{ className?: string }>;
  barcodeConfig: {
    width: number;
    height: number;
    fontSize: number;
    margin: number;
  };
}

export const LABEL_SIZE_OPTIONS: LabelSizeOption[] = [
  {
    id: '58mm',
    name: '58mm Thermal Sticker',
    badge: 'Default',
    dimensions: '50mm × 30mm',
    description: 'Standard 2-inch roll continuous thermal sticker roll',
    printerType: 'POS / Receipt & Thermal Label Roll (e.g. 58mm POS, Munbyn)',
    icon: Receipt,
    barcodeConfig: {
      width: 1.6,
      height: 38,
      fontSize: 11,
      margin: 3,
    },
  },
  {
    id: '80mm',
    name: '80mm Thermal Roll',
    badge: 'Standard 3"',
    dimensions: '72mm × 40mm',
    description: 'Wide 3-inch POS receipt & sticker rolls for busy counters',
    printerType: 'Standard 80mm POS Thermal Receipt / Label Printer',
    icon: ScanLine,
    barcodeConfig: {
      width: 2.0,
      height: 48,
      fontSize: 13,
      margin: 4,
    },
  },
  {
    id: '40x30',
    name: '40mm × 30mm Compact Sticker',
    badge: 'Compact',
    dimensions: '40mm × 30mm',
    description: 'Compact barcode sticker for jewelry, cosmetics & accessories',
    printerType: 'Direct Thermal or Thermal Transfer Small Die-cut Stickers',
    icon: Tag,
    barcodeConfig: {
      width: 1.25,
      height: 26,
      fontSize: 9.5,
      margin: 2,
    },
  },
  {
    id: '100x150',
    name: '100mm × 150mm (4" × 6")',
    badge: '4×6 Shipping',
    dimensions: '100mm × 150mm',
    description: 'Large thermal shipping label, master carton & bin tag',
    printerType: '4x6 Desktop Shipping Label Printer (Zebra, Rollo, TSC)',
    icon: PackageCheck,
    barcodeConfig: {
      width: 2.4,
      height: 70,
      fontSize: 14,
      margin: 5,
    },
  },
  {
    id: 'a4',
    name: 'A4 Label Sheet (Grid)',
    badge: 'A4 Sheet',
    dimensions: '210mm × 297mm',
    description: 'Standard A4 multi-label sticker sheet (3-column grid repeating Qty)',
    printerType: 'Standard Office Laser or Inkjet Printer on Sticker Paper',
    icon: FileSpreadsheet,
    barcodeConfig: {
      width: 1.7,
      height: 42,
      fontSize: 11,
      margin: 3,
    },
  },
];

/**
 * Generate dynamic @media print CSS strictly tailored to the chosen label size.
 * Handles continuous thermal roll feed with page-break-after, or multi-label A4 grid.
 */
export function generateDynamicPrintCss(sizeId: LabelSizeId): string {
  const commonReset = `
    #print-label-area {
      display: none;
    }

    @media print {
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        overflow: visible !important;
      }

      /* Hide all UI elements, overlays, modals, and app roots */
      body > *:not(#print-label-area):not(.thermal-label-print-zone) {
        display: none !important;
      }

      body * {
        visibility: hidden !important;
      }

      .thermal-label-print-zone,
      .thermal-label-print-zone *,
      #print-label-area,
      #print-label-area * {
        visibility: visible !important;
      }

      .thermal-label-print-zone,
      #print-label-area {
        position: static !important;
        margin: 0 !important;
        padding: 0 !important;
        box-sizing: border-box !important;
        background: #ffffff !important;
        width: 100% !important;
        height: auto !important;
        display: block !important;
      }

      /* Each single sticker unit */
      .thermal-sticker-card,
      .print-label-card {
        width: 48mm !important;
        height: 28mm !important;
        max-height: 28mm !important;
        margin: 1mm auto !important;
        padding: 1mm !important;
        box-sizing: border-box !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: space-between !important;
        text-align: center !important;
        overflow: hidden !important;
        
        /* Prevent splitting across pages */
        break-inside: avoid !important;
        page-break-inside: avoid !important;
        
        /* Ensure the next sticker starts on a fresh label */
        break-after: page !important;
        page-break-after: always !important;
      }

      .thermal-sticker-card:last-child,
      .print-label-card:last-child {
        break-after: avoid !important;
        page-break-after: avoid !important;
      }

      /* Product Title styling */
      .sticker-title,
      .print-label-name {
        font-size: 10px !important;
        font-weight: 700 !important;
        line-height: 1.1 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        max-width: 100% !important;
        width: 100% !important;
        color: #000000 !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      /* Barcode SVG / Canvas container */
      .sticker-barcode-container,
      .print-label-barcode-container {
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        height: 12mm !important;
        max-height: 12mm !important;
        width: 100% !important;
        overflow: hidden !important;
        margin: 0 auto !important;
        background: #ffffff !important;
      }

      .sticker-barcode-container svg,
      .sticker-barcode-container canvas,
      .sticker-barcode-container img,
      .print-label-barcode-container svg,
      .barcode-print-svg {
        max-height: 12mm !important;
        height: 12mm !important;
        max-width: 95% !important;
        image-rendering: pixelated !important;
        shape-rendering: crispEdges !important;
        display: block !important;
        margin: 0 auto !important;
        background: #ffffff !important;
      }

      /* SKU / Number & MRP styling */
      .sticker-number,
      .print-label-code-sku,
      .print-label-barcode-num {
        font-size: 9px !important;
        letter-spacing: 1px !important;
        font-family: monospace !important;
        line-height: 1 !important;
        color: #000000 !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      .sticker-mrp,
      .print-label-mrp {
        font-size: 9px !important;
        font-weight: 600 !important;
        line-height: 1.1 !important;
        white-space: nowrap !important;
        color: #000000 !important;
        margin: 0 !important;
        padding: 0 !important;
      }
  `;

  if (sizeId === '58mm') {
    return `
      ${commonReset}
        @page {
          size: 50mm 30mm !important;
          margin: 0 !important;
        }

        .thermal-label-print-zone,
        #print-label-area {
          width: 50mm !important;
          margin: 0 auto !important;
          padding: 0 !important;
          display: block !important;
        }

        .thermal-sticker-card,
        .print-label-card {
          width: 48mm !important;
          height: 28mm !important;
          max-height: 28mm !important;
          margin: 1mm auto !important;
          padding: 1mm !important;
          box-sizing: border-box !important;
          border: 0.5px dashed #444444 !important;
          background: #ffffff !important;
          color: #000000 !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: space-between !important;
          text-align: center !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          page-break-after: always !important;
          break-after: page !important;
          overflow: hidden !important;
        }

        .thermal-sticker-card:last-child,
        .print-label-card:last-child {
          page-break-after: auto !important;
          break-after: auto !important;
        }
      }
    `;
  }

  if (sizeId === '80mm') {
    return `
      ${commonReset}
        @page {
          size: 80mm 40mm !important;
          margin: 0 !important;
        }

        .thermal-label-print-zone,
        #print-label-area {
          width: 76mm !important;
          height: auto !important;
          margin: 0 auto !important;
          padding: 0 !important;
          display: block !important;
        }

        .thermal-sticker-card,
        .print-label-card {
          width: 76mm !important;
          height: 38mm !important;
          max-height: 38mm !important;
          margin: 1mm auto !important;
          padding: 2mm !important;
          box-sizing: border-box !important;
          background: #ffffff !important;
          color: #000000 !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: space-between !important;
          text-align: center !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          page-break-after: always !important;
          break-after: page !important;
          overflow: hidden !important;
        }

        .thermal-sticker-card:last-child,
        .print-label-card:last-child {
          page-break-after: avoid !important;
          break-after: avoid !important;
        }

        .print-label-brand {
          font-size: 9.5px !important;
          font-weight: 800 !important;
          letter-spacing: 0.5px !important;
          text-transform: uppercase !important;
          color: #000000 !important;
          line-height: 1 !important;
        }

        .print-label-name {
          font-size: 11px !important;
          font-weight: 700 !important;
          line-height: 1.2 !important;
          color: #000000 !important;
          margin-bottom: 0.8mm !important;
          text-align: center !important;
          max-height: 2.4em !important;
          overflow: hidden !important;
          display: -webkit-box !important;
          -webkit-line-clamp: 2 !important;
          -webkit-box-orient: vertical !important;
          word-break: break-word !important;
          width: 100% !important;
        }

        .print-label-code-sku {
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
          gap: 2mm !important;
          width: 100% !important;
          font-family: monospace !important;
          font-size: 9.5px !important;
          font-weight: 600 !important;
          color: #000000 !important;
          white-space: nowrap !important;
        }

        .print-label-mrp {
          font-size: 11px !important;
          font-weight: 800 !important;
          color: #000000 !important;
          line-height: 1.1 !important;
          white-space: nowrap !important;
        }

        .print-label-tax-note {
          font-size: 8px !important;
          font-weight: 500 !important;
          color: #222222 !important;
        }

        .barcode-print-svg {
          height: 42px !important;
        }
      }
    `;
  }

  if (sizeId === '40x30') {
    return `
      ${commonReset}
        @page {
          size: 40mm 30mm !important;
          margin: 0 !important;
        }

        .thermal-label-print-zone,
        #print-label-area {
          width: 38mm !important;
          height: auto !important;
          margin: 0 auto !important;
          padding: 0 !important;
          display: block !important;
        }

        .thermal-sticker-card,
        .print-label-card {
          width: 38mm !important;
          height: 28mm !important;
          max-height: 28mm !important;
          margin: 1mm auto !important;
          padding: 1mm !important;
          box-sizing: border-box !important;
          background: #ffffff !important;
          color: #000000 !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: space-between !important;
          text-align: center !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          page-break-after: always !important;
          break-after: page !important;
          overflow: hidden !important;
        }

        .thermal-sticker-card:last-child,
        .print-label-card:last-child {
          page-break-after: avoid !important;
          break-after: avoid !important;
        }

        .print-label-brand {
          font-size: 7.5px !important;
          font-weight: 800 !important;
          text-transform: uppercase !important;
          color: #000000 !important;
          line-height: 1 !important;
        }

        .print-label-name {
          font-size: 8px !important;
          font-weight: 700 !important;
          line-height: 1.1 !important;
          color: #000000 !important;
          text-align: center !important;
          max-height: 1.1em !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          width: 100% !important;
        }

        .print-label-code-sku {
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
          gap: 1mm !important;
          width: 100% !important;
          font-family: monospace !important;
          font-size: 7px !important;
          font-weight: 600 !important;
          color: #000000 !important;
          white-space: nowrap !important;
        }

        .print-label-mrp {
          font-size: 8px !important;
          font-weight: 800 !important;
          color: #000000 !important;
          white-space: nowrap !important;
        }

        .print-label-tax-note {
          font-size: 6.5px !important;
          font-weight: 500 !important;
          color: #222222 !important;
        }

        .barcode-print-svg {
          height: 24px !important;
        }
      }
    `;
  }

  if (sizeId === '100x150') {
    return `
      ${commonReset}
        @page {
          size: 100mm 150mm !important;
          margin: 0 !important;
        }

        .thermal-label-print-zone,
        #print-label-area {
          width: 96mm !important;
          height: auto !important;
          margin: 0 auto !important;
          padding: 0 !important;
          display: block !important;
        }

        .thermal-sticker-card,
        .print-label-card {
          width: 96mm !important;
          height: 146mm !important;
          max-height: 146mm !important;
          margin: 2mm auto !important;
          padding: 6mm !important;
          box-sizing: border-box !important;
          background: #ffffff !important;
          color: #000000 !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: space-between !important;
          text-align: center !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          page-break-after: always !important;
          break-after: page !important;
          overflow: hidden !important;
        }

        .thermal-sticker-card:last-child,
        .print-label-card:last-child {
          page-break-after: avoid !important;
          break-after: avoid !important;
        }

        .print-label-brand {
          font-size: 16px !important;
          font-weight: 800 !important;
          letter-spacing: 1px !important;
          text-transform: uppercase !important;
          color: #000000 !important;
        }

        .print-label-name {
          font-size: 18px !important;
          font-weight: 700 !important;
          line-height: 1.25 !important;
          color: #000000 !important;
          margin-bottom: 3mm !important;
          text-align: center !important;
          max-height: 2.5em !important;
          overflow: hidden !important;
          display: -webkit-box !important;
          -webkit-line-clamp: 2 !important;
          -webkit-box-orient: vertical !important;
          word-break: break-word !important;
          width: 100% !important;
        }

        .print-label-code-sku {
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
          gap: 4mm !important;
          width: 100% !important;
          font-family: monospace !important;
          font-size: 14px !important;
          font-weight: 700 !important;
          color: #000000 !important;
          margin-top: 2mm !important;
          white-space: nowrap !important;
        }

        .print-label-mrp {
          font-size: 18px !important;
          font-weight: 800 !important;
          color: #000000 !important;
          margin-top: 3mm !important;
          white-space: nowrap !important;
        }

        .print-label-tax-note {
          font-size: 12px !important;
          font-weight: 500 !important;
          color: #222222 !important;
        }

        .barcode-print-svg {
          height: 64px !important;
        }
      }
    `;
  }

  // Fallback: A4 multi-label grid
  return `
    ${commonReset}
      @page {
        size: A4 portrait !important;
        margin: 8mm !important;
      }

      .thermal-label-print-zone,
      #print-label-area {
        position: static !important;
        display: grid !important;
        grid-template-columns: repeat(3, 1fr) !important;
        gap: 3.5mm 4mm !important;
        width: 100% !important;
        height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        box-sizing: border-box !important;
      }

      .print-label-card {
        box-sizing: border-box !important;
        padding: 3mm 3mm !important;
        border: 0.5px dashed #666666 !important;
        background: #ffffff !important;
        color: #000000 !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: space-evenly !important;
        text-align: center !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        width: 100% !important;
        min-height: 28mm !important;
        max-height: 33mm !important;
        overflow: hidden !important;
      }

      .print-label-brand {
        font-size: 8px !important;
        font-weight: 800 !important;
        letter-spacing: 0.5px !important;
        text-transform: uppercase !important;
        color: #000000 !important;
      }

      .print-label-name {
        font-size: 10px !important;
        font-weight: 700 !important;
        color: #000000 !important;
        line-height: 1.15 !important;
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

      .print-label-code-sku {
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        gap: 2mm !important;
        width: 100% !important;
        font-family: monospace !important;
        font-size: 8px !important;
        font-weight: 600 !important;
        color: #000000 !important;
        white-space: nowrap !important;
      }

      .print-label-mrp {
        font-size: 9.5px !important;
        font-weight: 800 !important;
        color: #000000 !important;
        white-space: nowrap !important;
      }

      .print-label-tax-note {
        font-size: 7.5px !important;
        font-weight: 500 !important;
        color: #222222 !important;
      }

      .barcode-print-svg {
        height: 34px !important;
      }
    }
  `;
}

export interface PrintLabelSizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  barcode: string;
  productName: string;
  sku: string;
  price: number | '';
  printCopies: number;
  onCopiesChange: (copies: number) => void;
  selectedSize: LabelSizeId;
  onSelectSize: (size: LabelSizeId) => void;
  onConfirmPrint: () => void;
  storeName?: string;
  usbDevice?: USBDevice | null;
  onOpenHardwareModal?: () => void;
}

export const PrintLabelSizeModal: React.FC<PrintLabelSizeModalProps> = ({
  isOpen,
  onClose,
  barcode,
  productName,
  sku,
  price,
  printCopies,
  onCopiesChange,
  selectedSize,
  onSelectSize,
  onConfirmPrint,
  storeName,
  usbDevice,
  onOpenHardwareModal,
}) => {
  const previewSvgRef = useRef<SVGSVGElement | null>(null);

  const resolvedStoreName = storeName || (() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      return u.storeName || u.shopName || u.companyName || u.businessName || '';
    } catch {
      return '';
    }
  })();

  const currentOption =
    LABEL_SIZE_OPTIONS.find((opt) => opt.id === selectedSize) || LABEL_SIZE_OPTIONS[0];

  // Render Live Preview barcode on changes (pure #000000 foreground on #ffffff background)
  useEffect(() => {
    if (!isOpen) return;

    const trimmedCode = barcode.trim() || '890123456789';
    if (previewSvgRef.current) {
      try {
        const { width, height, margin } = currentOption.barcodeConfig;
        (JsBarcode as any)(previewSvgRef.current, trimmedCode, {
          format: 'CODE128',
          lineColor: '#000000',
          width: Math.max(1.1, width * 0.9),
          height: Math.max(22, height * 0.8),
          displayValue: false,
          margin: Math.max(2, margin - 1),
          background: '#ffffff',
        });
      } catch (err) {
        console.warn('[PrintLabelSizeModal] Live preview render error:', err);
      }
    }
  }, [isOpen, barcode, selectedSize, currentOption]);

  if (!isOpen) return null;

  const displayPrice =
    price !== '' && price !== undefined && !isNaN(Number(price))
      ? `₹${Number(price).toLocaleString('en-IN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Printer className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Print Barcode Labels
                <span className="text-[11px] font-semibold bg-white/20 text-white px-2 py-0.5 rounded-full">
                  CODE128
                </span>
                {usbDevice && (
                  <span className="text-[10px] font-semibold bg-emerald-500/30 text-emerald-100 border border-emerald-400/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Usb className="w-2.5 h-2.5" />
                    Direct USB
                  </span>
                )}
              </h3>
              <p className="text-xs text-indigo-100">
                {usbDevice
                  ? `Connected to ${usbDevice.productName || 'USB Thermal Printer'} - Direct ESC/POS Driver Ready`
                  : 'Select thermal roll or sticker sheet size for optimal scaling'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {onOpenHardwareModal && (
              <button
                type="button"
                onClick={onOpenHardwareModal}
                title="Thermal Printer & Hardware Settings"
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              >
                <Settings2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Label Size Selection Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 uppercase tracking-wider">
                <SlidersHorizontal className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Select Label Format & Size
              </label>
              <span className="text-[11px] text-zinc-500 font-medium">
                Active: <span className="font-semibold text-indigo-600 dark:text-indigo-400">{currentOption.name}</span>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {LABEL_SIZE_OPTIONS.map((option) => {
                const isSelected = selectedSize === option.id;
                const IconComponent = option.icon;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onSelectSize(option.id)}
                    className={`text-left p-3.5 rounded-2xl border transition-all flex flex-col justify-between relative group ${
                      isSelected
                        ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 shadow-sm ring-2 ring-indigo-500/20'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/40 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50/60 dark:hover:bg-zinc-800/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200'
                          }`}
                        >
                          <IconComponent className="w-4 h-4" />
                        </div>
                        <div>
                          <p
                            className={`text-xs font-bold ${
                              isSelected
                                ? 'text-indigo-950 dark:text-indigo-200'
                                : 'text-zinc-800 dark:text-zinc-200'
                            }`}
                          >
                            {option.name}
                          </p>
                          <p className="text-[11px] font-mono font-semibold text-zinc-500 dark:text-zinc-400">
                            {option.dimensions}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {option.badge && (
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider ${
                              option.badge === 'Default'
                                ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300'
                                : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'
                            }`}
                          >
                            {option.badge}
                          </span>
                        )}
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            isSelected
                              ? 'border-indigo-600 bg-indigo-600 text-white'
                              : 'border-zinc-300 dark:border-zinc-600'
                          }`}
                        >
                          {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </div>
                      </div>
                    </div>

                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight">
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quantity / Copies Controls */}
          <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <label className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-600" />
                Print Quantity (Copies)
              </label>
              <p className="text-[11px] text-zinc-500">
                Number of physical barcode stickers to print
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Stepper */}
              <div className="flex items-center bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl overflow-hidden shadow-sm">
                <button
                  type="button"
                  onClick={() => onCopiesChange(Math.max(1, printCopies - 1))}
                  className="px-2.5 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={printCopies}
                  onChange={(e) => {
                    const val = Math.max(1, Math.min(500, parseInt(e.target.value, 10) || 1));
                    onCopiesChange(val);
                  }}
                  className="w-14 text-center text-xs font-bold bg-transparent text-zinc-900 dark:text-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => onCopiesChange(Math.min(500, printCopies + 1))}
                  className="px-2.5 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Quick Pills */}
              <div className="flex items-center gap-1">
                {[1, 5, 10, 25].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => onCopiesChange(count)}
                    className={`text-[11px] font-semibold px-2 py-1 rounded-lg border transition-colors ${
                      printCopies === count
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Live Label Preview Card */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Live Label Layout Preview
              </span>
              <span className="text-[11px] font-mono text-zinc-500">
                Format: {currentOption.dimensions}
              </span>
            </div>

            {/* Simulated sticker on surface */}
            <div className="p-4 bg-zinc-100 dark:bg-zinc-950 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 flex flex-col items-center justify-center">
              <div
                className={`thermal-sticker-card bg-white text-black p-3.5 rounded-lg border border-zinc-300 shadow-md flex flex-col items-center justify-between transition-all ${
                  selectedSize === '40x30'
                    ? 'w-60 min-h-[96px]'
                    : selectedSize === '58mm'
                    ? 'w-72 min-h-[116px]'
                    : selectedSize === '80mm'
                    ? 'w-80 min-h-[136px]'
                    : selectedSize === '100x150'
                    ? 'w-80 min-h-[180px]'
                    : 'w-72 min-h-[116px]'
                }`}
              >
                {/* Product Name (Truncated if too long) */}
                <p className="sticker-title text-xs font-bold text-black text-center line-clamp-1 leading-tight mb-1 w-full">
                  {productName.trim() || 'Product Name (Preview)'}
                </p>

                {/* 3. Live Barcode SVG (Bars only - High Contrast Pure Black) */}
                <div className="sticker-barcode-container w-full flex items-center justify-center bg-white py-0.5">
                  <svg
                    ref={previewSvgRef}
                    className="max-w-full h-auto"
                    style={{ shapeRendering: 'crispEdges', imageRendering: 'pixelated' }}
                  />
                </div>

                {/* 4. Barcode Number */}
                <div className="sticker-number text-[10px] font-mono font-semibold text-zinc-700 flex items-center justify-center gap-1.5 mt-0.5">
                  <span>{barcode.trim() || '890123456789'}</span>
                </div>

                {/* 5. MRP: ₹XXX.XX (Incl. of all taxes) */}
                <div className="sticker-mrp text-[11px] font-extrabold text-black text-center mt-1">
                  MRP: {displayPrice || '₹0.00'}{' '}
                  <span className="text-[9px] font-normal text-zinc-600">(Incl. of all taxes)</span>
                </div>
              </div>

              <p className="text-[11px] text-zinc-500 mt-2 text-center">
                Target: {currentOption.printerType}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80 flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-500">
            Will print{' '}
            <strong className="text-zinc-900 dark:text-zinc-100">
              {printCopies} {printCopies === 1 ? 'label' : 'labels'}
            </strong>{' '}
            in <strong className="text-indigo-600">{currentOption.name}</strong> format.
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="rounded-xl border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onConfirmPrint}
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-600/25 px-5 font-semibold gap-2"
            >
              <Printer className="w-4 h-4" />
              Print {printCopies} {printCopies === 1 ? 'Label' : 'Labels'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
