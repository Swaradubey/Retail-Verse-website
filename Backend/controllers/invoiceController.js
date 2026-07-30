const Invoice = require("../models/Invoice");
const Order = require("../models/Order");
const SupportTicket = require("../models/SupportTicket");
const User = require("../models/User");
const { isValidObjectId, resolveClientId } = require("../utils/tenantResolver");

/**
 * Helper to fetch and resolve business profile details for a Client.
 * @param {import("mongoose").Types.ObjectId|Object|null} clientInput
 * @returns {Promise<Object>}
 */
async function resolveBusinessProfile(clientInput) {
  const business = {
    name: "",
    tagline: "",
    logo: "",
    address: "",
    email: "",
    phone: "",
    taxNumber: "",
    website: ""
  };

  if (!clientInput) {
    business.name = "Business Profile";
    return business;
  }

  const Client = require("../models/Client");
  const User = require("../models/User");
  const CustomDomain = require("../models/CustomDomain");

  let client = clientInput;
  if (clientInput && !(clientInput.companyName || clientInput.shopName)) {
    try {
      client = await Client.findById(clientInput);
    } catch (err) {
      console.error("[resolveBusinessProfile] Error fetching client by ID:", err.message);
    }
  }

  if (client) {
    business.name = client.companyName || client.shopName || "";
    business.tagline = client.brandingName || "";
    business.logo = client.logo || "";
    business.address = client.permanentAddress || "";
    business.email = client.email || "";
    business.phone = client.phone || "";
    business.taxNumber = client.gst || "";

    try {
      const domainDoc = await CustomDomain.findOne({ clientId: client._id, status: "Verified" });
      if (domainDoc) {
        business.website = domainDoc.domainName || domainDoc.domain || "";
      }
    } catch (err) {
      console.error("[resolveBusinessProfile] Error resolving custom domain:", err.message);
    }
  }

  // Fallback Logic:
  // 1. Business Name (client.companyName)
  // 2. Store Name (client.shopName)
  // 3. Merchant Name (User name)
  if (!business.name && client) {
    try {
      let merchantUser = await User.findById(client.userId || client.createdBy);
      if (!merchantUser) {
        merchantUser = await User.findOne({ clientId: client._id, role: { $in: ["client", "admin"] } });
      }
      if (merchantUser) {
        business.name = merchantUser.name || "";
        if (!business.email) business.email = merchantUser.email || "";
        if (!business.phone) business.phone = merchantUser.phone || "";
        if (!business.address) {
          business.address = merchantUser.address || (merchantUser.storeSettings && merchantUser.storeSettings.storeAddress) || "";
        }
      }
    } catch (err) {
      console.error("[resolveBusinessProfile] Error fetching merchant user:", err.message);
    }
  }

  // Never display "DAIZY HOMES" as a fallback
  if (!business.name || business.name.toUpperCase() === "DAIZY HOMES") {
    business.name = "Business Profile";
  }

  return business;
}

