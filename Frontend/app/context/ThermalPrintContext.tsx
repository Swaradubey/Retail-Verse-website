import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import JsBarcode from 'jsbarcode';
import {
  thermalHardware,
  thermalBluetooth,
  PrinterSettings,
  DEFAULT_PRINTER_SETTINGS,
  buildReceiptEscPos,
  buildBarcodeLabelEscPos,
  printViaIsolatedIframe,
  BarcodeLabelData,
} from '../lib/thermalPrinter';
import {
  ThermalReceiptOrder,
  PrintReceiptOptions,
  printThermalReceipt,
} from '../utils/posPrintReceipt';
import { ThermalHardwareModal } from '../components/common/ThermalHardwareModal';

export interface ThermalPrintContextType {
  settings: PrinterSettings;
  updateSettings: (newSettings: Partial<PrinterSettings>) => void;
  isWebUsbSupported: boolean;
  usbDevice: USBDevice | null;
  connectUsb: () => Promise<void>;
  disconnectUsb: () => Promise<void>;
  isBluetoothSupported: boolean;
  bluetoothDevice: any;
  connectBluetooth: () => Promise<void>;
  disconnectBluetooth: () => Promise<void>;
  printReceipt: (
    order: ThermalReceiptOrder,
    cashierName?: string,
    options?: PrintReceiptOptions
  ) => Promise<{ success: boolean; method: 'bluetooth' | 'webusb' | 'iframe'; error?: string }>;
  printBarcodeLabel: (
    data: BarcodeLabelData,
    copies?: number,
    exactDimensions?: string
  ) => Promise<{ success: boolean; method: 'bluetooth' | 'webusb' | 'iframe'; error?: string }>;
  isHardwareModalOpen: boolean;
  openHardwareModal: () => void;
  closeHardwareModal: () => void;
  testPrintReceipt: () => Promise<void>;
  testPrintLabel: () => Promise<void>;
}

const ThermalPrintContext = createContext<ThermalPrintContextType | undefined>(undefined);

const SETTINGS_STORAGE_KEY = 'retailverse_thermal_printer_settings';

