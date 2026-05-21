/**
 * Email Service Utility
 * ---------------------
 * Provides a reusable nodemailer transporter for sending emails.
 * Reads SMTP configuration from backend environment variables ONLY.
 *
 * Required env vars (set in Render → Environment):
 *   SMTP_HOST   - SMTP server host (e.g. smtp-relay.brevo.com)
 *   SMTP_PORT   - SMTP server port (e.g. 587 or 465)
 *   SMTP_USER   - SMTP username/login
 *   SMTP_PASS   - SMTP password/key
 *   SMTP_FROM   - Verified sender email address
 *
 * Example Render production environment variables using Brevo:
 *   SMTP_HOST=smtp-relay.brevo.com
 *   SMTP_PORT=587
 *   SMTP_USER=your_brevo_smtp_login
 *   SMTP_PASS=your_brevo_smtp_key
 *   SMTP_FROM=verified_sender_email
 */

const nodemailer = require("nodemailer");

let _transporter = null;
let _transporterConfigHash = null;
let _transporterVerified = false;

/**
 * Build a simple hash of current SMTP config so we can detect env changes.
 */
function _smtpConfigHash() {
  return [
    process.env.SMTP_HOST,
    process.env.SMTP_PORT,
    process.env.SMTP_USER,
    process.env.SMTP_PASS,
    process.env.SMTP_FROM,
  ].join("|");
}

/**
 * Returns a lazily-created nodemailer transporter.
 * Throws a descriptive error when SMTP env vars are missing.
 * Re-creates the transporter if environment variables change.
 */
function getTransporter() {
  const currentHash = _smtpConfigHash();
  if (_transporter && _transporterConfigHash === currentHash) return _transporter;

  const host = process.env.SMTP_HOST;
  const rawPort = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  // Task 9 & 5: Diagnostic log — NEVER log SMTP_PASS
  console.log("=== [emailService] SMTP Config Check ===");
  console.log(`SMTP_HOST: ${host || "(missing)"}`);
  console.log(`SMTP_PORT: ${rawPort || "(missing)"}`);
  console.log(`SMTP_USER exists: ${!!user}`);
  console.log(`SMTP_PASS exists: ${!!pass}`);
  console.log(`SMTP_FROM exists: ${!!from}`);
  console.log("========================================");

  // Task 10: Check missing SMTP environment variables
  if (!host || !rawPort || !user || !pass || !from) {
    const missing = [];
    if (!host) missing.push("SMTP_HOST");
    if (!rawPort) missing.push("SMTP_PORT");
    if (!user) missing.push("SMTP_USER");
    if (!pass) missing.push("SMTP_PASS");
    if (!from) missing.push("SMTP_FROM");
    
    const err = new Error(`SMTP configuration missing: ${missing.join(", ")}`);
    err.code = "EMISSINGCONFIG";
    throw err;
  }

  // Task 5: Convert SMTP_PORT to Number
  const port = Number(rawPort);

  // Task 6: Auto-derive secure mode from port number:
  //   465 → SSL (secure: true)
  //   587 → STARTTLS (secure: false)
  const secure = port === 465;

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    // Task 7: ── Timeouts — prevent hanging on Render / cloud environments ──
    connectionTimeout: 30000,  // 30s to establish TCP connection
    greetingTimeout:   30000,  // 30s for SMTP greeting
    socketTimeout:     30000,  // 30s for socket inactivity
    // TLS settings for STARTTLS (port 587 or other non-465 ports)
    ...(!secure ? { tls: { rejectUnauthorized: false } } : {}),
  });

  _transporterConfigHash = currentHash;
  _transporterVerified = false; // needs re-verification after recreate
  console.log(`[emailService] Transporter created — host=${host}, port=${port}, secure=${secure}`);

  return _transporter;
}

/**
 * Verify the transporter SMTP connection (blocking).
 * Called once before the first email send.
 * Throws classified errors for missing config, auth failure, or timeout.
 */