// @desc    Get all invoices
// @route   GET /api/invoices
// @access  Private (SuperAdmin)
const getInvoices = async (req, res) => {
  try {
    const role = req.user?.role || req.user?.userRole || req.user?.accountType;
    const isSuperAdmin = ["superadmin", "super_admin"].includes(String(role).toLowerCase());
    const clientId = req.user?.clientId || req.clientId || (await resolveClientId(req));

    // Requirement 10 & 16: Log data retrieval details
    console.log(`[invoiceController] getInvoices - Page: Invoices, Role: ${role}, ClientId: ${clientId || "global"}`);

    const query = {};
    if (isSuperAdmin) {
      query.$or = [
        { clientId: { $exists: true, $ne: null } },
        { storeId: { $exists: true, $ne: null } },
        { tenantId: { $exists: true, $ne: null } }
      ];
    } else {
      query.clientId = clientId;
    }

    console.log("-----------------------------------------");
    console.log("role:", role, "clientId:", clientId, "query:", JSON.stringify(query));
    console.log("-----------------------------------------");
    let invoices = await Invoice.find(query).sort({ createdAt: -1 }).populate("clientId").lean();
    const orders = await Order.find(query).sort({ createdAt: -1 }).populate("clientId").lean();

    if (!invoices || invoices.length < orders.length) {
      console.log(`[invoiceController] Found ${invoices?.length || 0} invoices but ${orders.length} orders. Deriving missing invoices...`);

      const existingOrderIds = new Set((invoices || []).map(inv => inv.orderId));

      const derivedInvoices = orders
        .filter(order => !existingOrderIds.has(order.orderId))
        .map(order => {
          const isPos = /^POS-/i.test(order.orderId) || /^ORD-POS-/i.test(order.orderId) || order.orderSource === "pos";
          return {
            _id: order._id,
            invoiceNumber: `INV-${order.orderId || order._id.toString().substring(0, 8).toUpperCase()}`,
            orderId: order.orderId,
            customerName: order.customerName || (order.shippingAddress && order.shippingAddress.fullName) || "Unknown",
            customerEmail: order.customerEmail || (order.shippingAddress && order.shippingAddress.email) || "",
            items: order.items || [],
            subtotal: order.totalPrice || 0,
            tax: 0,
            totalAmount: order.totalPrice || 0,
            paymentMethod: order.paymentMethod || "N/A",
            paymentStatus: isPos ? "paid" : (order.paymentStatus || "pending"),
            orderStatus: order.orderStatus || "placed",
            createdAt: order.createdAt,
            clientId: order.clientId,
          };
        });

      invoices = [...(invoices || []), ...derivedInvoices].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // Ensure all POS invoices return "paid" regardless of database state and attach business details
    invoices = await Promise.all(
      invoices.map(async (inv) => {
        const isPos = /^POS-/i.test(inv.orderId) || /^ORD-POS-/i.test(inv.orderId);
        if (isPos) {
          inv.paymentStatus = "paid";
        }
        inv.business = await resolveBusinessProfile(inv.clientId);
        return inv;
      })
    );

    res.json({ success: true, count: invoices.length, data: invoices });
  } catch (error) {
    console.error("[invoiceController] getInvoices error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get invoice by ID
// @route   GET /api/invoices/:id
// @access  Private (SuperAdmin)
const getInvoiceById = async (req, res) => {
  try {
    const role = req.user?.role || req.user?.userRole || req.user?.accountType;
    const isSuperAdmin = ["superadmin", "super_admin"].includes(String(role).toLowerCase());
    const clientId = req.user?.clientId || req.clientId || (await resolveClientId(req));

    console.log(`[invoiceController] getInvoiceById - ID: ${req.params.id}, Role: ${role}, ClientId: ${clientId || "global"}`);

    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: "Invoice not found or access denied (Invalid ID)" });
    }

    const query = { _id: req.params.id };
    if (isSuperAdmin) {
      query.$or = [
        { clientId: { $exists: true, $ne: null } },
        { storeId: { $exists: true, $ne: null } },
        { tenantId: { $exists: true, $ne: null } }
      ];
    } else {
      query.clientId = clientId;
    }
    const invoice = await Invoice.findOne(query).populate("clientId");

    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found or access denied" });
    }

    // Override payment status for POS
    const invoiceObj = invoice.toObject ? invoice.toObject() : { ...invoice };
    if (/^POS-/i.test(invoiceObj.orderId) || /^ORD-POS-/i.test(invoiceObj.orderId)) {
      invoiceObj.paymentStatus = "paid";
    }

    // Resolve business details
    invoiceObj.business = await resolveBusinessProfile(invoice.clientId);

    console.log(`[invoiceController] DB Query - Collection: invoices, Filter: ${JSON.stringify(query)}, Found: true`);

    res.json({ success: true, data: invoiceObj });
  } catch (error) {
    console.error("[invoiceController] getInvoiceById error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Send invoice via email
// @route   POST /api/invoices/send-email
// @access  Private (Staff roles)
const sendInvoiceEmail = async (req, res) => {
  try {
    const { sendEmail, buildInvoiceEmailHtml } = require("../utils/emailService");

    const { recipientEmail, invoiceData } = req.body;

    // Validate email
    if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    if (!invoiceData || !invoiceData.invoiceNumber) {
      return res.status(400).json({
        success: false,
        message: "Invoice data is required.",
      });
    }

    console.log(
      `[invoiceController] sendInvoiceEmail — to: ${recipientEmail}, invoice: ${invoiceData.invoiceNumber}`
    );

    const customerUser = await User.findOne({ email: recipientEmail.toLowerCase().trim() }).select("_id").lean();
    console.log(`[invoiceController] sendInvoiceEmail - Customer email exists: ${!!customerUser}`);

    // Build the HTML email body
    const html = buildInvoiceEmailHtml(invoiceData);

    // Wrap email sending in a timeout so the API never hangs forever
    const EMAIL_TIMEOUT_MS = 55000; // 55 seconds max (under Render's 60s request timeout)
    let timeoutHandle;
    const emailPromise = sendEmail({
      to: recipientEmail,
      subject: `Invoice ${invoiceData.invoiceNumber} — ${invoiceData.customerName || "POS Customer"
        }`,
      html,
      text: `Invoice ${invoiceData.invoiceNumber}\nOrder ID: ${invoiceData.orderId}\nTotal: ₹${invoiceData.totalAmount}\n\nThank you for your business!`,
    });

    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error("SMTP connection timed out from Render production server. Use a production email provider like Brevo, SendGrid, Mailgun, or Resend SMTP.")),
        EMAIL_TIMEOUT_MS
      );
    });

    let emailSent = false;
    let emailSentMessageId = null;
    let emailError = null;

    try {
      const result = await Promise.race([emailPromise, timeoutPromise]);
      clearTimeout(timeoutHandle);
      emailSent = true;
      emailSentMessageId = result?.messageId;
      console.log(`[invoiceController] sendInvoiceEmail SUCCESS — messageId: ${emailSentMessageId}`);
    } catch (err) {
      clearTimeout(timeoutHandle);
      emailError = err;
      console.error(`[invoiceController] sendInvoiceEmail email sending failed:`, err.message);
    }

    console.log(`[invoiceController] sendInvoiceEmail - Invoice email sent: ${emailSent}`);

    // Create Zendesk ticket/request safely
    let zdTicket = null;
    let zdCreated = false;
    let ticketDescription = "";

    try {
      console.log("Creating Zendesk invoice ticket...");
      const ZendeskService = require("../services/zendeskService");

      // Format description/comment body
      const issueDate = new Date(invoiceData.createdAt || Date.now()).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });

      const itemsDescription = (invoiceData.items || [])
        .map(
          (item, idx) =>
            `${idx + 1}. ${item.name} (Qty: ${item.quantity}) - Price: ₹${(item.price || 0).toLocaleString(
              "en-IN",
              { minimumFractionDigits: 2 }
            )} | Subtotal: ₹${(item.subtotal || item.price * item.quantity).toLocaleString("en-IN", {
              minimumFractionDigits: 2,
            })}`
        )
        .join("\n");

      // Check if SMTP timeout
      const isTimeout = emailError && (
        emailError.code === "ETIMEDOUT" ||
        emailError.code === "ESOCKET" ||
        emailError.code === "ECONNECTION" ||
        (emailError.message && (
          emailError.message.includes("timed out") ||
          emailError.message.includes("timeout")
        ))
      );

      let invoiceSentStatus = "Sent successfully";
      if (emailSent) {
        invoiceSentStatus = `Sent successfully (Message ID: ${emailSentMessageId || "N/A"})`;
      } else if (isTimeout) {
        invoiceSentStatus = "Invoice email failed due to SMTP timeout";
      } else {
        invoiceSentStatus = `Failed: ${emailError?.message || "Unknown error"}`;
      }

      ticketDescription = `Invoice Receipt Details:\n\n` +
        `- Invoice Number: ${invoiceData.invoiceNumber}\n` +
        `- Order ID: ${invoiceData.orderId || "N/A"}\n` +
        `- Invoice Date: ${issueDate}\n` +
        `- Customer Name: ${invoiceData.customerName || "POS Customer"}\n` +
        `- Customer Email: ${recipientEmail}\n\n` +
        `Payment Information:\n` +
        `- Payment Method: ${invoiceData.paymentMethod || "N/A"}\n` +
        `- Payment Status: ${invoiceData.paymentStatus || "paid"}\n` +
        `- Subtotal: ₹${(invoiceData.subtotal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}\n` +
        `- Tax: ₹${(invoiceData.tax || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}\n` +
        `- Total Amount: ₹${(invoiceData.totalAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}\n\n` +
        `Items Purchased:\n${itemsDescription}\n\n` +
        `Email Status:\n` +
        `- Status: ${invoiceSentStatus}\n\n` +
        `Created By:\n` +
        `- User ID: ${req.user?._id || "N/A"}\n` +
        `- Client ID: ${req.user?.clientId || req.clientId || invoiceData.clientId || "N/A"}\n\n` +
        `--- \n` +
        `This ticket was automatically generated for invoice receipt.`;

      // Define ticket status: open or pending (using pending if email failed, else open)
      const ticketStatus = emailSent ? "open" : "pending";

      try {
        zdTicket = await ZendeskService.createTicket({
          subject: `Invoice Receipt - Order #${invoiceData.orderId || invoiceData.invoiceNumber}`,
          description: ticketDescription,
          name: invoiceData.customerName || "POS Customer",
          email: recipientEmail,
          tags: ["invoice", "receipt", "automated"],
          type: "task",
          status: ticketStatus,
          priority: "normal",
        });
        if (zdTicket) {
          zdCreated = true;
        }
      } catch (zdErr) {
        console.warn("[Zendesk] Zendesk invoice ticket sync failed (skipping):", zdErr.message);
      }

      console.log(`[invoiceController] Zendesk ticket created: ${zdCreated}`);
      if (zdTicket) {
        console.log(`[invoiceController] Zendesk ticket ID: ${zdTicket.id}`);
      }
      console.log(`[invoiceController] Order ID: ${invoiceData.orderId}`);

      // Requirement 6: Create or link local SupportTicket

      // Lookup the local order to link it if possible
      let orderDoc = null;
      if (invoiceData.orderId) {
        orderDoc = await Order.findOne({ orderId: invoiceData.orderId }).lean();
      }

      let invoiceDoc = null;
      if (invoiceData.invoiceNumber) {
        invoiceDoc = await Invoice.findOne({ invoiceNumber: invoiceData.invoiceNumber }).lean();
      }

      const order = orderDoc || {};
      const invoice = invoiceDoc || invoiceData || {};

      const loggedInRole = String(req.user?.role || req.user?.userRole || req.user?.accountType || '').toLowerCase();
      const isSuperAdminOrAdmin = ["superadmin", "super_admin", "admin"].includes(loggedInRole);

      let determinedClientId = order.clientId || invoice.clientId || req.user?.clientId;
      if (!determinedClientId && invoiceData.orderId) {
        try {
          const orderLookup = await Order.findOne({ orderId: invoiceData.orderId }).select("clientId").lean();
          if (orderLookup?.clientId) {
            determinedClientId = orderLookup.clientId;
          }
        } catch (e) {
          console.warn("[invoiceController] Error resolving clientId from order:", e.message);
        }
      }

      let determinedTenantId = order.clientId || invoice.clientId || req.user?.clientId;
      if (!determinedTenantId && invoiceData.orderId) {
        try {
          const orderLookup = await Order.findOne({ orderId: invoiceData.orderId }).select("clientId").lean();
          if (orderLookup?.clientId) {
            determinedTenantId = orderLookup.clientId;
          }
        } catch (e) {
          console.warn("[invoiceController] Error resolving tenantId from order:", e.message);
        }
      }

      // Safe debugging log & temporary debug logs (Requirement 7)
      console.log(`[DEBUG] Logged-in user details: _id=${req.user?._id}, clientId=${req.user?.clientId}, tenantId=${req.user?.tenantId || "N/A"}, role=${req.user?.role}`);
      console.log(`[invoiceController] Creating local SupportTicket - logged-in role: ${req.user?.role}, userId: ${req.user?._id}, clientId: ${req.user?.clientId || req.clientId || "none"}, Zendesk ticket ID returned: ${zdTicket ? zdTicket.id : "none"}`);

      const ticketSubject = `Invoice Receipt - Order #${order.orderNumber || order._id || invoiceData.orderId || invoiceData.invoiceNumber}`;

      const ticketUser = customerUser ? customerUser._id : req.user?._id || null;

      const ticket = await SupportTicket.create({
        user: ticketUser,
        userName: invoiceData.customerName || "POS Customer",
        userEmail: recipientEmail,
        role: req.user?.role || "client",
        order: orderDoc?._id || undefined,
        orderRef: invoiceData.orderId || invoiceData.invoiceNumber,
        subject: ticketSubject,
        issueType: "order_support",
        description: ticketDescription,
        status: "pending",
        zendeskTicketId: zdTicket ? String(zdTicket.id) : undefined,
        clientId: determinedClientId,
        tenantId: determinedTenantId,
        storeId: req.user?.storeId || null,
        userId: req.user?._id || null,
        createdBy: req.user?._id || null,
        orderId: invoiceData.orderId || invoiceData.invoiceNumber,
        customerEmail: recipientEmail,
        source: "invoice_email",
        category: "Order Support",
        type: "invoice"
      });

      // Logging for debugging (Requirement 9)
      console.log(`[SupportTicket] sendInvoiceEmail - CREATED ticket id: ${ticket._id}, clientId: ${ticket.clientId}, tenantId: ${ticket.tenantId}, storeId: ${ticket.storeId}, userId: ${ticket.userId}, createdBy: ${ticket.createdBy}, customerEmail: ${ticket.customerEmail}`);

      if (ticket) {
        console.log(`[SupportTicket] Local invoice ticket created successfully: ${ticket._id}`);
      }

      // Update local invoice record if it exists
      const dbInvoice = await Invoice.findOne({ invoiceNumber: invoiceData.invoiceNumber });
      if (dbInvoice) {
        dbInvoice.set("zendeskTicketId", zdTicket ? String(zdTicket.id) : undefined);
        await dbInvoice.save();
        console.log(`[invoiceController] Saved zendeskTicketId: ${zdTicket ? zdTicket.id : 'null'} on local Invoice record.`);
      }
    } catch (zdError) {
      console.warn("Zendesk / Local invoice ticket failed");
      console.error("[Zendesk / Local invoice ticket error]:", zdError.message || zdError);
    }

    // Now send response based on email send outcome
    if (emailSent) {
      return res.json({
        success: true,
        message: "Invoice sent successfully.",
        messageId: emailSentMessageId,
      });
    } else {
      // Re-throw emailError to the outer catch for user-friendly error response formatting
      throw emailError;
    }
  } catch (error) {
    console.error("[invoiceController] sendInvoiceEmail error:", error.message);
    if (error.code) console.error("[invoiceController] Error code:", error.code);
    if (error.responseCode) console.error("[invoiceController] SMTP response code:", error.responseCode);
    if (error.response) console.error("[invoiceController] SMTP response:", error.response);

    // Provide a user-friendly message for distinct SMTP and recipient failures
    const isConfigError =
      error.code === "EMISSINGCONFIG" || (error.message && (error.message.includes("missing") || error.message.includes("not configured")));
    const isTimeout =
      error.code === "ETIMEDOUT" || error.code === "ESOCKET" || error.code === "ECONNECTION" || (error.message && (error.message.includes("timed out") || error.message.includes("timeout")));
    const isAuthError =
      error.code === "EAUTH" || error.responseCode === 535 || (error.message && error.message.toLowerCase().includes("authentication"));
    const isInvalidRecipient =
      error.code === "EINVALIDRECIPIENT" || (error.message && error.message.toLowerCase().includes("recipient"));

    const statusCode = isInvalidRecipient ? 400 : isConfigError ? 503 : isTimeout ? 504 : isAuthError ? 502 : 500;

    let userMessage;
    if (isInvalidRecipient) {
      userMessage = error.message || "Please provide a valid recipient email address.";
    } else if (isConfigError) {
      userMessage = `SMTP configuration is missing or incomplete: ${error.message}`;
    } else if (isTimeout) {
      userMessage = "SMTP connection timed out. Please check your SMTP host, port, and server connectivity. If running on Render, ensure your email provider allows cloud server IPs (Gmail blocks cloud IPs; use Brevo, SendGrid, Mailgun, or Resend SMTP instead).";
    } else if (isAuthError) {
      userMessage = "SMTP authentication failed. Please verify your SMTP username and password/key.";
    } else {
      userMessage = `Failed to send invoice email: ${error.message || "Unknown error"}. Please try again.`;
    }

    return res.status(statusCode).json({
      success: false,
      message: userMessage,
      detail: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// @desc    Send invoice via SMS
// @route   POST /api/invoices/send-sms
// @access  Private (Staff roles)
const sendInvoiceSMS = async (req, res) => {
  try {
    const { sendSMS } = require("../utils/smsService");
    const { recipientPhone, invoiceData } = req.body;

    if (!recipientPhone || String(recipientPhone).trim().length < 8) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid recipient phone number.",
      });
    }

    if (!invoiceData || !invoiceData.invoiceNumber) {
      return res.status(400).json({
        success: false,
        message: "Invoice data is required.",
      });
    }

    const storeName = invoiceData?.business?.name || process.env.SMTP_FROM_NAME || "Invoice";
    const total = invoiceData.totalAmount || invoiceData.subtotal || 0;
    const formattedTotal = total.toLocaleString("en-IN", { minimumFractionDigits: 2 });
    const orderId = invoiceData.orderId || invoiceData.invoiceNumber || "N/A";
    const invoiceNumber = invoiceData.invoiceNumber || "N/A";

    let message = `Thank you for shopping with ${storeName}!\n\n`;
    message += `Invoice No: ${invoiceNumber}\n`;
    message += `Order ID: ${orderId}\n`;
    message += `Grand Total: ₹${formattedTotal}\n`;

    const frontendUrl = process.env.FRONTEND_URL;
    if (frontendUrl && orderId !== "N/A") {
      message += `View Invoice: ${frontendUrl}/super-admin/invoice/${orderId}\n`;
    } else {
      // short summary
      const itemsSummary = (invoiceData.items || [])
        .map(item => `${item.name} x${item.quantity}`)
        .join(", ");
      if (itemsSummary) {
        message += `Items: ${itemsSummary.substring(0, 100)}${itemsSummary.length > 100 ? '...' : ''}\n`;
      }
    }

    const result = await sendSMS(recipientPhone, message, { orderId });

    return res.json({
      success: true,
      message: "Invoice SMS sent successfully.",
      provider: result.provider,
    });
  } catch (error) {
    console.error("[invoiceController] sendInvoiceSMS error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to send invoice SMS.",
    });
  }
};

