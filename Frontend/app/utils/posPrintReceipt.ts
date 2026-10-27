/**
 * POS Thermal Receipt Direct / Silent Printing Utility
 * 
 * Flow:
 * 1. Renders the receipt HTML directly into a hidden <iframe> without opening new tabs / 'about:blank' pages.
 * 2. Formatted for standard 80mm thermal receipt printers with pure pitch-black (#000) bold text for high contrast.
 * 3. Triggers iframe.contentWindow.print() smoothly.
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 * SILENT / DIRECT PRINTING GUIDE (Bypass Browser Print Dialog Completely):
 * ─────────────────────────────────────────────────────────────────────────────
 * By default, web browsers display a print preview / printer confirmation modal.
 * To enable 100% silent direct printing (one-click instant physical print without dialog):
 * 
 * Windows Chrome Setup:
 * 1. Close all running Google Chrome windows.
 * 2. Right-click your Google Chrome desktop shortcut and select "Properties".
 * 3. In the "Shortcut" tab, find the "Target" input field.
 * 4. At the end of the Target path (after chrome.exe"), add a space and paste:
 *      --kiosk --kiosk-printing
 *    Example Target:
 *      "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --kiosk-printing
 * 5. Click "Apply" and "OK".
 * 6. Set your 80mm Thermal Receipt Printer as the "Default Printer" in Windows Settings.
 * 7. Launch Chrome using this shortcut and open the POS. All receipt prints will now
 *    physically print immediately without showing any browser dialog!
 * ─────────────────────────────────────────────────────────────────────────────
 */

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

