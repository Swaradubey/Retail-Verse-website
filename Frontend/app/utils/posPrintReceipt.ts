/**
 * POS Thermal Receipt Direct / Silent Printing Utility
 * 
 * Supports:
 * - Direct WebUSB ESC/POS binary printing (100% bypass of browser print dialogs).
 * - Isolated hidden <iframe> printing targeting exact 80mm / 58mm thermal rolls.
 * - Pitch-black (#000000) high-contrast bold fonts for clear thermal head transfer.
 * - Compatible with Chrome Kiosk Silent Printing mode (--kiosk --kiosk-printing).
 */

import {
  thermalHardware,
  thermalBluetooth,
  buildReceiptEscPos,
  printViaIsolatedIframe,
  PrinterSettings,
  DEFAULT_PRINTER_SETTINGS,
} from '../lib/thermalPrinter';

export interface ThermalReceiptOrder {
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
  items?: Array<{
    name?: string;
    barcode?: string;
    sku?: string;
    quantity?: number;
    unitPrice?: number;
    price?: number;
    itemTotal?: number;
  }>;
  subtotal?: number;
  discountAmount?: number;
  couponCode?: string;
  totalGst?: number;
  taxPrice?: number;
  grandTotal?: number;
  totalPrice?: number;
  totalAmount?: number;
}

export interface PrintReceiptOptions {
  rollWidth?: '80mm' | '58mm';
  storeName?: string;
  storeTagline?: string;
  storeAddress?: string;
  storePhone?: string;
  storeGstin?: string;
  footerNote?: string;
  preferUsb?: boolean;
}

export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generate formatted HTML document content for 80mm or 58mm thermal receipt rolls.
 * Strictly matches Test Receipt clean compact thermal layout with monospaced tabular alignment.
 */