export const ThermalPrintProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<PrinterSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_PRINTER_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (_) {}
    return DEFAULT_PRINTER_SETTINGS;
  });

  const [usbDevice, setUsbDevice] = useState<USBDevice | null>(null);
  const [bluetoothDevice, setBluetoothDevice] = useState<any>(null);
  const [isHardwareModalOpen, setIsHardwareModalOpen] = useState<boolean>(false);
  const isWebUsbSupported = thermalHardware.isSupported();
  const isBluetoothSupported = thermalBluetooth.isSupported();

  // Try auto-reconnect to paired USB devices on mount
  useEffect(() => {
    let mounted = true;
    if (isWebUsbSupported) {
      thermalHardware
        .reconnectPaired()
        .then((dev) => {
          if (mounted && dev) {
            setUsbDevice(dev);
            console.log('[ThermalPrintContext] Reconnected to USB thermal printer:', dev.productName);
          }
        })
        .catch(() => {});
    }
    return () => {
      mounted = false;
    };
  }, [isWebUsbSupported]);

  const updateSettings = useCallback((newSettings: Partial<PrinterSettings>) => {
    setSettings((prev) => {
      const merged = { ...prev, ...newSettings };
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
      } catch (_) {}
      return merged;
    });
  }, []);

  const connectUsb = useCallback(async () => {
    try {
      const dev = await thermalHardware.requestDevice();
      if (dev) {
        setUsbDevice(dev);
        toast.success(`Connected to ${dev.productName || 'USB Thermal Printer'}`);
      }
    } catch (err: any) {
      console.error('[ThermalPrintContext] Connect USB error:', err);
      toast.error(err?.message || 'Failed to connect USB thermal printer');
    }
  }, []);

  const disconnectUsb = useCallback(async () => {
    try {
      await thermalHardware.disconnect();
      setUsbDevice(null);
      toast.info('USB thermal printer disconnected');
    } catch (err: any) {
      console.error('[ThermalPrintContext] Disconnect USB error:', err);
    }
  }, []);

  const connectBluetooth = useCallback(async () => {
    try {
      const dev = await thermalBluetooth.requestDevice();
      if (dev) {
        setBluetoothDevice(dev);
        toast.success(`Connected to ${dev.name || 'Bluetooth Thermal Printer'}`);
      }
    } catch (err: any) {
      console.error('[ThermalPrintContext] Connect Bluetooth error:', err);
      toast.error(err?.message || 'Failed to connect Bluetooth thermal printer');
    }
  }, []);

  const disconnectBluetooth = useCallback(async () => {
    try {
      await thermalBluetooth.disconnect();
      setBluetoothDevice(null);
      toast.info('Bluetooth thermal printer disconnected');
    } catch (err: any) {
      console.error('[ThermalPrintContext] Disconnect Bluetooth error:', err);
    }
  }, []);

  const printReceipt = useCallback(
    async (
      order: ThermalReceiptOrder,
      cashierName: string = 'Staff',
      options?: PrintReceiptOptions
    ) => {
      const mergedOptions: PrintReceiptOptions = {
        rollWidth: settings.rollWidth,
        storeName: settings.storeName,
        storeTagline: settings.storeTagline,
        storeAddress: settings.storeAddress,
        storePhone: settings.storePhone,
        storeGstin: settings.storeGstin,
        footerNote: settings.footerNote,
        ...options,
      };

      const result = await printThermalReceipt(order, cashierName, mergedOptions);
      if (result.success) {
        if (result.method === 'bluetooth') {
          toast.success('Receipt sent directly to Bluetooth thermal printer');
        } else if (result.method === 'webusb') {
          toast.success('Receipt sent directly to USB thermal printer');
        } else {
          toast.success('Thermal receipt sent to printer');
        }
      } else {
        toast.error(`Receipt print error: ${result.error || 'Failed to dispatch'}`);
      }
      return result;
    },
    [settings]
  );

