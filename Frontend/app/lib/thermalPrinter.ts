/**
 * Direct Thermal Printer & Hardware Integration Service
 * 
 * Supports:
 * 1. WebUSB direct raw binary ESC/POS communication (Bypasses browser print dialog completely).
 * 2. ESC/POS command builders (Init, Text styling, Alignment, Barcodes, Line feeds, Paper cut).
 * 3. Graceful fallback to isolated hidden <iframe> DOM @media print engine.
 */
import JsBarcode from 'jsbarcode';

// ─── ESC/POS BYTE CONSTANTS ───────────────────────────────────────────────────
export const ESC_POS = {
  // Initialization
  INIT: new Uint8Array([0x1B, 0x40]), // ESC @

  // Line Feeds & Spacing
  LF: new Uint8Array([0x0A]), // LF
  FEED_LINES: (n: number) => new Uint8Array([0x1B, 0x64, Math.min(255, Math.max(0, n))]), // ESC d n

  // Text Alignment: 0 = Left, 1 = Center, 2 = Right
  ALIGN_LEFT: new Uint8Array([0x1B, 0x61, 0x00]),
  ALIGN_CENTER: new Uint8Array([0x1B, 0x61, 0x01]),
  ALIGN_RIGHT: new Uint8Array([0x1B, 0x61, 0x02]),

  // Bold Text
  BOLD_ON: new Uint8Array([0x1B, 0x45, 0x01]),
  BOLD_OFF: new Uint8Array([0x1B, 0x45, 0x00]),

  // Underline
  UNDERLINE_ON: new Uint8Array([0x1B, 0x2D, 0x01]),
  UNDERLINE_OFF: new Uint8Array([0x1B, 0x2D, 0x00]),

  // Text Size (GS ! n): 0x00 = Normal, 0x11 = Double Width & Height, 0x01 = Double Height, 0x10 = Double Width
  TEXT_NORMAL: new Uint8Array([0x1D, 0x21, 0x00]),
  TEXT_DOUBLE_HEIGHT: new Uint8Array([0x1D, 0x21, 0x01]),
  TEXT_DOUBLE_WIDTH: new Uint8Array([0x1D, 0x21, 0x10]),
  TEXT_DOUBLE: new Uint8Array([0x1D, 0x21, 0x11]),

  // Font Selection: 0 = Font A (12x24), 1 = Font B (9x17 condensed)
  FONT_A: new Uint8Array([0x1B, 0x4D, 0x00]),
  FONT_B: new Uint8Array([0x1B, 0x4D, 0x01]),

  // Paper Cut Commands
  CUT_FULL: new Uint8Array([0x1D, 0x56, 0x41, 0x00]), // GS V 65 0 (Feed and Full cut)
  CUT_PARTIAL: new Uint8Array([0x1D, 0x56, 0x42, 0x00]), // GS V 66 0 (Feed and Partial cut)

  // Barcode Commands (GS k)
  BARCODE_HEIGHT: (h: number) => new Uint8Array([0x1D, 0x68, Math.min(255, Math.max(1, h))]), // GS h n (1-255)
  BARCODE_WIDTH: (w: number) => new Uint8Array([0x1D, 0x77, Math.min(6, Math.max(2, w))]), // GS w n (2-6)
  BARCODE_TEXT_BELOW: new Uint8Array([0x1D, 0x48, 0x02]), // GS H 2 (HRI below barcode)
  BARCODE_TEXT_NONE: new Uint8Array([0x1D, 0x48, 0x00]), // GS H 0 (No HRI text)
};

// ─── INTERFACES ──────────────────────────────────────────────────────────────
export interface PrinterSettings {
  rollWidth: '80mm' | '58mm';
  autoCut: boolean;
  storeName: string;
  storeTagline?: string;
  storeAddress?: string;
  storePhone?: string;
  storeGstin?: string;
  footerNote?: string;
  labelProtocol?: 'tspl' | 'escpos';
}

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  rollWidth: '80mm',
  autoCut: true,
  storeName: '',
  storeTagline: 'TAX INVOICE',
  storeAddress: '',
  storePhone: '',
  storeGstin: '',
  footerNote: 'THANKS FOR YOUR VISIT!',
  labelProtocol: 'tspl',
};

export interface OrderItem {
  name?: string;
  barcode?: string;
  sku?: string;
  quantity?: number;
  unitPrice?: number;
  price?: number;
  itemTotal?: number;
}

export interface ReceiptData {
  invoiceNumber?: string;
  orderNumber?: string;
  orderId?: string;
  _id?: string;
  createdAt?: string | Date | number;
  paymentMethod?: string;
  paymentStatus?: string;
  cashierName?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  upiId?: string;
  whatsappPhone?: string;
  paymentDetails?: {
    cardLast4?: string;
    cardNetwork?: string;
    cardBrand?: string;
    upiId?: string;
    whatsappPhone?: string;
  };
  items?: OrderItem[];
  subtotal?: number;
  discountAmount?: number;
  couponCode?: string;
  totalGst?: number;
  taxPrice?: number;
  grandTotal?: number;
  totalPrice?: number;
  totalAmount?: number;
}

export interface BarcodeLabelData {
  name: string;
  sku: string;
  barcode: string;
  price: number | string;
  mrp?: number | string;
  category?: string;
  storeName?: string;
  copies?: number;
  labelSize?: '50x25' | '50x30' | '40x30' | '72x40';
  commandMode?: 'tspl' | 'escpos' | 'bitmap';
}