async function verifyTransporter() {
  const transporter = getTransporter();

  try {
    await transporter.verify();
    _transporterVerified = true;
    console.log("[emailService] ✅ SMTP transporter verified — ready to send emails");
  } catch (err) {
    console.error(`[emailService] ⚠️ SMTP transporter verification FAILED: ${err.message}`);
    if (err.code) console.error(`[emailService] Error code: ${err.code}`);

    // Task 10: Classify the error for the controller
    if (err.responseCode === 535 || err.code === "EAUTH" || (err.message && err.message.toLowerCase().includes("authentication")) || (err.message && err.message.toLowerCase().includes("credentials"))) {
      const authErr = new Error("SMTP authentication failed. Please check your SMTP_USER and SMTP_PASS.");
      authErr.code = "EAUTH";
      authErr.responseCode = err.responseCode;
      throw authErr;
    }
    if (err.code === "ETIMEDOUT" || err.code === "ESOCKET" || err.code === "ECONNECTION" || err.message?.toLowerCase().includes("timeout") || err.message?.toLowerCase().includes("timed out")) {
      const timeoutErr = new Error("SMTP connection timed out from Render production server. Use a production email provider like Brevo, SendGrid, Mailgun, or Resend SMTP.");
      timeoutErr.code = "ETIMEDOUT";
      throw timeoutErr;
    }
    throw err;
  }
}

/**
 * Send an email.
 * @param {{ to: string, subject: string, html: string, text?: string }} opts
 * @returns {Promise<{ messageId: string }>}
 */
async function sendEmail({ to, subject, html, text }) {
  // Task 9: Safe production logs before sending email — NEVER log SMTP_PASS
  console.log("=== [emailService] PRE-SEND SMTP DIAGNOSTICS ===");
  console.log(`SMTP_HOST: ${process.env.SMTP_HOST || "(missing)"}`);
  console.log(`SMTP_PORT: ${process.env.SMTP_PORT || "(missing)"}`);
  console.log(`SMTP_USER exists: ${!!process.env.SMTP_USER}`);
  console.log(`SMTP_PASS exists: ${!!process.env.SMTP_PASS}`);
  console.log(`SMTP_FROM exists: ${!!process.env.SMTP_FROM}`);
  console.log(`Recipient email exists: ${!!to}`);
  console.log("=================================================");

  // Task 10: Check invalid recipient email address
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    const emailErr = new Error(`Invalid recipient email address: "${to || ""}"`);
    emailErr.code = "EINVALIDRECIPIENT";
    throw emailErr;
  }

  // Get transporter (throws EMISSINGCONFIG if env variables are missing)
  const transporter = getTransporter();

  // Task 8: Add transporter.verify() before sendMail
  try {
    console.log("[emailService] Verifying transporter connection before sending...");
    await transporter.verify();
    console.log("[emailService] ✅ SMTP transporter connection verified");
  } catch (err) {
    console.error(`[emailService] ⚠️ SMTP connection verification failed before sendMail: ${err.message}`);
    // Classify error
    if (err.responseCode === 535 || err.code === "EAUTH" || (err.message && err.message.toLowerCase().includes("authentication")) || (err.message && err.message.toLowerCase().includes("credentials"))) {
      const authErr = new Error("SMTP authentication failed. Please check your SMTP_USER and SMTP_PASS.");
      authErr.code = "EAUTH";
      authErr.responseCode = err.responseCode;
      throw authErr;
    }
    if (err.code === "ETIMEDOUT" || err.code === "ESOCKET" || err.code === "ECONNECTION" || err.message?.toLowerCase().includes("timeout") || err.message?.toLowerCase().includes("timed out")) {
      const timeoutErr = new Error("SMTP connection timed out from Render production server. Use a production email provider like Brevo, SendGrid, Mailgun, or Resend SMTP.");
      timeoutErr.code = "ETIMEDOUT";
      throw timeoutErr;
    }
    throw err;
  }

  const fromAddr = process.env.SMTP_FROM || process.env.SMTP_USER;

  try {
    const info = await transporter.sendMail({
      from: fromAddr,
      to,
      subject,
      html,
      ...(text ? { text } : {}),
    });

    console.log(`[emailService] Email sent to ${to} — messageId=${info.messageId}`);
    return { messageId: info.messageId };
  } catch (err) {
    console.error(`[emailService] sendMail FAILED — to=${to}, error=${err.message}`);
    if (err.code) console.error(`[emailService] SMTP error code: ${err.code}`);
    if (err.responseCode) console.error(`[emailService] SMTP response code: ${err.responseCode}`);
    throw err;
  }
}

