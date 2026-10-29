import React, { useState, useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import {
  X,
  Printer,
  Plus,
  Minus,
  Layers,
  Check,
  Usb,
  Bluetooth,
  Settings2,
  Sparkles,
  Tag,
  Store,
} from 'lucide-react';
import { Button } from '../ui/button';
import { useThermalPrinter } from '../../hooks/useThermalPrinter';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';

export interface BarcodePrintProduct {
  name: string;
  sku: string;
  barcode: string;
  price: number | string;
  stockLevel?: number | string;
  category?: string;
}

export type LabelDimensions = '50x25' | '50x30' | '40x30' | '72x40';

export interface LabelSizePreset {
  id: LabelDimensions;
  name: string;
  dimensions: string;
  exactRule: string;
  description: string;
}

export const LABEL_SIZE_PRESETS: LabelSizePreset[] = [
  {
    id: '50x25',
    name: '50mm × 25mm',
    dimensions: '50mm × 25mm',
    exactRule: '50mm 25mm',
    description: 'Standard 2-inch continuous thermal sticker roll',
  },
  {
    id: '50x30',
    name: '50mm × 30mm',
    dimensions: '50mm × 30mm',
    exactRule: '50mm 30mm',
    description: 'Popular retail sticker roll with extra title room',
  },
  {
    id: '40x30',
    name: '40mm × 30mm',
    dimensions: '40mm × 30mm',
    exactRule: '40mm 30mm',
    description: 'Compact jewelry, cosmetics, and accessories sticker',
  },
  {
    id: '72x40',
    name: '72mm × 40mm',
    dimensions: '72mm × 40mm',
    exactRule: '72mm 40mm',
    description: 'Wide 80mm POS continuous adhesive label',
  },
];

interface BarcodePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: BarcodePrintProduct | null;
}