// ─── WEBUSB HARDWARE LAYER ───────────────────────────────────────────────────
class ThermalHardwareManager {
  private activeDevice: USBDevice | null = null;
  private endpointNumber: number = 1;

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'usb' in navigator;
  }

  public getConnectedDevice(): USBDevice | null {
    return this.activeDevice;
  }

  /**
   * Scan for paired devices or prompt user to pick a USB thermal printer.
   */
  public async requestDevice(): Promise<USBDevice | null> {
    if (!this.isSupported()) {
      throw new Error('WebUSB is not supported in this browser environment.');
    }

    try {
      // Common thermal printer USB Vendor IDs (Epson, Star, Xprinter, Rongta, Munbyn, TSC, TVS, Zebra, POS-58, POS-80)
      const commonVendorFilters = [
        { classCode: 0x07 }, // USB Printer Class
        { vendorId: 0x04b8 }, // Epson
        { vendorId: 0x0519 }, // Star Micronics
        { vendorId: 0x0416 }, // Xprinter / Winpos
        { vendorId: 0x0fe6 }, // ICS / Rongta
        { vendorId: 0x1fc9 }, // NXP / Thermal printers
        { vendorId: 0x0483 }, // STMicroelectronics (Munbyn, ZJiang)
        { vendorId: 0x1a86 }, // QinHeng Electronics (CH340 USB-Serial Thermal)
        { vendorId: 0x0dd4 }, // Custom / Gprinter
        { vendorId: 0x1203 }, // TSC Auto ID
        { vendorId: 0x20d1 }, // TVS / Posiflex
        { vendorId: 0x0471 }, // TVS Electronics
        { vendorId: 0x067b }, // Prolific PL2303 USB-Serial
        { vendorId: 0x0403 }, // FTDI USB-Serial
        { vendorId: 0x10c4 }, // Silicon Labs CP210x USB-Serial
        { vendorId: 0x28e9 }, // GD32 Thermal Printers
        { vendorId: 0x154f }, // Bixolon / TVS
        { vendorId: 0x0a5f }, // Zebra Technologies
        { vendorId: 0x04f9 }, // Brother
        { vendorId: 0x03f0 }, // HP POS
        {}, // Universal fallback: allows selecting any connected USB device
      ];

      const device = await navigator.usb.requestDevice({
        filters: commonVendorFilters,
      });

      await this.connectDevice(device);
      return device;
    } catch (err: any) {
      if (err.name === 'NotFoundError') {
        console.log('[ThermalHardwareManager] User cancelled USB device selection.');
        return null;
      }
      console.error('[ThermalHardwareManager] Error requesting USB device:', err);
      throw err;
    }
  }

  /**
   * Connect and configure USB interface and endpoint.
   */
  public async connectDevice(device: USBDevice): Promise<boolean> {
    try {
      await device.open();
      if (device.configuration === null) {
        await device.selectConfiguration(1);
      }

      // Find the printer interface
      let printerInterfaceNumber = 0;
      let outEndpoint = 1;

      const interfaces = device.configuration?.interfaces || [];
      for (const iface of interfaces) {
        for (const alt of iface.alternates) {
          const outEp = alt.endpoints.find((ep) => ep.direction === 'out');
          if (outEp) {
            printerInterfaceNumber = iface.interfaceNumber;
            outEndpoint = outEp.endpointNumber;
            break;
          }
        }
      }

      await device.claimInterface(printerInterfaceNumber);
      this.activeDevice = device;
      this.endpointNumber = outEndpoint;

      // Save device info in localStorage for auto-reconnect hints
      try {
        localStorage.setItem(
          'retailverse_usb_printer',
          JSON.stringify({
            vendorId: device.vendorId,
            productId: device.productId,
            productName: device.productName || 'Thermal Printer',
          })
        );
      } catch (_) {}

      console.log(`[ThermalHardwareManager] Connected to ${device.productName || 'USB Thermal Printer'} on EP ${outEndpoint}`);
      return true;
    } catch (err) {
      console.error('[ThermalHardwareManager] Failed to claim USB device interface:', err);
      this.activeDevice = null;
      throw err;
    }
  }

  /**
   * Attempt auto-reconnection to previously authorized USB devices.
   */
  public async reconnectPaired(): Promise<USBDevice | null> {
    if (!this.isSupported()) return null;

    try {
      const devices = await navigator.usb.getDevices();
      if (devices && devices.length > 0) {
        const savedRaw = localStorage.getItem('retailverse_usb_printer');
        let target = devices[0];

        if (savedRaw) {
          try {
            const saved = JSON.parse(savedRaw);
            const found = devices.find((d) => d.vendorId === saved.vendorId && d.productId === saved.productId);
            if (found) target = found;
          } catch (_) {}
        }

        await this.connectDevice(target);
        return target;
      }
    } catch (err) {
      console.warn('[ThermalHardwareManager] Auto-reconnect failed:', err);
    }
    return null;
  }

  public async disconnect(): Promise<void> {
    if (this.activeDevice) {
      try {
        await this.activeDevice.close();
      } catch (_) {}
      this.activeDevice = null;
    }
    localStorage.removeItem('retailverse_usb_printer');
  }

  /**
   * Send binary raw ESC/POS buffer directly to USB endpoint.
   */
  public async sendRaw(buffer: Uint8Array): Promise<boolean> {
    if (!this.activeDevice) {
      throw new Error('No USB thermal printer currently connected.');
    }

    try {
      // Chunk buffer into 64-byte or 512-byte packets to prevent endpoint buffer overflow
      const CHUNK_SIZE = 64;
      for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
        const slice = buffer.slice(offset, offset + CHUNK_SIZE);
        await this.activeDevice.transferOut(this.endpointNumber, slice);
      }
      return true;
    } catch (err) {
      console.error('[ThermalHardwareManager] USB transfer error:', err);
      throw err;
    }
  }
}

export const thermalHardware = new ThermalHardwareManager();

// ─── WEB BLUETOOTH (BLE) HARDWARE LAYER ───────────────────────────────────────
const COMMON_BLE_PRINT_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard POS Printer Service
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 / Xprinter / Everycom / BillPlus / POS-58
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent Serial
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000af30-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  'de5bf728-d711-4e47-af26-65e3012a5dc7',
];

class ThermalBluetoothManager {
  private activeDevice: any = null;
  private writeCharacteristic: any = null;

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  public getConnectedDevice(): any {
    return this.activeDevice;
  }

  public isConnected(): boolean {
    return Boolean(this.activeDevice && this.writeCharacteristic && this.activeDevice.gatt?.connected);
  }

  public async requestDevice(): Promise<any> {
    if (!this.isSupported()) {
      throw new Error('Web Bluetooth is not supported in this browser. Please use Chrome, Edge, or Opera.');
    }

    try {
      const navBt = (navigator as any).bluetooth;
      const device = await navBt.requestDevice({
        acceptAllDevices: true,
        optionalServices: COMMON_BLE_PRINT_SERVICES,
      });

      await this.connectDevice(device);
      return device;
    } catch (err: any) {
      if (err.name === 'NotFoundError') {
        console.log('[ThermalBluetoothManager] User cancelled Bluetooth device selection.');
        return null;
      }
      console.error('[ThermalBluetoothManager] Error requesting Bluetooth device:', err);
      throw err;
    }
  }