// @desc    Delete invoice
// @route   DELETE /api/invoices/:id
// @access  Private (SuperAdmin/Admin/Client with ownership)
const deleteInvoice = async (req, res) => {
  try {
    const id = req.params.id;
    const role = req.user?.role || req.user?.userRole || req.user?.accountType;
    const isSuperAdmin = ["superadmin", "super_admin"].includes(String(role).toLowerCase());
    const isAdmin = ["admin"].includes(String(role).toLowerCase());
    const isClient = ["client", "store_manager", "client_admin"].includes(String(role).toLowerCase());

    if (!isSuperAdmin && !isAdmin && !isClient) {
      return res.status(403).json({ success: false, message: "Access denied. Only admins can delete invoices." });
    }

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid invoice ID format." });
    }

    // 1. Try to find and delete as a real Invoice record
    const invoice = await Invoice.findById(id);
    if (invoice) {
      // Client-scoped roles must own this invoice
      if (isClient) {
        const userClientId = String(req.user?.clientId || req.clientId || '');
        const invoiceClientId = invoice.clientId ? String(invoice.clientId) : '';
        if (!userClientId || !invoiceClientId || userClientId !== invoiceClientId) {
          return res.status(403).json({ success: false, message: "Access denied. You can only delete your own invoices." });
        }
      }

      const orderIdString = invoice.orderId;
      await Invoice.findByIdAndDelete(id);

      // Also delete the corresponding Order to prevent re-derivation in getInvoices
      await Order.findOneAndDelete({ orderId: orderIdString });

      console.log(`[invoiceController] deleteInvoice - Invoice ${id} deleted by ${req.user?.email} (${role})`);
      return res.json({ success: true, message: "Invoice and related order deleted successfully" });
    }

    // 2. If not found as an Invoice, it might be a derived invoice where ID is the Order _id
    const order = await Order.findById(id);
    if (order) {
      // Client-scoped roles must own this order
      if (isClient) {
        const userClientId = String(req.user?.clientId || req.clientId || '');
        const orderClientId = order.clientId ? String(order.clientId) : '';
        if (!userClientId || !orderClientId || userClientId !== orderClientId) {
          return res.status(403).json({ success: false, message: "Access denied. You can only delete your own invoices." });
        }
      }

      await Order.findByIdAndDelete(id);
      // Also try to delete any Invoice record that might exist for this orderId string
      await Invoice.findOneAndDelete({ orderId: order.orderId });

      console.log(`[invoiceController] deleteInvoice - Derived invoice (order ${id}) deleted by ${req.user?.email} (${role})`);
      return res.json({ success: true, message: "Invoice (derived from order) deleted successfully" });
    }

    return res.status(404).json({ success: false, message: "Invoice not found" });
  } catch (error) {
    console.error("[invoiceController] deleteInvoice error:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getInvoices,
  getInvoiceById,
  sendInvoiceEmail,
  sendInvoiceSMS,
  deleteInvoice,
};

