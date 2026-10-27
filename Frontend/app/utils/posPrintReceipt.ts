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
 */
export function generateThermalReceiptHtml(
  order: ThermalReceiptOrder,
  cashierFallback: string = 'Staff',
  options?: PrintReceiptOptions
): string {
  const rollWidth = options?.rollWidth || '80mm';
  const is58mm = rollWidth === '58mm';
  const printableWidth = is58mm ? '48mm' : '72mm';
  const containerWidth = is58mm ? '58mm' : '80mm';

  const storeName = (options?.storeName || 'RETAILVERSE').toUpperCase();
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
      const code = item.barcode || item.sku || '';
      const qty = Number(item.quantity) || 1;
      const unitPrice = Number(item.unitPrice !== undefined ? item.unitPrice : item.price || 0);
      const lineTotal = Number(item.itemTotal !== undefined ? item.itemTotal : unitPrice * qty);

      return `
        <tr>
          <td style="padding: 2.5px 0; text-align: left; vertical-align: top;">
            <div style="font-size: ${is58mm ? '9px' : '10.5px'}; line-height: 1.15; font-weight: bold;">${escapeHtml(name)}</div>
            ${code ? `<div style="font-size: 8px; font-weight: normal; color: #000;">${escapeHtml(code)}</div>` : ''}
          </td>
          <td style="padding: 2.5px 0; text-align: center; vertical-align: top; font-size: ${is58mm ? '9px' : '10px'}; font-weight: bold;">${qty}</td>
          <td style="padding: 2.5px 0; text-align: right; vertical-align: top; font-size: ${is58mm ? '9px' : '10px'}; font-weight: bold;">&#8377;${unitPrice.toFixed(2)}</td>
          <td style="padding: 2.5px 0; text-align: right; vertical-align: top; font-size: ${is58mm ? '9px' : '10px'}; font-weight: bold;">&#8377;${lineTotal.toFixed(2)}</td>
        </tr>
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
        <span>COUPON DISCOUNT ${appliedCode ? `(${escapeHtml(appliedCode)})` : ''}:</span>
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
      ${order.customerName && order.customerName !== 'Walk-in Customer' ? `<div>CUSTOMER : ${escapeHtml(order.customerName.toUpperCase())}</div>` : ''}
      ${order.customerPhone ? `<div>PHONE    : ${escapeHtml(order.customerPhone)}</div>` : ''}
      ${order.customerAddress ? `<div>ADDRESS  : ${escapeHtml(order.customerAddress.toUpperCase())}</div>` : ''}
    </div>
  `
    : '';

  // Payment details
  const paymentDetailsHtml =
    order.paymentDetails?.cardLast4 || order.upiId || order.paymentDetails?.upiId
      ? `
      <div style="font-size: 8.5px; padding: 2px 0;">
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
          padding: 2mm ${is58mm ? '1.5mm' : '3mm'};
          background: #ffffff;
          color: #000000;
          font-size: ${is58mm ? '9.5px' : '10.5px'};
          line-height: 1.25;
        }
        .header {
          text-align: center;
          border-bottom: 1px dashed #000000;
          padding-bottom: 4px;
          margin-bottom: 4px;
        }
        .store-name {
          font-size: ${is58mm ? '15px' : '18px'};
          font-weight: 900 !important;
          letter-spacing: 1px;
          margin-bottom: 2px;
          text-transform: uppercase;
        }
        .tax-inv {
          font-size: ${is58mm ? '10.5px' : '12px'};
          letter-spacing: 0.5px;
          margin-bottom: 2px;
          font-weight: bold;
        }
        .store-sub {
          font-size: 8.5px;
          line-height: 1.2;
          margin-bottom: 2px;
        }
        .pay-mode {
          font-size: 10px;
          font-weight: bold;
          letter-spacing: 0.5px;
          margin-bottom: 3px;
        }
        .meta-row {
          display: flex;
          justify-content: space-between;
          font-size: ${is58mm ? '8.5px' : '9.5px'};
          line-height: 1.3;
          font-weight: bold;
        }
        .customer-section {
          border-top: 1px dashed #000000;
          border-bottom: 1px dashed #000000;
          padding: 3px 0;
          margin: 3px 0;
          font-size: ${is58mm ? '8.5px' : '9px'};
          line-height: 1.25;
          font-weight: bold;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 3px;
          border-top: 1px dashed #000000;
          border-bottom: 1px dashed #000000;
        }
        th {
          font-size: ${is58mm ? '8.5px' : '9.5px'};
          padding: 3px 0;
          border-bottom: 1px dashed #000000;
          font-weight: 900 !important;
        }
        .totals {
          margin-top: 4px;
          font-size: ${is58mm ? '9.5px' : '10.5px'};
          font-weight: bold;
        }
        .row {
          display: flex;
          justify-content: space-between;
          padding: 1.5px 0;
        }
        .grand-total {
          font-size: ${is58mm ? '12px' : '13.5px'};
          font-weight: 900 !important;
          border-top: 1px dashed #000000;
          border-bottom: 1px dashed #000000;
          padding: 3.5px 0;
          margin-top: 3px;
        }
        .footer {
          margin-top: 6px;
          border-top: 1px dashed #000000;
          padding-top: 5px;
          text-align: center;
          font-size: ${is58mm ? '8px' : '8.5px'};
          line-height: 1.35;
          font-weight: bold;
        }
      </style>

      <div class="header">
        <div class="store-name">${escapeHtml(storeName)}</div>
        <div class="tax-inv">${escapeHtml(storeTagline)}</div>
        ${storeAddress ? `<div class="store-sub">${escapeHtml(storeAddress)}</div>` : ''}
        ${storePhone ? `<div class="store-sub">Phone: ${escapeHtml(storePhone)}</div>` : ''}
        ${storeGstin ? `<div class="store-sub">${escapeHtml(storeGstin)}</div>` : ''}
        <div class="pay-mode">PAYMENT: ${escapeHtml(paymentMethod)}</div>
        <div class="meta-row">
          <span>BILL NO: ${escapeHtml(billNo)}</span>
          <span>DATE: ${formattedDate}</span>
        </div>
        <div class="meta-row">
          <span>TIME: ${formattedTime}</span>
          <span>CASHIER: ${escapeHtml(cashier)}</span>
        </div>
      </div>

      ${customerHtml}
      ${paymentDetailsHtml}

      <table>
        <thead>
          <tr>
            <th style="text-align: left; width: 44%;">ITEM</th>
            <th style="text-align: center; width: 14%;">QTY</th>
            <th style="text-align: right; width: 21%;">PRICE</th>
            <th style="text-align: right; width: 21%;">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

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
        <div class="row grand-total">
          <span>GRAND TOTAL:</span>
          <span>&#8377;${grandTotal}</span>
        </div>
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
 * First checks for an active direct WebUSB printer connection (bypassing browser dialogs).
 * Seamlessly falls back to isolated hidden <iframe> printing targeting exact 80mm/58mm roll width.
 */
export async function printThermalReceipt(
  order: ThermalReceiptOrder,
  cashierFallback: string = 'Staff',
  options?: PrintReceiptOptions
): Promise<{ success: boolean; method: 'webusb' | 'iframe'; error?: string }> {
  if (!order) {
    console.warn('[printThermalReceipt] No order document provided.');
    return { success: false, method: 'iframe', error: 'No order provided' };
  }

  // 1. Try Direct WebUSB ESC/POS binary printing if connected
  const activeUsbDevice = thermalHardware.getConnectedDevice();
  const preferUsb = options?.preferUsb !== false;

  if (activeUsbDevice && preferUsb) {
    try {
      const settings: PrinterSettings = {
        ...DEFAULT_PRINTER_SETTINGS,
        rollWidth: options?.rollWidth || '80mm',
        storeName: options?.storeName || DEFAULT_PRINTER_SETTINGS.storeName,
        storeTagline: options?.storeTagline || DEFAULT_PRINTER_SETTINGS.storeTagline,
        storeAddress: options?.storeAddress || DEFAULT_PRINTER_SETTINGS.storeAddress,
        storePhone: options?.storePhone || DEFAULT_PRINTER_SETTINGS.storePhone,
        storeGstin: options?.storeGstin || DEFAULT_PRINTER_SETTINGS.storeGstin,
        footerNote: options?.footerNote || DEFAULT_PRINTER_SETTINGS.footerNote,
      };

      const buffer = buildReceiptEscPos(order, settings, cashierFallback);
      await thermalHardware.sendRaw(buffer);
      console.log('[printThermalReceipt] Dispatched raw binary ESC/POS receipt via WebUSB.');
      return { success: true, method: 'webusb' };
    } catch (usbErr: any) {
      console.warn('[printThermalReceipt] WebUSB print error, falling back to hidden iframe:', usbErr);
    }
  }

  // 2. Fallback: Isolated hidden <iframe> print engine
  try {
    const rollWidth = options?.rollWidth || '80mm';
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