  public async connectDevice(device: any): Promise<boolean> {
    try {
      device.addEventListener('gattserverdisconnected', () => {
        console.log('[ThermalBluetoothManager] Bluetooth device disconnected.');
        this.activeDevice = null;
        this.writeCharacteristic = null;
      });

      const server = await device.gatt.connect();

      // Search through common printer services for a writable characteristic
      let targetChar: any = null;

      for (const serviceUuid of COMMON_BLE_PRINT_SERVICES) {
        try {
          const service = await server.getPrimaryService(serviceUuid);
          const characteristics = await service.getCharacteristics();
          for (const char of characteristics) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              targetChar = char;
              break;
            }
          }
          if (targetChar) break;
        } catch (_) {}
      }

      // If not in known list, scan all primary services
      if (!targetChar) {
        try {
          const services = await server.getPrimaryServices();
          for (const service of services) {
            try {
              const characteristics = await service.getCharacteristics();
              for (const char of characteristics) {
                if (char.properties.write || char.properties.writeWithoutResponse) {
                  targetChar = char;
                  break;
                }
              }
              if (targetChar) break;
            } catch (_) {}
          }
        } catch (_) {}
      }

      if (!targetChar) {
        throw new Error('Could not find a writable print channel on this Bluetooth device.');
      }

      this.activeDevice = device;
      this.writeCharacteristic = targetChar;

      try {
        localStorage.setItem(
          'retailverse_bt_printer',
          JSON.stringify({
            id: device.id,
            name: device.name || 'Bluetooth Thermal Printer',
          })
        );
      } catch (_) {}

      console.log(`[ThermalBluetoothManager] Connected to ${device.name || 'Bluetooth Printer'}`);
      return true;
    } catch (err) {
      console.error('[ThermalBluetoothManager] Connection error:', err);
      this.activeDevice = null;
      this.writeCharacteristic = null;
      throw err;
    }
  }

  /**
   * Attempt auto-reconnection to previously authorized Bluetooth devices (Chromium 85+).
   */
  public async reconnectPaired(): Promise<any> {
    if (!this.isSupported()) return null;
    const navBt = (navigator as any).bluetooth;
    if (!navBt?.getDevices) return null;

    try {
      const devices = await navBt.getDevices();
      if (devices && devices.length > 0) {
        const savedRaw = localStorage.getItem('retailverse_bt_printer');
        let target = devices[0];

        if (savedRaw) {
          try {
            const saved = JSON.parse(savedRaw);
            const found = devices.find((d: any) => d.id === saved.id);
            if (found) target = found;
          } catch (_) {}
        }

        if (target && !this.isConnected()) {
          await this.connectDevice(target);
          return target;
        }
      }
    } catch (err) {
      console.warn('[ThermalBluetoothManager] Auto-reconnect failed:', err);
    }
    return null;
  }

  public async disconnect(): Promise<void> {
    if (this.activeDevice && this.activeDevice.gatt?.connected) {
      try {
        this.activeDevice.gatt.disconnect();
      } catch (_) {}
    }
    this.activeDevice = null;
    this.writeCharacteristic = null;
    localStorage.removeItem('retailverse_bt_printer');
  }

  public async sendRaw(buffer: Uint8Array): Promise<boolean> {
    if (!this.isConnected()) {
      throw new Error('Bluetooth thermal printer is not connected.');
    }

    try {
      const CHUNK_SIZE = 100;
      for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
        const slice = buffer.slice(offset, offset + CHUNK_SIZE);
        if (this.writeCharacteristic.writeValueWithoutResponse) {
          await this.writeCharacteristic.writeValueWithoutResponse(slice);
        } else {
          await this.writeCharacteristic.writeValue(slice);
        }
        await new Promise((r) => setTimeout(r, 20));
      }
      return true;
    } catch (err) {
      console.error('[ThermalBluetoothManager] Send raw error:', err);
      throw err;
    }
  }
}

export const thermalBluetooth = new ThermalBluetoothManager();

// ─── ESC/POS BUFFER BUILDER ──────────────────────────────────────────────────
export class EscPosBuilder {
  private chunks: Uint8Array[] = [];
  private encoder = new TextEncoder();

  public raw(bytes: Uint8Array): this {
    this.chunks.push(bytes);
    return this;
  }

  public init(): this {
    return this.raw(ESC_POS.INIT);
  }

  public align(alignment: 'left' | 'center' | 'right'): this {
    if (alignment === 'center') return this.raw(ESC_POS.ALIGN_CENTER);
    if (alignment === 'right') return this.raw(ESC_POS.ALIGN_RIGHT);
    return this.raw(ESC_POS.ALIGN_LEFT);
  }

  public bold(enabled: boolean): this {
    return this.raw(enabled ? ESC_POS.BOLD_ON : ESC_POS.BOLD_OFF);
  }

  public size(mode: 'normal' | 'double' | 'double-height' | 'double-width'): this {
    if (mode === 'double') return this.raw(ESC_POS.TEXT_DOUBLE);
    if (mode === 'double-height') return this.raw(ESC_POS.TEXT_DOUBLE_HEIGHT);
    if (mode === 'double-width') return this.raw(ESC_POS.TEXT_DOUBLE_WIDTH);
    return this.raw(ESC_POS.TEXT_NORMAL);
  }

  public font(font: 'A' | 'B'): this {
    return this.raw(font === 'B' ? ESC_POS.FONT_B : ESC_POS.FONT_A);
  }

  public text(str: string): this {
    this.chunks.push(this.encoder.encode(str));
    return this;
  }

  public textLine(str: string = ''): this {
    this.chunks.push(this.encoder.encode(str + '\n'));
    return this;
  }

  public lf(lines: number = 1): this {
    for (let i = 0; i < lines; i++) {
      this.raw(ESC_POS.LF);
    }
    return this;
  }

  public divider(cols: number = 42, char: string = '-'): this {
    return this.textLine(char.repeat(cols));
  }

  public twoColumn(left: string, right: string, totalCols: number = 42): this {
    const leftLen = left.length;
    const rightLen = right.length;
    const spaceCount = Math.max(1, totalCols - leftLen - rightLen);
    return this.textLine(left + ' '.repeat(spaceCount) + right);
  }

