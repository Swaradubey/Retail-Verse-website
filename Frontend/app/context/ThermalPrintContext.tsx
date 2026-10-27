import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  thermalHardware,
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
  printReceipt: (
    order: ThermalReceiptOrder,
    cashierName?: string,
    options?: PrintReceiptOptions
  ) => Promise<{ success: boolean; method: 'webusb' | 'iframe'; error?: string }>;
  printBarcodeLabel: (
    data: BarcodeLabelData,
    copies?: number,
    exactDimensions?: string
  ) => Promise<{ success: boolean; method: 'webusb' | 'iframe'; error?: string }>;
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
  const [isHardwareModalOpen, setIsHardwareModalOpen] = useState<boolean>(false);
  const isWebUsbSupported = thermalHardware.isSupported();

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
        if (result.method === 'webusb') {
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
          toast.success(`Printed ${count} barcode labels via USB`);
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

        const storeTag = (data.storeName || settings.storeName || 'RETAILVERSE').toUpperCase();

        // Build HTML for the requested number of stickers
        let labelsHtml = '';
        for (let i = 0; i < count; i++) {
          labelsHtml += `
            <div class="sticker-card">
              <div class="sticker-brand">${storeTag}</div>
              <div class="sticker-name">${data.name}</div>
              <div class="sticker-price">MRP: &#8377;${formattedPrice}</div>
              <svg class="barcode-svg" id="barcode-target-${i}"></svg>
              <div class="sticker-sku">${data.sku ? `SKU: ${data.sku}` : ''}</div>
            </div>
          `;
        }

        const iframeHtml = `
          <style>
            @page {
              size: ${exactDimensions};
              margin: 0 !important;
            }
            body {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              color: #000000 !important;
              font-family: Arial, Helvetica, sans-serif !important;
            }
            .sticker-card {
              width: 100%;
              height: 100%;
              box-sizing: border-box;
              padding: 1.5mm 2mm;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: space-evenly;
              text-align: center;
              page-break-inside: avoid;
              page-break-after: always;
              overflow: hidden;
            }
            .sticker-card:last-child {
              page-break-after: auto;
            }
            .sticker-brand {
              font-size: 8px;
              font-weight: 800;
              letter-spacing: 0.5px;
              color: #000;
              text-transform: uppercase;
              line-height: 1;
              white-space: nowrap;
            }
            .sticker-name {
              font-size: 9px;
              font-weight: 700;
              color: #000;
              line-height: 1.15;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              width: 100%;
            }
            .sticker-price {
              font-size: 10px;
              font-weight: 900;
              color: #000;
              line-height: 1;
            }
            .barcode-svg {
              width: 90%;
              max-height: 14mm;
              margin: 0 auto;
              shape-rendering: crispEdges;
            }
            .sticker-sku {
              font-size: 7.5px;
              font-family: monospace;
              color: #000;
              line-height: 1;
            }
          </style>
          <div class="sticker-container">
            ${labelsHtml}
          </div>
          <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
          <script>
            window.onload = function() {
              if (window.JsBarcode) {
                var svgs = document.querySelectorAll('.barcode-svg');
                svgs.forEach(function(el) {
                  try {
                    JsBarcode(el, "${data.barcode}", {
                      format: "CODE128",
                      width: 1.4,
                      height: 32,
                      displayValue: true,
                      fontSize: 10,
                      font: "monospace",
                      margin: 2,
                      lineColor: "#000000"
                    });
                  } catch(e) {}
                });
              }
            };
          </script>
        `;

        await printViaIsolatedIframe({
          html: iframeHtml,
          title: `Labels - ${data.barcode}`,
          exactDimensions: exactDimensions,
        });

        toast.success(`Printed ${count} barcode labels`);
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
