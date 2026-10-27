/**
 * Direct Thermal Printer & Hardware Integration Service
 * 
 * Supports:
 * 1. WebUSB direct raw binary ESC/POS communication (Bypasses browser print dialog completely).
 * 2. ESC/POS command builders (Init, Text styling, Alignment, Barcodes, Line feeds, Paper cut).
 * 3. Graceful fallback to isolated hidden <iframe> DOM @media print engine.
 */

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
}

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  rollWidth: '80mm',
  autoCut: true,
  storeName: 'RETAILVERSE',
  storeTagline: 'TAX INVOICE',
  storeAddress: '123 COMMERCE BOULEVARD',
  storePhone: '+91 98765 43210',
  storeGstin: 'GSTIN: 27AAAAA0000A1Z5',
  footerNote: 'THANKS FOR YOUR VISIT! GOODS ONCE SOLD CANNOT BE RETURNED',
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
    const codeBytes = this.encoder.encode(code);
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

  // Store Header
  builder.align('center').bold(true).size('double-height').textLine(settings.storeName.toUpperCase());
  builder.size('normal').bold(false);
  if (settings.storeTagline) builder.textLine(settings.storeTagline);
  if (settings.storeAddress) builder.textLine(settings.storeAddress);
  if (settings.storePhone) builder.textLine(`Ph: ${settings.storePhone}`);
  if (settings.storeGstin) builder.textLine(settings.storeGstin);
  builder.divider(cols, '=');

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
    builder.bold(true).twoColumn('ITEM (QTY x RATE)', 'TOTAL', cols).bold(false);
  } else {
    builder.bold(true).textLine('ITEM                QTY    PRICE     TOTAL').bold(false);
  }
  builder.divider(cols, '-');

  // Items
  const items = order.items || [];
  for (const item of items) {
    const name = (item.name || 'Item').slice(0, is58mm ? 20 : 18);
    const qty = Number(item.quantity) || 1;
    const price = Number(item.unitPrice !== undefined ? item.unitPrice : item.price || 0);
    const total = Number(item.itemTotal !== undefined ? item.itemTotal : price * qty);

    if (is58mm) {
      builder.textLine(name);
      builder.twoColumn(`  ${qty} x Rs.${price.toFixed(2)}`, `Rs.${total.toFixed(2)}`, cols);
    } else {
      const colItem = name.padEnd(18, ' ');
      const colQty = String(qty).padStart(4, ' ');
      const colPrice = price.toFixed(2).padStart(8, ' ');
      const colTotal = total.toFixed(2).padStart(9, ' ');
      builder.textLine(`${colItem} ${colQty} ${colPrice} ${colTotal}`);
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
  builder.divider(cols, '=');

  builder.bold(true).size('double-height');
  builder.twoColumn('GRAND TOTAL:', `Rs.${grandTotal}`, cols);
  builder.size('normal').bold(false);
  builder.divider(cols, '=');

  // Footer & Cut
  builder.align('center');
  if (settings.footerNote) {
    builder.textLine(settings.footerNote);
  } else {
    builder.textLine('THANK YOU FOR SHOPPING WITH US!');
    builder.textLine('NO RETURN / NO EXCHANGE');
  }

  if (settings.autoCut) {
    builder.cut(true);
  } else {
    builder.lf(3);
  }

  return builder.build();
}

/**
 * Builds binary ESC/POS byte sequence for barcode sticker rolls.
 */
export function buildBarcodeLabelEscPos(
  label: BarcodeLabelData,
  copies: number = 1
): Uint8Array {
  const builder = new EscPosBuilder();
  builder.init();

  const formattedPrice = Number(label.price || 0).toFixed(2);

  for (let i = 0; i < copies; i++) {
    builder.align('center');
    builder.bold(true).textLine((label.storeName || 'RETAILVERSE').toUpperCase());
    builder.size('normal').textLine(label.name.slice(0, 24));
    builder.bold(true).textLine(`Rs. ${formattedPrice} (INCL. TAXES)`);
    builder.bold(false);

    // Barcode CODE128
    if (label.barcode) {
      builder.barcode(label.barcode, 45, 2);
    }

    if (label.sku) {
      builder.textLine(`SKU: ${label.sku}`);
    }

    builder.lf(2);
  }

  return builder.build();
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

      const pageSizeRule = exactDimensions ? exactDimensions : `${rollWidth} auto`;

      const wrappedHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>${title}</title>
            <style>
              @page {
                size: ${pageSizeRule};
                margin: 0 !important;
              }
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                color: #000000 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                font-family: 'Courier New', Courier, monospace;
              }
              * {
                box-sizing: border-box !important;
                color: #000000 !important;
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