  public cut(full: boolean = true): this {
    this.lf(3);
    return this.raw(full ? ESC_POS.CUT_FULL : ESC_POS.CUT_PARTIAL);
  }

  /**
   * Barcode CODE128 command (GS k)
   */
  public barcode(code: string, height: number = 50, width: number = 2): this {
    this.raw(ESC_POS.BARCODE_HEIGHT(height));
    this.raw(ESC_POS.BARCODE_WIDTH(width));
    this.raw(ESC_POS.BARCODE_TEXT_BELOW);

    // CODE128 format B: GS k 73 [len] [bytes]
    // In standard ESC/POS CODE128 (GS k 73), the first characters must specify code set {A, {B, or {C.
    // If not prefixed, default to '{B' (ASCII 32..127) for reliable decoding.
    let codeStr = code;
    if (!codeStr.startsWith('{A') && !codeStr.startsWith('{B') && !codeStr.startsWith('{C')) {
      codeStr = '{B' + codeStr;
    }
    const codeBytes = this.encoder.encode(codeStr);
    const header = new Uint8Array([0x1D, 0x6B, 73, codeBytes.length]);
    this.raw(header);
    this.raw(codeBytes);
    this.lf(1);
    return this;
  }

  public build(): Uint8Array {
    const totalLength = this.chunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}

// ─── BINARY RECEIPT & LABEL GENERATION ───────────────────────────────────────

/**
 * Builds binary ESC/POS byte sequence for thermal receipt.
 * Strictly aligned with Test Receipt format: clean dotted dividers, monospaced columns, dynamic store name.
 */
export function buildReceiptEscPos(
  order: ReceiptData,
  settings: PrinterSettings = DEFAULT_PRINTER_SETTINGS,
  cashierName: string = 'Staff'
): Uint8Array {
  const is58mm = settings.rollWidth === '58mm';
  const cols = is58mm ? 32 : 42;

  const builder = new EscPosBuilder();
  builder.init();

  // Store Header (Dynamic Store Name, No hardcoded 'RETAILVERSE')
  const cleanStore = (settings.storeName && settings.storeName !== 'RETAILVERSE' ? settings.storeName : '').trim();
  if (cleanStore) {
    builder.align('center').bold(true).size('double-height').textLine(cleanStore.toUpperCase());
    builder.size('normal').bold(false);
  }
  if (settings.storeTagline) builder.align('center').textLine(settings.storeTagline);
  if (settings.storeAddress) builder.align('center').textLine(settings.storeAddress);
  if (settings.storePhone) builder.align('center').textLine(`Ph: ${settings.storePhone}`);
  if (settings.storeGstin) builder.align('center').textLine(settings.storeGstin);
  builder.divider(cols, '-');

  // Metadata
  const billNo = order.invoiceNumber || order.orderNumber || order.orderId || order._id || 'N/A';
  const orderDate = order.createdAt ? new Date(order.createdAt) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dStr = `${pad(orderDate.getDate())}/${pad(orderDate.getMonth() + 1)}/${String(orderDate.getFullYear()).slice(-2)}`;
  const tStr = `${pad(orderDate.getHours())}:${pad(orderDate.getMinutes())}:${pad(orderDate.getSeconds())}`;

  builder.align('left');
  builder.twoColumn(`BILL: ${billNo}`, `DATE: ${dStr}`, cols);
  builder.twoColumn(`TIME: ${tStr}`, `OP: ${(order.cashierName || cashierName).slice(0, 10)}`, cols);
  builder.textLine(`PAY MODE: ${(order.paymentMethod || 'CASH').toUpperCase()}`);

  if (order.customerName && order.customerName !== 'Walk-in Customer') {
    builder.textLine(`CUST: ${order.customerName.toUpperCase()}${order.customerPhone ? ` (${order.customerPhone})` : ''}`);
  }
  builder.divider(cols, '-');

  // Table Header
  if (is58mm) {
    builder.bold(true).textLine('ITEM                QTY RATE   TOTAL');
  } else {
    builder.bold(true).textLine('ITEM                 QTY      RATE     TOTAL');
  }
  builder.bold(false).divider(cols, '-');

  // Items
  const items = order.items || [];
  for (const item of items) {
    const name = item.name || 'Item';
    const qty = Number(item.quantity) || 1;
    const price = Number(item.unitPrice !== undefined ? item.unitPrice : item.price || 0);
    const total = Number(item.itemTotal !== undefined ? item.itemTotal : price * qty);

    if (is58mm) {
      // 58mm = 32 cols: ITEM(15) QTY(3) RATE(6) TOTAL(8)
      if (name.length <= 15) {
        const colItem = name.padEnd(15, ' ');
        const colQty = String(qty).padStart(3, ' ');
        const colRate = price.toFixed(0).padStart(6, ' ');
        const colTotal = total.toFixed(0).padStart(8, ' ');
        builder.textLine(`${colItem}${colQty}${colRate}${colTotal}`);
      } else {
        builder.textLine(name.slice(0, 30));
        builder.twoColumn(`  ${qty} x ${price.toFixed(2)}`, total.toFixed(2), cols);
      }
    } else {
      // 80mm = 42 cols: ITEM(20) QTY(4) RATE(8) TOTAL(10)
      const colItem = name.slice(0, 20).padEnd(20, ' ');
      const colQty = String(qty).padStart(4, ' ');
      const colPrice = price.toFixed(2).padStart(8, ' ');
      const colTotal = total.toFixed(2).padStart(10, ' ');
      builder.textLine(`${colItem}${colQty}${colPrice}${colTotal}`);
      if (name.length > 20) {
        builder.textLine(`  ${name.slice(20, 40)}`);
      }
    }
  }

  builder.divider(cols, '-');

  // Totals
  const subtotal = Number(order.subtotal || 0).toFixed(2);
  const discountAmt = Number(order.discountAmount) || 0;
  const totalGst = Number(order.totalGst || order.taxPrice || 0).toFixed(2);
  const grandTotal = Number(
    order.grandTotal !== undefined
      ? order.grandTotal
      : order.totalPrice !== undefined
      ? order.totalPrice
      : order.totalAmount || 0
  ).toFixed(2);

  builder.twoColumn('SUBTOTAL:', `Rs.${subtotal}`, cols);
  if (discountAmt > 0) {
    builder.twoColumn(`DISCOUNT${order.couponCode ? ` (${order.couponCode})` : ''}:`, `-Rs.${discountAmt.toFixed(2)}`, cols);
  }
  builder.twoColumn('TOTAL GST:', `Rs.${totalGst}`, cols);
  builder.divider(cols, '-');

  builder.bold(true).size('double-height');
  builder.twoColumn('GRAND TOTAL:', `Rs.${grandTotal}`, cols);
  builder.size('normal').bold(false);
  builder.divider(cols, '-');

  // Footer & Cut
  builder.align('center');
  builder.textLine('PRICES ARE INCLUSIVE OF GST');
  if (settings.footerNote) {
    builder.textLine(settings.footerNote);
  } else {
    builder.textLine('THANKS FOR YOUR VISIT!');
  }
  builder.textLine('NO RETURN / NO EXCHANGE');
  builder.textLine('GOODS ONCE SOLD CANNOT BE TAKEN BACK');

  if (settings.autoCut) {
    builder.cut(true);
  } else {
    builder.lf(3);
  }

  return builder.build();
}

/**
 * Builds TSPL (TSC Page Description Language) binary text stream for thermal sticker roll printers.
 * Directly supported by TSC, Xprinter, Gprinter, Munbyn, Everycom, D110, POS label printers.
 *
 * Configured with:
 * 1. Accurate Header: SIZE, GAP 2 mm,0, DIRECTION 1, REFERENCE 0,0, OFFSET 0 mm.
 * 2. Per-label boundary reset: CLS and REFERENCE 0,0 per label copy to eliminate vertical drift.
 * 3. Exact horizontal centering: Modules calculation for CODE128 and font width calculation.
 * 4. Safe vertical layout: Content fits within die-cut sticker bounds with zero bleed into gap.
 */
export function buildBarcodeLabelTspl(
  label: BarcodeLabelData,
  copies: number = 1,
  exactDimensions: string = '50mm 25mm'
): Uint8Array {
  // Parse dimensions (default: 50mm x 25mm)
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

  const dpi = 8; // 203 DPI = 8 dots/mm
  const widthDots = Math.round(widthMm * dpi);
  const heightDots = Math.round(heightMm * dpi);

  const lines: string[] = [];

  // 1. Accurate Header Commands (Exact syntax without space after comma for standard TSPL firmware compliance)
  lines.push(`SIZE ${widthMm} mm,${heightMm} mm`);
  lines.push(`GAP 2 mm,0`);
  lines.push(`DIRECTION 1`);
  lines.push(`REFERENCE 0,0`);
  lines.push(`OFFSET 0 mm`);
  // Activate transmissive gap sensor — auto-calibrates label boundary detection on each batch
  // GAPDETECT feeds 2-3 labels through the sensor to learn the exact gap position
  // This ensures 100% accurate label-to-label alignment even if roll is shifted or new roll loaded
  lines.push(`GAPDETECT`);
  // Set print density (darkness) and speed for consistent high-contrast sticker output
  lines.push(`DENSITY 10`);  // Max darkness (0-15) for pitch-black barcode on sticker
  lines.push(`SPEED 3`);      // Medium speed for best print quality
  // Disable built-in cutter so continuous label roll is not cut mid-print
  lines.push(`SET CUTTER OFF`);

  // Prepare clean text fields
  const cleanStore = (label.storeName && label.storeName !== 'RETAILVERSE' ? label.storeName : '').trim();

  // Calculate layout parameters based on label height
  const isCompact = heightMm <= 26; // e.g. 50x25mm
  const fontStore = '2'; // Font 2: 12x20 dots
  const fontProd = '2';
  const charWidthFont2 = 12;
  const charWidthFont1 = 8;

  // Maximum characters that fit on one line with side safety margins
  const maxCharsStore = Math.max(10, Math.floor((widthDots - 16) / charWidthFont2));
  const maxCharsProd = Math.max(10, Math.floor((widthDots - 16) / charWidthFont2));

  // Determine narrow bar width and calculate barcode dimensions
  // CODE128: 11 modules per char + 35 start/stop/check/term modules
  const rawBarcode = label.barcode ? label.barcode.trim() : '';
  const barcodeModules = (rawBarcode.length + 3) * 11 + 2;

  let narrow = widthMm <= 42 ? 1 : 2;
  let wide = widthMm <= 42 ? 2 : 2;
  if (barcodeModules * narrow > widthDots - 24) {
    narrow = 1;
    wide = 2;
  }
  const estBarcodeWidth = barcodeModules * narrow;
  const barcodeStartX = Math.max(8, Math.round((widthDots - estBarcodeWidth) / 2));
  const barcodeHeight = isCompact ? 34 : 46;

  // 4. SKU & Price Line
  const infoParts: string[] = [];
  if (label.sku && label.sku.trim()) {
    infoParts.push(`SKU: ${label.sku.trim()}`);
  }
  if (label.price !== undefined && label.price !== '') {
    const numPrice = Number(label.price);
    if (!isNaN(numPrice) && numPrice > 0) {
      infoParts.push(`Rs.${numPrice.toFixed(2)}`);
    }
  }
  const infoText = infoParts.join(' | ');

  // Per-label copy generation with boundary reset (CLS & REFERENCE 0,0 per label)
  const count = Math.max(1, copies);
  for (let c = 0; c < count; c++) {
    lines.push(`CLS`);
    lines.push(`REFERENCE 0,0`);

    let currentY = isCompact ? (cleanStore ? 8 : 16) : (cleanStore ? 12 : 22);

    // 1. Store Name (Centered)
    if (cleanStore) {
      const storeText = cleanStore.toUpperCase().slice(0, maxCharsStore);
      const textWidth = storeText.length * charWidthFont2;
      const startX = Math.max(8, Math.round((widthDots - textWidth) / 2));
      lines.push(`TEXT ${startX},${currentY},"${fontStore}",0,1,1,"${storeText.replace(/"/g, '')}"`);
      currentY += isCompact ? 22 : 24;
    }

    // 2. Product Name (Centered)
    if (label.name) {
      const prodName = label.name.trim().slice(0, maxCharsProd);
      const textWidth = prodName.length * charWidthFont2;
      const startX = Math.max(8, Math.round((widthDots - textWidth) / 2));
      lines.push(`TEXT ${startX},${currentY},"${fontProd}",0,1,1,"${prodName.replace(/"/g, '')}"`);
      currentY += isCompact ? 22 : 26;
    }

    // 3. Barcode CODE128 (Centered, human_readable=2 for centered text under barcode)
    if (rawBarcode) {
      lines.push(`BARCODE ${barcodeStartX},${currentY},"128",${barcodeHeight},2,0,${narrow},${wide},"${rawBarcode}"`);
      currentY += barcodeHeight + (isCompact ? 22 : 26);
    }

    // 4. SKU & Price (Centered)
    if (infoText) {
      const maxCharsInfo = Math.max(12, Math.floor((widthDots - 16) / charWidthFont1));
      const truncatedInfo = infoText.slice(0, maxCharsInfo);
      const textWidth = truncatedInfo.length * charWidthFont1;
      const startX = Math.max(8, Math.round((widthDots - textWidth) / 2));
      lines.push(`TEXT ${startX},${currentY},"1",0,1,1,"${truncatedInfo.replace(/"/g, '')}"`);
    }

    // Print this label and feed exactly to the die-cut gap sensor (no extra feed, no cut)
    lines.push(`PRINT 1,1`);
  }

  // Ensure cutter remains disabled after batch completes
  lines.push(`SET CUTTER OFF`);
  lines.push('');
  const commandStr = lines.join('\r\n');
  return new TextEncoder().encode(commandStr);
}

/**
 * Detects if a device or device name corresponds to a BillPlus thermal printer.
 * BillPlus portable printers are standard ESC/POS receipt/sticker printers and do not support TSPL.
 */
export function isBillPlusDevice(deviceOrName?: any): boolean {
  if (!deviceOrName) return false;
  const name = typeof deviceOrName === 'string'
    ? deviceOrName
    : (deviceOrName.name || deviceOrName.productName || '');
  return /billplus|bill\s*plus/i.test(name);
}

/**
 * Detects if a device or device name is an ESC/POS only thermal printer
 * (BillPlus, POS-58, MPT, PT-210, etc.) which fails or drops raw TSPL packets.
 */
export function isEscPosDevice(deviceOrName?: any): boolean {
  if (!deviceOrName) return false;
  const name = typeof deviceOrName === 'string'
    ? deviceOrName
    : (deviceOrName.name || deviceOrName.productName || '');
  return /billplus|bill\s*plus|pos-?58|innerprinter|bluetooth\s*printer|pt-?210|mpt-?ii|rpp/i.test(name);
}

/**
 * Renders a high-contrast barcode sticker onto an offscreen canvas.
 * Perfectly calibrated for 203 DPI (8 dots/mm) 50mm / 58mm thermal rolls.
 */
export function renderBarcodeLabelToCanvas(
  label: BarcodeLabelData,
  exactDimensions: string = '50mm 25mm'
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;

  let widthMm = 50;
  let heightMm = 25;
  if (exactDimensions) {
    const parts = exactDimensions.trim().split(/\s+/);
    if (parts.length >= 2) {
      const w = parseFloat(parts[0]);
      const h = parseFloat(parts[1]);
      if (!isNaN(w) && w > 0) widthMm = w;
      if (!isNaN(h) && h > 0) heightMm = h;
    }
  }

  // 203 DPI = 8 dots/mm
  // Standard 58mm printer printable width is 48mm = 384 dots (48 bytes per line).
  // 50mm label fits comfortably in 384 dots width without clipping.
  let targetWidthDots = 384;
  if (widthMm <= 42) {
    targetWidthDots = 320; // 40mm x 8 = 320 dots (40 bytes)
  } else if (widthMm >= 70) {
    targetWidthDots = 576; // 72mm x 8 = 576 dots (72 bytes for 80mm roll)
  }
  const widthDots = targetWidthDots;
  const heightDots = Math.max(160, Math.round(heightMm * 8));

  const canvas = document.createElement('canvas');
  canvas.width = widthDots;
  canvas.height = heightDots;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Solid white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, widthDots, heightDots);

  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  let currentY = 8;

