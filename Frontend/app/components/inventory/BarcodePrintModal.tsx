import React, { useState, useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { X, Printer, Plus, Minus, Layers, Check, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';

export interface BarcodePrintProduct {
  name: string;
  sku: string;
  barcode: string;
  price: number | string;
  stockLevel?: number | string;
  category?: string;
}

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
  const initialQuantity = Math.max(1, Number(product?.stockLevel) || 1);
  const [copies, setCopies] = useState<number>(initialQuantity);
  const [renderedBarcodes, setRenderedBarcodes] = useState<boolean>(false);
  const labelsContainerRef = useRef<HTMLDivElement | null>(null);

  // Sync copy count whenever product changes
  useEffect(() => {
    if (product) {
      const stock = Math.max(1, Number(product.stockLevel) || 1);
      setCopies(stock);
    }
  }, [product]);

  // Render barcodes using JsBarcode
  useEffect(() => {
    if (!isOpen || !product?.barcode) return;

    setRenderedBarcodes(false);
    const timer = setTimeout(() => {
      try {
        const svgElements = document.querySelectorAll<SVGSVGElement>('.printable-barcode-svg');
        svgElements.forEach((svg) => {
          try {
            (JsBarcode as any)(svg, product.barcode, {
              format: 'CODE128',
              lineColor: '#000000',
              width: 1.8,
              height: 42,
              displayValue: true,
              fontSize: 12,
              font: 'monospace',
              textMargin: 3,
              margin: 4,
              background: '#ffffff',
            });
          } catch (itemErr) {
            console.warn('[BarcodePrintModal] Individual barcode render error:', itemErr);
          }
        });
        setRenderedBarcodes(true);
      } catch (err) {
        console.error('[BarcodePrintModal] Barcode batch render error:', err);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [isOpen, product?.barcode, copies]);

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen || !product) return null;

  const formattedPrice = Number(product.price || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <>
      {/* Print-specific CSS styles */}
      <style>{`
        @media print {
          /* Hide all application chrome and modals */
          body * {
            visibility: hidden !important;
          }
          /* Make only the printable sheet and its contents visible */
          #printable-barcode-sheet,
          #printable-barcode-sheet * {
            visibility: visible !important;
          }
          #printable-barcode-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 4mm !important;
            background: #ffffff !important;
            display: grid !important;
            grid-template-columns: repeat(auto-fill, minmax(50mm, 1fr)) !important;
            gap: 4mm !important;
            page-break-inside: avoid !important;
          }
          .barcode-label-card {
            width: 50mm !important;
            height: 28mm !important;
            padding: 2mm !important;
            box-sizing: border-box !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            border: 1px dashed #cccccc !important;
            background: #ffffff !important;
            color: #000000 !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            text-align: center !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
        }
      `}</style>

      {/* Screen Modal Container */}
      <div
        className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
        role="dialog"
        aria-modal="true"
      >
        <div className="relative w-full max-w-3xl max-h-[90vh] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-gradient-to-r from-violet-600 via-indigo-600 to-indigo-700 text-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Printer className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Print Barcode Labels</h3>
                <p className="text-xs text-indigo-100">
                  Thermal label print preview for {product.name}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-white/80 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Configuration Toolbar */}
          <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Number of Copies:
              </span>
              <div className="flex items-center bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-sm p-1">
                <button
                  type="button"
                  onClick={() => setCopies((prev) => Math.max(1, prev - 1))}
                  className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 active:scale-95 transition-all"
                  aria-label="Decrease copies"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={copies}
                  onChange={(e) => setCopies(Math.max(1, Math.min(500, parseInt(e.target.value, 10) || 1)))}
                  className="w-14 text-center text-sm font-bold bg-transparent text-zinc-900 dark:text-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setCopies((prev) => Math.min(500, prev + 1))}
                  className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 active:scale-95 transition-all"
                  aria-label="Increase copies"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-1.5">
                {[1, 5, 10].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCopies(preset)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-all ${
                      copies === preset
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
                {Number(product.stockLevel) > 0 && (
                  <button
                    type="button"
                    onClick={() => setCopies(Number(product.stockLevel))}
                    className="px-2.5 py-1 text-xs font-medium rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all"
                  >
                    Stock ({product.stockLevel})
                  </button>
                )}
              </div>
            </div>

            <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Format:</span> CODE128
              (50mm × 28mm)
            </div>
          </div>

          {/* Printable Sheet / Preview Body */}
          <div className="flex-1 overflow-y-auto p-6 bg-zinc-100 dark:bg-zinc-950">
            <div
              id="printable-barcode-sheet"
              ref={labelsContainerRef}
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4"
            >
              {Array.from({ length: copies }).map((_, idx) => (
                <div
                  key={idx}
                  className="barcode-label-card bg-white rounded-2xl border border-zinc-200 dark:border-zinc-700/80 p-4 shadow-sm flex flex-col items-center justify-between text-center select-none"
                >
                  {/* Retailverse Brand Tag */}
                  <div className="w-full flex items-center justify-between text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1">
                    <span>Retailverse</span>
                    <span className="font-mono text-zinc-500">{product.sku}</span>
                  </div>

                  {/* Product Title */}
                  <h4
                    className="text-xs font-bold text-zinc-900 line-clamp-1 w-full"
                    title={product.name}
                  >
                    {product.name}
                  </h4>

                  {/* Price */}
                  <div className="text-sm font-extrabold text-indigo-600 dark:text-indigo-600 my-0.5">
                    ₹{formattedPrice}
                  </div>

                  {/* SVG Barcode Output */}
                  <div className="w-full flex items-center justify-center my-1 overflow-hidden">
                    <svg className="printable-barcode-svg max-w-full h-auto" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between">
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Total Labels to Print: <strong className="text-zinc-900 dark:text-white">{copies}</strong>
            </div>
            <div className="flex items-center gap-3">
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
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-600/25 px-5 font-semibold gap-2"
              >
                <Printer className="w-4 h-4" />
                Print {copies} {copies === 1 ? 'Label' : 'Labels'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