export function generateThermalReceiptHtml(
  order: ThermalReceiptOrder,
  cashierFallback: string = 'Staff',
  options?: PrintReceiptOptions
): string {
  const rollWidth = options?.rollWidth || '80mm';
  const is58mm = rollWidth === '58mm';
  const printableWidth = is58mm ? '48mm' : '72mm';
  const cols = is58mm ? 32 : 42;
  const dividerLine = '-'.repeat(cols);

  // Dynamic store name without 'RETAILVERSE' hardcoded fallback
  const rawStoreName = options?.storeName && options.storeName !== 'RETAILVERSE' ? options.storeName : '';
  const storeName = rawStoreName.trim().toUpperCase();
  const storeTagline = options?.storeTagline || 'TAX INVOICE';
  const storeAddress = options?.storeAddress || '';
  const storePhone = options?.storePhone || '';
  const storeGstin = options?.storeGstin || '';
  const footerNote = options?.footerNote || '';

  // Format Date and Time
  const orderDate = order.createdAt ? new Date(order.createdAt) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const formattedDate = `${pad(orderDate.getDate())}/${pad(orderDate.getMonth() + 1)}/${String(orderDate.getFullYear()).slice(-2)}`;
  const formattedTime = `${pad(orderDate.getHours())}:${pad(orderDate.getMinutes())}:${pad(orderDate.getSeconds())}`;

  // Metadata
  const billNo = order.invoiceNumber || order.orderNumber || order.orderId || order._id || 'N/A';
  const cashier = order.cashierName || cashierFallback || 'Staff';
  const paymentMethod = (order.paymentMethod || 'CASH').toUpperCase();

  // Line items
  const items = order.items || [];
  const itemsHtml = items
    .map((item) => {
      const name = item.name || 'Item';
      const qty = Number(item.quantity) || 1;
      const unitPrice = Number(item.unitPrice !== undefined ? item.unitPrice : item.price || 0);
      const lineTotal = Number(item.itemTotal !== undefined ? item.itemTotal : unitPrice * qty);

      return `
        <div class="item-row">
          <span class="col-item">${escapeHtml(name)}</span>
          <span class="col-qty">${qty}</span>
          <span class="col-rate">&#8377;${unitPrice.toFixed(2)}</span>
          <span class="col-total">&#8377;${lineTotal.toFixed(2)}</span>
        </div>
      `;
    })
    .join('');

  // Calculations
  const subtotal = Number(order.subtotal || 0).toFixed(2);
  const discountAmt = Number(order.discountAmount) || 0;
  const appliedCode = order.couponCode ? String(order.couponCode).trim() : '';
  const discountHtml =
    discountAmt > 0
      ? `
      <div class="row">
        <span>DISCOUNT ${appliedCode ? `(${escapeHtml(appliedCode)})` : ''}:</span>
        <span>-&#8377;${discountAmt.toFixed(2)}</span>
      </div>
    `
      : '';

  const totalGst = Number(order.totalGst || order.taxPrice || 0).toFixed(2);
  const grandTotal = Number(
    order.grandTotal !== undefined
      ? order.grandTotal
      : order.totalPrice !== undefined
      ? order.totalPrice
      : order.totalAmount || 0
  ).toFixed(2);

  // Customer info
  const hasCustomer =
    (order.customerName && order.customerName !== 'Walk-in Customer') ||
    order.customerPhone ||
    order.customerAddress;

  const customerHtml = hasCustomer
    ? `
    <div class="customer-section">
      ${order.customerName && order.customerName !== 'Walk-in Customer' ? `<div>CUST    : ${escapeHtml(order.customerName.toUpperCase())}</div>` : ''}
      ${order.customerPhone ? `<div>PHONE   : ${escapeHtml(order.customerPhone)}</div>` : ''}
      ${order.customerAddress ? `<div>ADDR    : ${escapeHtml(order.customerAddress.toUpperCase())}</div>` : ''}
    </div>
  `
    : '';

  // Payment details
  const paymentDetailsHtml =
    order.paymentDetails?.cardLast4 || order.upiId || order.paymentDetails?.upiId
      ? `
      <div style="font-size: 8.5px; padding: 1.5px 0;">
        ${order.paymentDetails?.cardLast4 ? `<div>CARD: **** **** **** ${escapeHtml(order.paymentDetails.cardLast4)} (${escapeHtml(order.paymentDetails.cardNetwork || 'CARD')})</div>` : ''}
        ${order.upiId || order.paymentDetails?.upiId ? `<div>UPI ID: ${escapeHtml(order.upiId || order.paymentDetails?.upiId || '')}</div>` : ''}
      </div>
    `
      : '';

  return `
    <div class="thermal-print-area ${is58mm ? 'thermal-58mm' : 'thermal-80mm'}">
      <style>
        * {
          box-sizing: border-box;
          color: #000000 !important;
          font-family: 'Courier New', Courier, monospace !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .thermal-print-area {
          width: 100%;
          max-width: ${printableWidth};
          margin: 0 auto;
          padding: 2mm ${is58mm ? '1.5mm' : '2.5mm'};
          background: #ffffff;
          color: #000000;
          font-size: ${is58mm ? '9.5px' : '10.5px'};
          line-height: 1.25;
        }
        .header {
          text-align: center;
          padding-bottom: 2px;
        }
        .store-name {
          font-size: ${is58mm ? '14px' : '17px'};
          font-weight: 900 !important;
          letter-spacing: 0.5px;
          margin-bottom: 2px;
          text-transform: uppercase;
        }
        .tax-inv {
          font-size: ${is58mm ? '10px' : '11px'};
          letter-spacing: 0.5px;
          margin-bottom: 2px;
          font-weight: bold;
        }
        .store-sub {
          font-size: ${is58mm ? '8.5px' : '9px'};
          line-height: 1.2;
          margin-bottom: 1px;
        }
        .pay-mode {
          font-size: ${is58mm ? '9px' : '10px'};
          font-weight: bold;
          margin-bottom: 2px;
        }
        .meta-row {
          display: flex;
          justify-content: space-between;
          font-size: ${is58mm ? '8.5px' : '9.5px'};
          line-height: 1.25;
          font-weight: bold;
        }
        .divider {
          font-family: 'Courier New', Courier, monospace !important;
          font-size: ${is58mm ? '9.5px' : '10.5px'};
          letter-spacing: 0;
          line-height: 1;
          margin: 2px 0;
          overflow: hidden;
          white-space: pre;
          user-select: none;
          color: #000000 !important;
        }
        .customer-section {
          padding: 2px 0;
          font-size: ${is58mm ? '8.5px' : '9px'};
          line-height: 1.2;
          font-weight: bold;
        }
        .table-header {
          display: flex;
          justify-content: space-between;
          font-weight: 900 !important;
          font-size: ${is58mm ? '8.5px' : '9.5px'};
          padding: 1px 0;
        }
        .item-row {
          display: flex;
          justify-content: space-between;
          font-size: ${is58mm ? '8.5px' : '9.5px'};
          line-height: 1.25;
          padding: 1.5px 0;
        }
        .col-item {
          flex: 1;
          text-align: left;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          padding-right: 4px;
          font-weight: bold;
        }
        .col-qty {
          width: ${is58mm ? '24px' : '32px'};
          text-align: center;
          font-weight: bold;
        }
        .col-rate {
          width: ${is58mm ? '48px' : '58px'};
          text-align: right;
          font-weight: bold;
        }
        .col-total {
          width: ${is58mm ? '52px' : '64px'};
          text-align: right;
          font-weight: bold;
        }
        .totals {
          margin-top: 2px;
          font-size: ${is58mm ? '9px' : '10px'};
          font-weight: bold;
        }
        .row {
          display: flex;
          justify-content: space-between;
          padding: 1px 0;
        }
        .grand-total {
          font-size: ${is58mm ? '12px' : '13.5px'};
          font-weight: 900 !important;
          padding: 2px 0;
        }
        .footer {
          margin-top: 4px;
          text-align: center;
          font-size: ${is58mm ? '8px' : '8.5px'};
          line-height: 1.3;
          font-weight: bold;
        }
      </style>

      <div class="header">
        ${storeName ? `<div class="store-name">${escapeHtml(storeName)}</div>` : ''}
        <div class="tax-inv">${escapeHtml(storeTagline)}</div>
        ${storeAddress ? `<div class="store-sub">${escapeHtml(storeAddress)}</div>` : ''}
        ${storePhone ? `<div class="store-sub">Phone: ${escapeHtml(storePhone)}</div>` : ''}
        ${storeGstin ? `<div class="store-sub">${escapeHtml(storeGstin)}</div>` : ''}
        <div class="divider">${dividerLine}</div>
        <div class="meta-row">
          <span>BILL: ${escapeHtml(billNo)}</span>
          <span>DATE: ${formattedDate}</span>
        </div>
        <div class="meta-row">
          <span>TIME: ${formattedTime}</span>
          <span>OP: ${escapeHtml(cashier)}</span>
        </div>
        <div class="meta-row">
          <span>PAY MODE: ${escapeHtml(paymentMethod)}</span>
        </div>
      </div>

      ${customerHtml}
      ${paymentDetailsHtml}
      <div class="divider">${dividerLine}</div>

      <div class="table-header">
        <span class="col-item">ITEM</span>
        <span class="col-qty">QTY</span>
        <span class="col-rate">RATE</span>
        <span class="col-total">TOTAL</span>
      </div>
      <div class="divider">${dividerLine}</div>

      <div class="items-list">
        ${itemsHtml}
      </div>
      <div class="divider">${dividerLine}</div>

      <div class="totals">
        <div class="row">
          <span>SUBTOTAL:</span>
          <span>&#8377;${subtotal}</span>
        </div>
        ${discountHtml}
        <div class="row">
          <span>TOTAL GST:</span>
          <span>&#8377;${totalGst}</span>
        </div>
        <div class="divider">${dividerLine}</div>
        <div class="row grand-total">
          <span>GRAND TOTAL:</span>
          <span>&#8377;${grandTotal}</span>
        </div>
        <div class="divider">${dividerLine}</div>
      </div>

      <div class="footer">
        <div>PRICES ARE INCLUSIVE OF GST</div>
        ${footerNote ? `<div>${escapeHtml(footerNote)}</div>` : '<div>THANKS FOR YOUR VISIT!</div>'}
        <div>NO REFUND / NO REPLACEMENT</div>
        <div style="font-size: 7.5px; margin-top: 2px; font-weight: normal;">GOODS ONCE SOLD CANNOT BE TAKEN BACK</div>
      </div>
    </div>
  `;
}