  // 1. Store Name (if present and not 'RETAILVERSE')
  const cleanStore = (label.storeName && label.storeName !== 'RETAILVERSE' ? label.storeName : '').trim();
  if (cleanStore) {
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(cleanStore.toUpperCase(), widthDots / 2, currentY);
    currentY += 20;
  }

  // 2. Product Title
  if (label.name) {
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const maxChars = widthDots <= 320 ? 20 : 26;
    const nameStr = label.name.length > maxChars ? label.name.slice(0, maxChars) : label.name;
    ctx.fillText(nameStr, widthDots / 2, currentY);
    currentY += 18;
  }

  // 3. Barcode CODE128
  if (label.barcode) {
    const remainingHeight = heightDots - currentY - 26;
    const barcodeHeight = Math.max(30, Math.min(65, remainingHeight));
    const barWidth = widthDots <= 320 ? 1.4 : (label.barcode.length > 13 ? 1.5 : 1.8);

    try {
      const bcCanvas = document.createElement('canvas');
      (JsBarcode as any)(bcCanvas, label.barcode, {
        format: 'CODE128',
        width: barWidth,
        height: barcodeHeight,
        displayValue: false, // Custom rendered text below for crisp alignment
        margin: 0,
        lineColor: '#000000',
        background: '#ffffff',
      });
      const bX = Math.max(4, Math.round((widthDots - bcCanvas.width) / 2));
      ctx.drawImage(bcCanvas, bX, currentY);
      currentY += bcCanvas.height + 4;
    } catch (bcErr) {
      console.warn('[renderBarcodeLabelToCanvas] JsBarcode canvas error:', bcErr);
      ctx.font = 'bold 16px monospace';
      ctx.fillText(label.barcode, widthDots / 2, currentY);
      currentY += 20;
    }
  }