export function printThermalReceipt(order: ThermalReceiptOrder, cashierFallback: string = 'Staff'): void {
  if (!order) {
    console.warn('[printThermalReceipt] No order document provided.');
    return;
  }

  // 1. Locate or create a persistent hidden iframe to prevent blank tab redirects
  let iframe = document.getElementById('pos-thermal-receipt-iframe') as HTMLIFrameElement;
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'pos-thermal-receipt-iframe';
    iframe.name = 'pos-thermal-receipt-iframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = '0';
    iframe.style.margin = '0';
    iframe.style.padding = '0';
    iframe.style.visibility = 'hidden';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);
  }

  const iframeWin = iframe.contentWindow;
  const iframeDoc = iframe.contentDocument || iframeWin?.document;

  if (!iframeDoc || !iframeWin) {
    console.error('[printThermalReceipt] Failed to access print iframe document.');
    return;
  }

  // 2. Format Date (DD/MM/YY) and Time (HH:MM:SS)
  const orderDate = order.createdAt ? new Date(order.createdAt) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dd = pad(orderDate.getDate());
  const mm = pad(orderDate.getMonth() + 1);
  const yy = String(orderDate.getFullYear()).slice(-2);
  const formattedDate = `${dd}/${mm}/${yy}`;

  const hh = pad(orderDate.getHours());
  const min = pad(orderDate.getMinutes());
  const ss = pad(orderDate.getSeconds());
  const formattedTime = `${hh}:${min}:${ss}`;

  // 3. Extract metadata
  const billNo = order.invoiceNumber || order.orderNumber || order.orderId || order._id || 'N/A';
  const cashier = order.cashierName || cashierFallback || 'Staff';
  const paymentMethod = (order.paymentMethod || 'CASH').toUpperCase();

  // 4. Format line items
  const items = order.items || [];
  const itemsHtml = items
    .map((item) => {
      const name = item.name || 'Item';
      const code = item.barcode || item.sku || '';
      const qty = Number(item.quantity) || 1;
      const unitPrice = Number(item.unitPrice !== undefined ? item.unitPrice : item.price || 0);
      const lineTotal = Number(
        item.itemTotal !== undefined ? item.itemTotal : unitPrice * qty
      );

      return `
        <tr>
          <td style="padding: 3px 0; text-align: left; vertical-align: top;">
            <div style="font-size: 10px; line-height: 1.2;">${escapeHtml(name)}</div>
            ${code ? `<div style="font-size: 8px; font-weight: normal; color: #000;">${escapeHtml(code)}</div>` : ''}
          </td>
          <td style="padding: 3px 0; text-align: center; vertical-align: top; font-size: 10px;">${qty}</td>
          <td style="padding: 3px 0; text-align: right; vertical-align: top; font-size: 10px;">&#8377;${unitPrice.toFixed(2)}</td>
          <td style="padding: 3px 0; text-align: right; vertical-align: top; font-size: 10px;">&#8377;${lineTotal.toFixed(2)}</td>
        </tr>
      `;
    })
    .join('');

  // 5. Calculations
  const subtotal = Number(order.subtotal || 0).toFixed(2);
  const discountAmt = Number(order.discountAmount) || 0;
  const appliedCode = order.couponCode ? String(order.couponCode).trim() : '';
  const discountHtml =
    discountAmt > 0
      ? `
      <div class="row">
        <span>COUPON DISCOUNT ${appliedCode ? `(${appliedCode})` : ''}:</span>
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

  // 6. Optional customer & payment details
  const hasCustomer = (order.customerName && order.customerName !== 'Walk-in Customer') || order.customerPhone || order.customerAddress;
  const customerHtml = hasCustomer
    ? `
    <div class="customer-section">
      ${order.customerName && order.customerName !== 'Walk-in Customer' ? `<div>CUSTOMER : ${escapeHtml(order.customerName.toUpperCase())}</div>` : ''}
      ${order.customerPhone ? `<div>PHONE    : ${escapeHtml(order.customerPhone)}</div>` : ''}
      ${order.customerAddress ? `<div>ADDRESS  : ${escapeHtml(order.customerAddress.toUpperCase())}</div>` : ''}
    </div>
  `
    : '';

  const paymentDetailsHtml =
    order.paymentDetails?.cardLast4 || order.upiId || order.paymentDetails?.upiId
      ? `
      <div style="font-size: 9px; padding: 2px 0;">
        ${order.paymentDetails?.cardLast4 ? `<div>CARD: **** **** **** ${escapeHtml(order.paymentDetails.cardLast4)} (${escapeHtml(order.paymentDetails.cardNetwork || 'CARD')})</div>` : ''}
        ${order.upiId || order.paymentDetails?.upiId ? `<div>UPI ID: ${escapeHtml(order.upiId || order.paymentDetails?.upiId || '')}</div>` : ''}
      </div>
    `
      : '';

  // 7. Full Thermal Receipt HTML Document
  const receiptDoc = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Receipt - ${billNo}</title>
        <style>
          @media print {
            @page {
              size: 80mm auto;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 4mm;
              width: 80mm;
              font-family: monospace;
              font-weight: bold;
              color: #000;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
          * {
            box-sizing: border-box;
            color: #000 !important;
            font-weight: bold !important;
          }
          body {
            margin: 0;
            padding: 4mm;
            width: 80mm;
            font-family: 'Courier New', Courier, monospace;
            font-size: 10.5px;
            line-height: 1.25;
            color: #000;
            background: #fff;
          }
          .header {
            text-align: center;
            border-bottom: 1px dashed #000;
            padding-bottom: 5px;
            margin-bottom: 4px;
          }
          .store-name {
            font-size: 18px;
            font-weight: 900 !important;
            letter-spacing: 1.5px;
            margin-bottom: 2px;
            text-transform: uppercase;
          }
          .tax-inv {
            font-size: 12px;
            letter-spacing: 1px;
            margin-bottom: 2px;
          }
          .pay-mode {
            font-size: 11px;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
          }
          .meta-row {
            display: flex;
            justify-content: space-between;
            font-size: 9.5px;
            line-height: 1.35;
          }
          .customer-section {
            border-top: 1px dashed #000;
            border-bottom: 1px dashed #000;
            padding: 3px 0;
            margin: 4px 0;
            font-size: 9.5px;
            line-height: 1.3;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 4px;
            border-top: 1px dashed #000;
            border-bottom: 1px dashed #000;
          }
          th {
            font-size: 9.5px;
            padding: 4px 0;
            border-bottom: 1px dashed #000;
          }
          td {
            font-size: 9.5px;
          }
          .totals {
            margin-top: 5px;
            font-size: 10.5px;
          }
          .row {
            display: flex;
            justify-content: space-between;
            padding: 1.5px 0;
          }
          .grand-total {
            font-size: 13.5px;
            font-weight: 900 !important;
            border-top: 1px dashed #000;
            border-bottom: 1px dashed #000;
            padding: 4px 0;
            margin-top: 3px;
          }
          .footer {
            margin-top: 8px;
            border-top: 1px dashed #000;
            padding-top: 6px;
            text-align: center;
            font-size: 9px;
            line-height: 1.4;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="store-name">MY STORE</div>
          <div class="tax-inv">TAX INVOICE</div>
          <div class="pay-mode">${escapeHtml(paymentMethod)}</div>
          <div class="meta-row">
            <span>BILL NO. : ${escapeHtml(billNo)}</span>
            <span>DATE : ${formattedDate}</span>
          </div>
          <div class="meta-row">
            <span>TIME : ${formattedTime}</span>
            <span>CASHIER : ${escapeHtml(cashier)}</span>
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
          <div>THANKS FOR YOUR KIND VISIT!</div>
          <div>NO REFUND / NO REPLACEMENT</div>
          <div style="font-size: 8px; margin-top: 3px; font-weight: normal !important;">GOODS ONCE SOLD CANNOT BE TAKEN BACK</div>
        </div>
      </body>
    </html>
  `;

  // 8. Render into iframe and trigger print
  iframeDoc.open();
  iframeDoc.write(receiptDoc);
  iframeDoc.close();

  // Allow brief tick for DOM and font rendering before print dialog
  setTimeout(() => {
    try {
      iframeWin.focus();
      iframeWin.print();
    } catch (printErr) {
      console.error('[printThermalReceipt] Error invoking print:', printErr);
    }
  }, 120);
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