/**
 * Primary thermal receipt print execution.
 * First checks for an active direct Bluetooth or WebUSB printer connection (bypassing browser dialogs).
 * Seamlessly falls back to isolated hidden <iframe> printing targeting exact 80mm/58mm roll width.
 */
export async function printThermalReceipt(
  order: ThermalReceiptOrder,
  cashierFallback: string = 'Staff',
  options?: PrintReceiptOptions
): Promise<{ success: boolean; method: 'bluetooth' | 'webusb' | 'iframe'; error?: string }> {
  if (!order) {
    console.warn('[printThermalReceipt] No order document provided.');
    return { success: false, method: 'iframe', error: 'No order provided' };
  }

  const rollWidth = options?.rollWidth || '58mm';
  const rawStore = options?.storeName && options.storeName !== 'RETAILVERSE' ? options.storeName : '';
  const fallbackStore = DEFAULT_PRINTER_SETTINGS.storeName && DEFAULT_PRINTER_SETTINGS.storeName !== 'RETAILVERSE'
    ? DEFAULT_PRINTER_SETTINGS.storeName
    : '';
  const resolvedStoreName = rawStore || fallbackStore;

  const settings: PrinterSettings = {
    ...DEFAULT_PRINTER_SETTINGS,
    rollWidth: rollWidth,
    storeName: resolvedStoreName,
    storeTagline: options?.storeTagline || DEFAULT_PRINTER_SETTINGS.storeTagline,
    storeAddress: options?.storeAddress || DEFAULT_PRINTER_SETTINGS.storeAddress,
    storePhone: options?.storePhone || DEFAULT_PRINTER_SETTINGS.storePhone,
    storeGstin: options?.storeGstin || DEFAULT_PRINTER_SETTINGS.storeGstin,
    footerNote: options?.footerNote || DEFAULT_PRINTER_SETTINGS.footerNote,
  };

  // 1. Try Direct Bluetooth ESC/POS binary printing if connected
  if (thermalBluetooth.isConnected()) {
    try {
      const buffer = buildReceiptEscPos(order, settings, cashierFallback);
      await thermalBluetooth.sendRaw(buffer);
      console.log('[printThermalReceipt] Dispatched raw binary ESC/POS receipt via Bluetooth.');
      return { success: true, method: 'bluetooth' };
    } catch (btErr: any) {
      console.warn('[printThermalReceipt] Bluetooth print error, falling back:', btErr);
    }
  }

  // 2. Try Direct WebUSB ESC/POS binary printing if connected
  const activeUsbDevice = thermalHardware.getConnectedDevice();
  const preferUsb = options?.preferUsb !== false;

  if (activeUsbDevice && preferUsb) {
    try {
      const buffer = buildReceiptEscPos(order, settings, cashierFallback);
      await thermalHardware.sendRaw(buffer);
      console.log('[printThermalReceipt] Dispatched raw binary ESC/POS receipt via WebUSB.');
      return { success: true, method: 'webusb' };
    } catch (usbErr: any) {
      console.warn('[printThermalReceipt] WebUSB print error, falling back to hidden iframe:', usbErr);
    }
  }

  // 3. Fallback: Isolated hidden <iframe> print engine
  try {
    const htmlContent = generateThermalReceiptHtml(order, cashierFallback, options);
    const billNo = order.invoiceNumber || order.orderNumber || order.orderId || order._id || 'receipt';

    await printViaIsolatedIframe({
      html: htmlContent,
      title: `Receipt - ${billNo}`,
      rollWidth: rollWidth,
    });

    return { success: true, method: 'iframe' };
  } catch (iframeErr: any) {
    console.error('[printThermalReceipt] Iframe print failure:', iframeErr);
    return { success: false, method: 'iframe', error: iframeErr?.message || 'Print failed' };
  }
}