function generateBarcodeSvgString(barcode: string, barWidth = 1.3, barHeight = 28): string {
  if (typeof document === 'undefined') return '';
  try {
    const svgElem = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    (JsBarcode as any)(svgElem, barcode, {
      format: 'CODE128',
      width: barWidth,
      height: barHeight,
      displayValue: false,
      margin: 0,
      lineColor: '#000000',
    });
    return svgElem.outerHTML;
  } catch (err) {
    console.warn('[ThermalPrintContext] Barcode SVG generation error:', err);
    return `<div style="font-family:monospace;font-size:11px;font-weight:bold;letter-spacing:1px;">${barcode}</div>`;
  }
}

  const printBarcodeLabel = useCallback(
    async (
      data: BarcodeLabelData,
      copies: number = 1,
      exactDimensions: string = '50mm 25mm'
    ) => {
      const count = Math.max(1, copies);

      // 1. If WebUSB is connected, try raw ESC/POS
      if (thermalHardware.getConnectedDevice()) {
        try {
          const buffer = buildBarcodeLabelEscPos(
            {
              ...data,
              storeName: data.storeName || settings.storeName,
            },
            count
          );
          await thermalHardware.sendRaw(buffer);
          toast.success(`Printed ${count} barcode label${count === 1 ? '' : 's'} via USB`);
          return { success: true, method: 'webusb' as const };
        } catch (usbErr) {
          console.warn('[ThermalPrintContext] USB label print failed, using isolated iframe:', usbErr);
        }
      }

      // 2. Fallback: Isolated hidden <iframe> with exact sticker bounding box
      try {
        const formattedPrice = Number(data.price || 0).toLocaleString('en-IN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

        // Parse exact dimensions (e.g. "50mm 25mm", "50mm 30mm", "40mm 30mm", "72mm 40mm")
        let widthMm = 50;
        let heightMm = 25;
        if (exactDimensions) {
          const parts = exactDimensions.trim().split(/\s+/);
          if (parts.length >= 2) {
            const parsedW = parseFloat(parts[0]);
            const parsedH = parseFloat(parts[1]);
            if (!isNaN(parsedW) && parsedW > 0) widthMm = parsedW;
            if (!isNaN(parsedH) && parsedH > 0) heightMm = parsedH;
          }
        }

        // Safe printable dimensions with 1mm edge buffer to prevent physical clipping
        const cardWidthMm = Math.max(10, widthMm - 2);
        const cardHeightMm = Math.max(10, heightMm - 1.5);
        const isCompact = heightMm <= 26;
        const barWidth = widthMm <= 42 ? 1.1 : 1.35;
        const barHeight = isCompact ? 22 : 30;
        const barcodeContainerHeight = isCompact ? '9mm' : '12mm';
        const titleFontSize = isCompact ? '9px' : '10px';
        const numFontSize = isCompact ? '8px' : '9px';
        const mrpFontSize = isCompact ? '8.5px' : '9.5px';

        // Pre-generate raw SVG barcodes in Javascript so they are 100% rendered offline without CDN delay
        const svgContent = generateBarcodeSvgString(data.barcode, barWidth, barHeight);

        // Build HTML for the requested number of stickers
        let labelsHtml = '';
        for (let i = 0; i < count; i++) {
          labelsHtml += `
            <div class="thermal-sticker-card">
              <div class="sticker-title">${data.name}</div>
              <div class="sticker-barcode-container">
                ${svgContent}
              </div>
              <div class="sticker-number">${data.barcode}${data.sku ? ` | SKU: ${data.sku}` : ''}</div>
              <div class="sticker-mrp">MRP: &#8377;${formattedPrice} (Incl. of all taxes)</div>
            </div>
          `;
        }

        const iframeHtml = `
          <style>
            @page {
              size: ${exactDimensions || '50mm 25mm'} !important;
              margin: 0 !important;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #fff !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color: #000 !important;
              font-family: Arial, Helvetica, sans-serif !important;
            }
            .sticker-container {
              margin: 0 !important;
              padding: 0 !important;
            }
            .thermal-sticker-card {
              width: ${cardWidthMm}mm !important;
              height: ${cardHeightMm}mm !important;
              max-height: ${cardHeightMm}mm !important;
              margin: 0.75mm auto !important;
              padding: 0.5mm 1mm !important;
              box-sizing: border-box !important;
              display: flex !important;
              flex-direction: column !important;
              align-items: center !important;
              justify-content: space-between !important;
              text-align: center !important;
              overflow: hidden !important;
              break-inside: avoid !important;
              page-break-inside: avoid !important;
              break-after: page !important;
              page-break-after: always !important;
            }
            .thermal-sticker-card:last-child {
              break-after: avoid !important;
              page-break-after: avoid !important;
            }
            .sticker-title {
              font-size: ${titleFontSize} !important;
              font-weight: 700 !important;
              line-height: 1.1 !important;
              white-space: nowrap !important;
              overflow: hidden !important;
              text-overflow: ellipsis !important;
              max-width: 100% !important;
              color: #000 !important;
            }
            .sticker-barcode-container {
              display: flex !important;
              justify-content: center !important;
              align-items: center !important;
              height: ${barcodeContainerHeight} !important;
              width: 100% !important;
              overflow: hidden !important;
            }
            .sticker-barcode-container svg {
              max-height: ${barcodeContainerHeight} !important;
              max-width: 96% !important;
              image-rendering: pixelated !important;
              shape-rendering: crispEdges !important;
            }
            .sticker-number {
              font-size: ${numFontSize} !important;
              letter-spacing: 0.5px !important;
              font-family: monospace !important;
              font-weight: 600 !important;
              line-height: 1 !important;
              color: #000 !important;
              white-space: nowrap !important;
              overflow: hidden !important;
              text-overflow: ellipsis !important;
              max-width: 100% !important;
            }
            .sticker-mrp {
              font-size: ${mrpFontSize} !important;
              font-weight: 700 !important;
              line-height: 1.1 !important;
              white-space: nowrap !important;
              color: #000 !important;
            }
          </style>
          <div class="sticker-container">
            ${labelsHtml}
          </div>
        `;

        await printViaIsolatedIframe({
          html: iframeHtml,
          title: `Labels - ${data.barcode}`,
          exactDimensions: exactDimensions,
        });

        toast.success(`Printed ${count} barcode label${count === 1 ? '' : 's'}`);
        return { success: true, method: 'iframe' as const };
      } catch (err: any) {
        console.error('[ThermalPrintContext] Label print error:', err);
        toast.error(`Label print failed: ${err?.message || 'Error'}`);
        return { success: false, method: 'iframe' as const, error: err?.message };
      }
    },
    [settings]
  );

  const testPrintReceipt = useCallback(async () => {
    const mockOrder: ThermalReceiptOrder = {
      invoiceNumber: 'TEST-' + Math.floor(1000 + Math.random() * 9000),
      createdAt: new Date(),
      paymentMethod: 'CASH',
      cashierName: 'POS Admin',
      customerName: 'Test Customer',
      customerPhone: '9876543210',
      items: [
        { name: 'Organic Cotton T-Shirt', sku: 'TSH-001', barcode: '890123456789', quantity: 2, unitPrice: 499, itemTotal: 998 },
        { name: 'Stainless Steel Water Bottle', sku: 'BOT-002', barcode: '890987654321', quantity: 1, unitPrice: 750, itemTotal: 750 },
      ],
      subtotal: 1748,
      discountAmount: 100,
      couponCode: 'WELCOME10',
      totalGst: 82.4,
      grandTotal: 1730.4,
    };

    await printReceipt(mockOrder, 'Admin', { rollWidth: settings.rollWidth });
  }, [printReceipt, settings.rollWidth]);

  const testPrintLabel = useCallback(async () => {
    await printBarcodeLabel(
      {
        name: 'Classic Linen Shirt - Blue',
        sku: 'RTV-SHIRT-M',
        barcode: '890123456789',
        price: 1299.0,
      },
      1,
      '50mm 25mm'
    );
  }, [printBarcodeLabel]);

  return (
    <ThermalPrintContext.Provider
      value={{
        settings,
        updateSettings,
        isWebUsbSupported,
        usbDevice,
        connectUsb,
        disconnectUsb,
        isBluetoothSupported,
        bluetoothDevice,
        connectBluetooth,
        disconnectBluetooth,
        printReceipt,
        printBarcodeLabel,
        isHardwareModalOpen,
        openHardwareModal: () => setIsHardwareModalOpen(true),
        closeHardwareModal: () => setIsHardwareModalOpen(false),
        testPrintReceipt,
        testPrintLabel,
      }}
    >
      {children}

      {/* Global Thermal Hardware Settings & Kiosk Guide Modal */}
      <ThermalHardwareModal
        isOpen={isHardwareModalOpen}
        onClose={() => setIsHardwareModalOpen(false)}
        settings={settings}
        onSaveSettings={updateSettings}
        isWebUsbSupported={isWebUsbSupported}
        usbDevice={usbDevice}
        onConnectUsb={connectUsb}
        onDisconnectUsb={disconnectUsb}
        isBluetoothSupported={isBluetoothSupported}
        bluetoothDevice={bluetoothDevice}
        onConnectBluetooth={connectBluetooth}
        onDisconnectBluetooth={disconnectBluetooth}
        onTestPrintReceipt={testPrintReceipt}
        onTestPrintLabel={testPrintLabel}
      />
    </ThermalPrintContext.Provider>
  );
};

export function useThermalPrinter(): ThermalPrintContextType {
  const context = useContext(ThermalPrintContext);
  if (!context) {
    throw new Error('useThermalPrinter must be used within a ThermalPrintProvider');
  }
  return context;
}