/**
 * Build a premium HTML invoice email body.
 * @param {object} invoice – invoice data (same shape as latestInvoiceData on the frontend)
 * @returns {string} HTML string
 */
function buildInvoiceEmailHtml(invoice) {
  const formatCurrency = (n) => {
    const num = Number(n) || 0;
    return "₹" + num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const issueDate = new Date(invoice.createdAt || Date.now()).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const itemsHtml = (invoice.items || [])
    .map(
      (item, idx) => `
      <tr style="border-bottom: 1px solid #f0e6d2;">
        <td style="padding: 14px 16px; font-weight: 600; color: #111111; font-size: 14px;">${item.name}</td>
        <td style="padding: 14px 16px; text-align: center; color: #666; font-size: 14px;">${item.quantity}</td>
        <td style="padding: 14px 16px; text-align: right; color: #666; font-size: 14px;">${formatCurrency(item.price)}</td>
        <td style="padding: 14px 16px; text-align: right; font-weight: 700; color: #111111; font-size: 14px;">${formatCurrency(item.subtotal || item.price * item.quantity)}</td>
      </tr>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${invoice.invoiceNumber}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f0e8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f0e8; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #fffcf5; border-radius: 16px; border: 1px solid #e6d5b8; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; border-bottom: 1px solid #f0e6d2;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="display: inline-block; width: 5px; height: 32px; background-color: #b89146; border-radius: 3px; vertical-align: middle; margin-right: 10px;"></div>
                    <span style="font-size: 28px; font-weight: 900; color: #111111; letter-spacing: -0.5px; vertical-align: middle;">INVOICE</span>
                    <br>
                    <span style="font-size: 14px; font-weight: 700; color: #b89146; letter-spacing: 1px; margin-top: 4px; display: inline-block;">${invoice.invoiceNumber}</span>
                  </td>
                  <td style="text-align: right; vertical-align: top;">
                    <div style="display: inline-block; background-color: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; border-radius: 999px; padding: 4px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;">
                      ✓ ${invoice.paymentStatus === "paid" || invoice.paymentStatus === "Paid" || invoice.paymentStatus === "Completed" ? "Payment Success" : invoice.paymentStatus || "Completed"}
                    </div>
                    <br>
                    <span style="font-size: 10px; font-weight: 700; color: #999; text-transform: uppercase; letter-spacing: 1.5px;">Issue Date</span>
                    <br>
                    <span style="font-size: 14px; font-weight: 700; color: #111111;">${issueDate}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Customer & Payment Info -->
          <tr>
            <td style="padding: 24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align: top; width: 50%;">
                    <span style="font-size: 10px; font-weight: 900; color: #b89146; text-transform: uppercase; letter-spacing: 2px;">Billed To</span>
                    <div style="margin-top: 8px; background: rgba(255,255,255,0.6); border-radius: 10px; border: 1px solid #f0e6d2; padding: 12px;">
                      <div style="font-size: 14px; font-weight: 700; color: #111111;">${invoice.customerName || "POS Customer"}</div>
                      ${invoice.customerEmail ? `<div style="font-size: 12px; color: #888; margin-top: 6px; font-style: italic;">${invoice.customerEmail}</div>` : ""}
                    </div>
                  </td>
                  <td style="vertical-align: top; width: 50%; text-align: right;">
                    <span style="font-size: 10px; font-weight: 900; color: #b89146; text-transform: uppercase; letter-spacing: 2px;">Payment Method</span>
                    <div style="margin-top: 8px; background: rgba(255,255,255,0.6); border-radius: 10px; border: 1px solid #f0e6d2; padding: 12px; display: inline-block; min-width: 140px; text-align: right;">
                      <div style="font-size: 14px; font-weight: 700; color: #111111;">${invoice.paymentMethod || "N/A"}</div>
                      <div style="font-size: 10px; color: #059669; margin-top: 4px; font-weight: 700; text-transform: uppercase;">Verified Transaction</div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Order ID -->
          <tr>
            <td style="padding: 0 32px 16px 32px;">
              <span style="font-size: 10px; font-weight: 700; color: #999; text-transform: uppercase; letter-spacing: 1.5px;">Order ID:</span>
              <span style="font-size: 11px; font-weight: 700; color: #111111; font-family: monospace; background: #fff; padding: 2px 8px; border-radius: 4px; border: 1px solid #f0e6d2; margin-left: 4px;">${invoice.orderId || "N/A"}</span>
            </td>
          </tr>

          <!-- Items Table -->
          <tr>
            <td style="padding: 0 32px 24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius: 12px; border: 1px solid #f0e6d2; overflow: hidden;">
                <thead>
                  <tr style="background-color: rgba(184, 145, 70, 0.08);">
                    <th style="padding: 12px 16px; text-align: left; font-size: 10px; font-weight: 900; color: #b89146; text-transform: uppercase; letter-spacing: 1.5px;">Item</th>
                    <th style="padding: 12px 16px; text-align: center; font-size: 10px; font-weight: 900; color: #b89146; text-transform: uppercase; letter-spacing: 1.5px;">Qty</th>
                    <th style="padding: 12px 16px; text-align: right; font-size: 10px; font-weight: 900; color: #b89146; text-transform: uppercase; letter-spacing: 1.5px;">Price</th>
                    <th style="padding: 12px 16px; text-align: right; font-size: 10px; font-weight: 900; color: #b89146; text-transform: uppercase; letter-spacing: 1.5px;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Totals -->
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-left: auto; min-width: 240px; background: rgba(184,145,70,0.05); border-radius: 12px; border: 1px solid #f0e6d2; padding: 16px;">
                <tr>
                  <td style="padding: 8px 16px; font-size: 12px; font-weight: 700; color: #888; text-transform: uppercase;">Subtotal</td>
                  <td style="padding: 8px 16px; font-size: 12px; font-weight: 700; color: #111111; text-align: right;">${formatCurrency(invoice.subtotal)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 16px; font-size: 12px; font-weight: 700; color: #888; text-transform: uppercase;">GST / Tax</td>
                  <td style="padding: 8px 16px; font-size: 12px; font-weight: 700; color: #111111; text-align: right;">${formatCurrency(invoice.tax || 0)}</td>
                </tr>
                <tr style="border-top: 1px solid rgba(184,145,70,0.2);">
                  <td style="padding: 12px 16px; font-size: 10px; font-weight: 900; color: #b89146; text-transform: uppercase; letter-spacing: 2px;">Grand Total</td>
                  <td style="padding: 12px 16px; font-size: 20px; font-weight: 900; color: #111111; text-align: right;">${formatCurrency(invoice.totalAmount)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; text-align: center; border-top: 1px solid #f0e6d2; background-color: rgba(184,145,70,0.03);">
              <p style="margin: 0; font-size: 12px; color: #999; font-style: italic;">Thank you for your business. We hope to see you again soon!</p>
              <p style="margin: 8px 0 0 0; font-size: 10px; color: #ccc;">This invoice was generated automatically by RetailVerse POS.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = { sendEmail, buildInvoiceEmailHtml, getTransporter, verifyTransporter };