  // 4. Barcode number, SKU & Price Line
  const infoParts: string[] = [label.barcode];
  if (label.sku && label.sku.trim()) {
    infoParts.push(`SKU: ${label.sku.trim()}`);
  }
  if (label.price !== undefined && label.price !== '') {
    const numPrice = Number(label.price);
    if (!isNaN(numPrice) && numPrice > 0) {
      infoParts.push(`Rs.${numPrice.toFixed(0)}`);
    }
  }

  ctx.font = 'bold 12px monospace';
  ctx.fillText(infoParts.join(' | '), widthDots / 2, currentY);

  return canvas;
}

/**
 * Converts a 2D HTML Canvas to ESC/POS Raster bit image format (GS v 0 0 xL xH yL yH data).
 * 1-bit monochrome data (1 = black dot, 0 = white dot), 8 dots packed per byte MSB first.
 */
export function canvasToEscPosRaster(canvas: HTMLCanvasElement): Uint8Array {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new Uint8Array(0);

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // Horizontal bytes (must be aligned to byte boundaries)
  const widthBytes = Math.ceil(width / 8);
  const xL = widthBytes % 256;
  const xH = Math.floor(widthBytes / 256);
  const yL = height % 256;
  const yH = Math.floor(height / 256);

  // GS v 0 0 xL xH yL yH (ESC/POS raster bit image command)
  const header = new Uint8Array([0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH]);
  const rasterBytes = new Uint8Array(widthBytes * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      // Luminosity threshold for pitch-black thermal contrast
      const isBlack = a > 128 && (r * 0.299 + g * 0.587 + b * 0.114 < 180);

      if (isBlack) {
        const byteIndex = y * widthBytes + Math.floor(x / 8);
        const bitPos = 7 - (x % 8);
        rasterBytes[byteIndex] |= (1 << bitPos);
      }
    }
  }

  const result = new Uint8Array(header.length + rasterBytes.length);
  result.set(header, 0);
  result.set(rasterBytes, header.length);
  return result;
}

