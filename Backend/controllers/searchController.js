const Client = require("../models/Client");
const User = require("../models/User");
const Invoice = require("../models/Invoice");
const Quote = require("../models/Quote");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Contact = require("../models/Contact");

// @desc    Global search across multiple entities
// @route   GET /api/search
// @access  Private
const globalSearch = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim() === "") {
      return res.json({ success: true, data: [] });
    }

    const query = q.trim();
    const regex = new RegExp(query, "i");
    
    const isSuperAdmin = req.user?.role === "super_admin";
    
    // Attempt to get client ID for scoping if not super admin
    const clientId = req.user?.clientId || req.user?.linkedClientId || req.user?.storeId || req.user?.tenantId || req.user?._id;

    // Filters based on role
    const clientFilter = isSuperAdmin ? {} : { clientId };
    const userFilter = isSuperAdmin ? {} : { $or: [{ clientId }, { storeId: clientId }] };
    
    const limit = 5;
    const results = [];

    // 1. Clients
    if (isSuperAdmin) {
      const clients = await Client.find({
        $or: [{ name: regex }, { email: regex }, { companyName: regex }]
      }).limit(limit).lean();
      clients.forEach(c => results.push({ type: "Client", id: c._id, name: c.companyName || c.name, secondary: c.email }));
    }

    // 2. Users / Staff (also covers Customers if they are users)
    const users = await User.find({
      ...userFilter,
      $or: [{ name: regex }, { email: regex }]
    }).limit(limit).lean();
    users.forEach(u => results.push({ type: "User", id: u._id, name: u.name, secondary: u.email || u.role }));

    // 3. Invoices
    const invoices = await Invoice.find({
      ...clientFilter,
      $or: [{ invoiceNumber: regex }]
    }).limit(limit).lean();
    invoices.forEach(i => results.push({ type: "Invoice", id: i._id, name: i.invoiceNumber, secondary: `Total: ${i.totalAmount}` }));

    // 4. Quotations
    const quotes = await Quote.find({
      ...clientFilter,
      $or: [{ quoteNumber: regex }, { reference: regex }]
    }).limit(limit).lean();
    quotes.forEach(q => results.push({ type: "Quotation", id: q._id, name: q.quoteNumber, secondary: q.reference || `Amount: ${q.totalAmount}` }));

    // 5. Products
    const products = await Product.find({
      ...clientFilter,
      $or: [{ name: regex }, { sku: regex }]
    }).limit(limit).lean();
    products.forEach(p => results.push({ type: "Product", id: p._id, name: p.name, secondary: p.sku ? `SKU: ${p.sku}` : '' }));

    // 6. Orders
    // Check if customerName or customerEmail exists on Order or if it's nested
    const orders = await Order.find({
      ...clientFilter,
      $or: [
        { orderId: regex }, 
        { "customer.name": regex }, 
        { "customer.email": regex },
        { customerName: regex },
        { customerEmail: regex }
      ]
    }).limit(limit).lean();
    orders.forEach(o => results.push({ type: "Order", id: o._id, name: o.orderId || o._id.toString(), secondary: o.customerName || o.customer?.name || o.customerEmail || o.customer?.email }));

    // 7. Contacts / Leads (Contact forms)
    const contacts = await Contact.find({
      $or: [{ name: regex }, { email: regex }, { subject: regex }]
    }).limit(limit).lean();
    contacts.forEach(c => results.push({ type: "Lead", id: c._id, name: c.name, secondary: c.email || c.subject }));

    res.json({ success: true, data: results });
  } catch (error) {
    console.error("[globalSearch] Error:", error);
    res.status(500).json({ success: false, message: "Server error during global search" });
  }
};

module.exports = { globalSearch };