export const BarcodePrintModal: React.FC<BarcodePrintModalProps> = ({
  isOpen,
  onClose,
  product,
}) => {
  const { user } = useAuth();
  const {
    printBarcodeLabel,
    settings,
    usbDevice,
    bluetoothDevice,
    connectBluetooth,
    openHardwareModal,
  } = useThermalPrinter();

  // Dynamic store name without hardcoded 'RETAILVERSE'
  const resolvedStoreName = (
    (settings.storeName && settings.storeName !== 'RETAILVERSE' ? settings.storeName : '') ||
    user?.businessName ||
    (user as any)?.storeName ||
    (user as any)?.shopName ||
    ''
  ).trim();

  const initialQuantity = Math.max(1, Number(product?.stockLevel) || 1);
  const [copies, setCopies] = useState<number>(initialQuantity);
  const [selectedPreset, setSelectedPreset] = useState<LabelDimensions>('50x25');
  const [includeStoreName, setIncludeStoreName] = useState<boolean>(Boolean(resolvedStoreName));
  const [includeSku, setIncludeSku] = useState<boolean>(true);
  const [protocol, setProtocol] = useState<'tspl' | 'escpos'>(settings.labelProtocol || 'tspl');
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  const previewSvgRef = useRef<SVGSVGElement | null>(null);

  // Sync copy count whenever product changes
  useEffect(() => {
    if (product) {
      const stock = Math.max(1, Number(product.stockLevel) || 1);
      setCopies(stock);
    }
  }, [product]);

  // Sync includeStoreName when resolvedStoreName becomes available
  useEffect(() => {
    if (resolvedStoreName) {
      setIncludeStoreName(true);
    }
  }, [resolvedStoreName]);

  // Render live preview SVG barcode
  useEffect(() => {
    if (!isOpen || !product?.barcode || !previewSvgRef.current) return;

    try {
      (JsBarcode as any)(previewSvgRef.current, product.barcode, {
        format: 'CODE128',
        lineColor: '#000000',
        width: selectedPreset === '40x30' ? 1.3 : 1.7,
        height: selectedPreset === '40x30' ? 30 : 38,
        displayValue: true,
        fontSize: 11,
        font: 'monospace',
        textMargin: 2,
        margin: 2,
        background: '#ffffff',
      });
    } catch (err) {
      console.warn('[BarcodePrintModal] SVG render error:', err);
    }
  }, [isOpen, product?.barcode, selectedPreset]);

  if (!isOpen || !product) return null;

  const currentPreset =
    LABEL_SIZE_PRESETS.find((p) => p.id === selectedPreset) || LABEL_SIZE_PRESETS[0];

  const formattedPrice = Number(product.price || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      const storeNameToPrint = includeStoreName ? resolvedStoreName : '';
      await printBarcodeLabel(
        {
          name: product.name,
          sku: includeSku ? product.sku : '',
          barcode: product.barcode,
          price: product.price,
          storeName: storeNameToPrint,
          commandMode: protocol,
        },
        copies,
        currentPreset.exactRule
      );
    } catch (err: any) {
      console.error('[BarcodePrintModal] Print error:', err);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-gradient-to-r from-violet-600 via-indigo-600 to-indigo-700 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Printer className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Direct Thermal Barcode Printing
                {bluetoothDevice ? (
                  <span className="text-[10px] font-semibold bg-emerald-500/30 text-emerald-100 border border-emerald-400/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Bluetooth className="w-2.5 h-2.5" />
                    Bluetooth Connected
                  </span>
                ) : usbDevice ? (
                  <span className="text-[10px] font-semibold bg-emerald-500/30 text-emerald-100 border border-emerald-400/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Usb className="w-2.5 h-2.5" />
                    Direct USB
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={connectBluetooth}
                    className="text-[10px] font-semibold bg-white/20 hover:bg-white/30 text-white border border-white/30 px-2 py-0.5 rounded-full flex items-center gap-1 cursor-pointer transition"
                    title="Pair Bluetooth thermal printer"
                  >
                    <Bluetooth className="w-2.5 h-2.5" />
                    Pair Bluetooth
                  </button>
                )}
              </h3>
              <p className="text-xs text-indigo-100">
                Print pitch-black CODE128 thermal labels for {product.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={openHardwareModal}
              title="Thermal Printer & Hardware Settings"
              className="p-2 text-white/80 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
            >
              <Settings2 className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-white/80 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Label Protocol Mode */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
            <div>
              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 block">
                Command Stream Protocol
              </span>
              <span className="text-[11px] text-zinc-500">
                TSPL for label roll printers (TSC, Xprinter) · ESC/POS for receipt sticker rolls
              </span>
            </div>
            <div className="flex items-center gap-1 bg-white dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700">
              <button
                type="button"
                onClick={() => setProtocol('tspl')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                  protocol === 'tspl'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                TSPL (Label)
              </button>
              <button
                type="button"
                onClick={() => setProtocol('escpos')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                  protocol === 'escpos'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                ESC/POS (Roll)
              </button>
            </div>
          </div>

          {/* Label Size Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 uppercase tracking-wider">
                <Tag className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                Thermal Sticker Size
              </label>
              <span className="text-[11px] text-zinc-500 font-medium">
                Active:{' '}
                <strong className="text-indigo-600 dark:text-indigo-400">
                  {currentPreset.dimensions}
                </strong>
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {LABEL_SIZE_PRESETS.map((preset) => {
                const isSelected = selectedPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedPreset(preset.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 ring-2 ring-indigo-500/20'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/40 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-bold">{preset.name}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                    </div>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-tight">
                      {preset.id === '50x25' ? 'Standard 2"' : preset.id === '50x30' ? 'Retail Roll' : preset.id === '40x30' ? 'Compact' : 'Wide 3"'}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Number of Copies Controls */}
          <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-600" />
                Print Copies (Quantity)
              </span>
              <p className="text-[11px] text-zinc-500">
                Number of physical barcode stickers to print
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-sm p-1">
                <button
                  type="button"
                  onClick={() => setCopies((prev) => Math.max(1, prev - 1))}
                  className="p-1 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-95 transition-all"
                  aria-label="Decrease copies"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={copies}
                  onChange={(e) =>
                    setCopies(Math.max(1, Math.min(500, parseInt(e.target.value, 10) || 1)))
                  }
                  className="w-12 text-center text-xs font-bold bg-transparent text-zinc-900 dark:text-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setCopies((prev) => Math.min(500, prev + 1))}
                  className="p-1 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-95 transition-all"
                  aria-label="Increase copies"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex items-center gap-1">
                {[1, 5, 10].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCopies(preset)}
                    className={`px-2 py-1 text-xs font-semibold rounded-lg border transition-all ${
                      copies === preset
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
                {Number(product.stockLevel) > 0 && (
                  <button
                    type="button"
                    onClick={() => setCopies(Number(product.stockLevel))}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition-all"
                  >
                    Stock ({product.stockLevel})
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Label Content Toggles */}
          <div className="flex items-center gap-6 px-1">
            <label className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includeStoreName}
                onChange={(e) => setIncludeStoreName(e.target.checked)}
                className="w-3.5 h-3.5 accent-indigo-600 rounded cursor-pointer"
              />
              Show Store Name {resolvedStoreName ? `(${resolvedStoreName})` : ''}
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includeSku}
                onChange={(e) => setIncludeSku(e.target.checked)}
                className="w-3.5 h-3.5 accent-indigo-600 rounded cursor-pointer"
              />
              Show SKU ({product.sku || 'N/A'})
            </label>
          </div>

          {/* Live Preview Card */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Live High-Contrast Thermal Sticker Preview
              </span>
              <span className="text-[11px] font-mono text-zinc-500">
                100% Thermal Pitch-Black Contrast
              </span>
            </div>

            <div className="p-6 bg-zinc-100 dark:bg-zinc-950 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 flex flex-col items-center justify-center">
              {/* Simulated Thermal Sticker */}
              <div
                className={`label-card thermal-sticker-card bg-white text-black p-3 rounded-xl border border-zinc-400 shadow-md flex flex-col items-center justify-between text-center select-none transition-all ${
                  selectedPreset === '40x30'
                    ? 'w-56 min-h-[100px]'
                    : selectedPreset === '50x25'
                    ? 'w-64 min-h-[110px]'
                    : selectedPreset === '50x30'
                    ? 'w-64 min-h-[125px]'
                    : 'w-72 min-h-[140px]'
                }`}
              >
                {includeStoreName && resolvedStoreName && (
                  <div className="w-full text-[10px] text-black font-extrabold uppercase tracking-wider mb-0.5">
                    {resolvedStoreName}
                  </div>
                )}

                <h4
                  className="sticker-title text-xs font-bold text-black line-clamp-1 w-full px-1"
                  title={product.name}
                >
                  {product.name}
                </h4>

                {/* SVG Barcode Output */}
                <div className="sticker-barcode-container w-full flex items-center justify-center my-0.5 bg-white">
                  <svg
                    ref={previewSvgRef}
                    className="max-w-full h-auto"
                    style={{ shapeRendering: 'crispEdges', imageRendering: 'pixelated' }}
                  />
                </div>

                <div className="sticker-number text-[9px] font-mono font-bold text-black">
                  {product.barcode}
                  {includeSku && product.sku && <span className="ml-1 text-zinc-600 font-normal">| SKU: {product.sku}</span>}
                </div>
              </div>

              <p className="text-[11px] text-zinc-500 mt-2 text-center">
                Engine: {bluetoothDevice ? `Direct Bluetooth (${bluetoothDevice.name || 'Printer'}) · ${protocol.toUpperCase()}` : usbDevice ? `WebUSB Raw · ${protocol.toUpperCase()}` : 'Isolated Hidden iFrame (@page exact size, 0 margin)'}
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            Total Labels to Print: <strong className="text-zinc-900 dark:text-white">{copies}</strong> ({currentPreset.dimensions})
          </div>
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="rounded-xl border-zinc-300 dark:border-zinc-700"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handlePrint}
              disabled={isPrinting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-600/25 px-5 font-semibold gap-2"
            >
              <Printer className="w-4 h-4" />
              {isPrinting
                ? 'Printing...'
                : bluetoothDevice
                ? `Print ${copies} ${copies === 1 ? 'Label' : 'Labels'} via Bluetooth`
                : `Print ${copies} ${copies === 1 ? 'Label' : 'Labels'}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