/**
 * Method B (Recommended): Convert barcode sticker preview canvas to 1-bit monochrome bitmap
 * and print using ESC/POS raster bit image command (GS v 0 0 xL xH yL yH data).
 * Guarantees exact visual alignment and eliminates firmware barcode font dependency on BillPlus / POS-58.
 */
export function buildBarcodeLabelRasterEscPos(
  label: BarcodeLabelData,
  copies: number = 1,
  exactDimensions: string = '50mm 25mm'
): Uint8Array {
  const canvas = renderBarcodeLabelToCanvas(label, exactDimensions);
  if (!canvas) {
    return buildBarcodeLabelNativeEscPos(label, copies, exactDimensions);
  }

  // Parse label height to calculate precise feed lines (avoid over-feed / cut into next label)
  let heightMm = 25;
  if (exactDimensions) {
    const parts = exactDimensions.trim().split(/\s+/);
    if (parts.length >= 2) {
      const h = parseFloat(parts[1]);
      if (!isNaN(h) && h > 0) heightMm = h;
    }
  }
  // Feed lines: taller labels need more feed to reach gap sensor accurately
  // 1 line ≈ 3.75mm on standard 203 DPI thermal heads
  const feedLines = heightMm <= 26 ? 1 : heightMm <= 35 ? 2 : 3;

  const rasterCommand = canvasToEscPosRaster(canvas);
  const chunks: Uint8Array[] = [];

  // Initialize printer
  chunks.push(ESC_POS.INIT);
  chunks.push(ESC_POS.ALIGN_CENTER);

  // Print requested number of copies with precise feed & separation
  const count = Math.max(1, copies);
  for (let i = 0; i < count; i++) {
    // 1. Send raster bit image data
    chunks.push(rasterCommand);

    // 2. Feed exactly to match label height so consecutive stickers don't overlap or shift
    chunks.push(ESC_POS.FEED_LINES(feedLines));
  }

  // Flush buffer
  chunks.push(ESC_POS.LF);

  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Method A: Native ESC/POS Barcode commands:
 * - GS h [n] (set barcode height: 0x1D, 0x68, 0x50)
 * - GS w [n] (set barcode width: 0x1D, 0x77, 0x02)
 * - GS H 2 (HRI characters below barcode: 0x1D, 0x48, 0x02)
 * - GS k 73 [n] [data] (CODE128 barcode: 0x1D, 0x6B, 0x49, ...)
 * - Store name, product title, and SKU as centered text lines before and after barcode.
 * - Feed & Separation: ESC d 2 after each sticker copy.
 */
export function buildBarcodeLabelNativeEscPos(
  label: BarcodeLabelData,
  copies: number = 1,
  exactDimensions: string = '50mm 25mm'
): Uint8Array {
  const builder = new EscPosBuilder();
  builder.init();

  let heightMm = 25;
  if (exactDimensions) {
    const parts = exactDimensions.trim().split(/\s+/);
    if (parts.length >= 2) {
      const h = parseFloat(parts[1]);
      if (!isNaN(h) && h > 0) heightMm = h;
    }
  }

  // Feed lines calculated from label height for precise gap-to-gap alignment
  const feedLines = heightMm <= 26 ? 1 : heightMm <= 35 ? 2 : 3;

  const cleanStore = (label.storeName && label.storeName !== 'RETAILVERSE' ? label.storeName : '').trim();
  const count = Math.max(1, copies);

  for (let i = 0; i < count; i++) {
    builder.align('center');

    // 1. Store Name (centered)
    if (cleanStore) {
      builder.bold(true).size('normal').textLine(cleanStore.toUpperCase());
    }

    // 2. Product Title (centered)
    if (label.name) {
      builder.bold(false).textLine(label.name.slice(0, 24));
    }

    // 3. CODE128 Barcode via Native GS k 73
    if (label.barcode) {
      const barcodeH = heightMm <= 26 ? 50 : 64; // GS h [n]
      builder.barcode(label.barcode, barcodeH, 2);
    }

    // 4. SKU & Price Line (centered)
    const details: string[] = [];
    if (label.sku) details.push(`SKU: ${label.sku}`);
    if (label.price !== undefined && label.price !== '') {
      const p = Number(label.price);
      if (!isNaN(p) && p > 0) details.push(`Rs.${p.toFixed(2)}`);
    }

    if (details.length > 0) {
      builder.textLine(details.join(' | '));
    }

    // 5. Feed precisely to match label height — prevents overlap and misalignment
    builder.raw(ESC_POS.FEED_LINES(feedLines));
  }

  // Flush buffer
  builder.lf(1);

  return builder.build();
}

/**
 * Builds binary ESC/POS byte sequence for barcode sticker rolls.
 * Uses Method B (Raster bitmap) by default for direct visual match on BillPlus & 58mm printers,
 * with graceful fallback to Method A (Native ESC/POS commands).
 */
export function buildBarcodeLabelEscPos(
  label: BarcodeLabelData,
  copies: number = 1,
  exactDimensions: string = '50mm 25mm'
): Uint8Array {
  // If native commands are explicitly requested, use Method A
  if ((label.commandMode as any) === 'escpos-native') {
    return buildBarcodeLabelNativeEscPos(label, copies, exactDimensions);
  }

  // Default to Method B (Raster Bit Image) for guaranteed pixel-perfect printing on BillPlus
  if (typeof document !== 'undefined') {
    try {
      return buildBarcodeLabelRasterEscPos(label, copies, exactDimensions);
    } catch (err) {
      console.warn('[buildBarcodeLabelEscPos] Raster render failed, falling back to Native ESC/POS:', err);
    }
  }

  return buildBarcodeLabelNativeEscPos(label, copies, exactDimensions);
}

/**
 * Dispatcher to build raw binary stream for thermal sticker printing.
 * Supports TSPL (default for label printers) or ESC/POS (receipt/continuous sticker rolls & BillPlus).
 */
export function buildBarcodeLabelBuffer(
  label: BarcodeLabelData,
  copies: number = 1,
  exactDimensions: string = '50mm 25mm',
  protocol: 'tspl' | 'escpos' = 'tspl'
): Uint8Array {
  const mode = label.commandMode || protocol;
  if (mode === 'escpos' || mode === 'bitmap') {
    return buildBarcodeLabelEscPos(label, copies, exactDimensions);
  }
  return buildBarcodeLabelTspl(label, copies, exactDimensions);
}

// ─── ISOLATED HIDDEN IFRAME PRINT ENGINE (ZERO A4 SAVE-DIALOG FALLBACK) ───────

export interface IframePrintOptions {
  html: string;
  title?: string;
  rollWidth?: '80mm' | '58mm' | string;
  exactDimensions?: string; // e.g. "50mm 25mm"
}

/**
 * Renders target HTML inside an isolated, invisible <iframe> and dispatches print.
 * Eliminates browser screen flash, redirection, or A4 page break distortions.
 */
export function printViaIsolatedIframe({
  html,
  title = 'Print Job',
  rollWidth = '80mm',
  exactDimensions,
}: IframePrintOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const IFRAME_ID = 'retailverse-isolated-thermal-iframe';
      let iframe = document.getElementById(IFRAME_ID) as HTMLIFrameElement;

      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = IFRAME_ID;
        iframe.name = IFRAME_ID;
        iframe.style.position = 'fixed';
        iframe.style.top = '-9999px';
        iframe.style.left = '-9999px';
        iframe.style.width = '0px';
        iframe.style.height = '0px';
        iframe.style.border = '0';
        iframe.style.margin = '0';
        iframe.style.padding = '0';
        iframe.style.visibility = 'hidden';
        iframe.setAttribute('aria-hidden', 'true');
        document.body.appendChild(iframe);
      }

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      const iframeWin = iframe.contentWindow;

      if (!iframeDoc || !iframeWin) {
        throw new Error('Unable to access thermal print iframe document.');
      }

      // Collect all stylesheets and style tags from parent document for production bundle support
      const parentStyles = typeof document !== 'undefined'
        ? Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
            .map((node) => node.outerHTML)
            .join('\n')
        : '';

      const isA4 = exactDimensions === 'auto' || exactDimensions === 'A4 portrait';
      const pageDim = isA4 ? 'auto' : (exactDimensions || '50mm 30mm');
      const pageMargin = isA4 ? '5mm' : '0';
      const widthVal = isA4 ? '100%' : '50mm';
      const heightVal = isA4 ? 'auto' : '30mm';

      const wrappedHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>${title}</title>
            ${parentStyles}
            <style>
              @page {
                size: ${pageDim};
                margin: ${pageMargin};
              }
              @media print {
                html, body {
                  width: ${widthVal} !important;
                  height: auto !important;
                  min-height: 0 !important;
                  max-height: none !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  overflow: visible !important;
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                }
                .thermal-label-print-zone,
                .sticker-container,
                #print-label-area {
                  display: ${isA4 ? 'grid' : 'block'} !important;
                  width: ${widthVal} !important;
                  height: auto !important;
                  min-height: 0 !important;
                  max-height: none !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  overflow: visible !important;
                }
                .label-card,
                .thermal-sticker-card,
                .print-label-card {
                  width: ${widthVal} !important;
                  height: ${heightVal} !important;
                  min-height: ${heightVal} !important;
                  max-height: ${heightVal} !important;
                  page-break-after: always !important;
                  break-after: page !important;
                  page-break-inside: avoid !important;
                  break-inside: avoid !important;
                  display: flex !important;
                  flex-direction: column !important;
                  align-items: center !important;
                  justify-content: center !important;
                  box-sizing: border-box !important;
                  padding: 2mm !important;
                  margin: 0 !important;
                  overflow: hidden !important;
                }
                .label-card:last-child,
                .thermal-sticker-card:last-child,
                .print-label-card:last-child {
                  page-break-after: auto !important;
                  break-after: auto !important;
                }
              }
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                color: #000000 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
              }
              * {
                box-sizing: border-box !important;
                color: #000000 !important;
              }
              /* Prevent parent container from locking 100vh or centering during print */
              .thermal-label-print-zone,
              .sticker-container,
              #print-label-area {
                height: auto !important;
                min-height: 0 !important;
                max-height: none !important;
                overflow: visible !important;
                display: ${isA4 ? 'grid' : 'block'} !important;
                margin: 0 !important;
                padding: 0 !important;
                width: ${widthVal} !important;
              }
              svg, canvas, img {
                shape-rendering: crispEdges !important;
                image-rendering: pixelated !important;
              }
            </style>
          </head>
          <body>
            ${html}
          </body>
        </html>
      `;

      iframeDoc.open();
      iframeDoc.write(wrappedHtml);
      iframeDoc.close();

      // Allow fonts and SVG barcodes to paint cleanly before print call
      setTimeout(() => {
        try {
          iframeWin.focus();
          iframeWin.print();
          resolve();
        } catch (printErr) {
          console.error('[printViaIsolatedIframe] Error invoking print:', printErr);
          reject(printErr);
        }
      }, 150);
    } catch (err) {
      reject(err);
    }
  });
}
