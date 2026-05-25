const Contact = require("../models/Contact");
const { validationResult } = require("express-validator");
const { isValidObjectId } = require("../utils/tenantResolver");

// @desc    Submit contact form
// @route   POST /api/contact
// @access  Public
const submitContact = async (req, res) => {
  console.log("[Backend Debug] POST /api/contact - Body:", req.body);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log("[Backend Debug] Validation Errors:", errors.array());
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const clientId = req.clientId || req.headers["x-client-id"] || req.body.clientId || null;
    const payload = { ...req.body };
    if (clientId && isValidObjectId(clientId)) {
      payload.clientId = clientId;
    }
    const contact = await Contact.create(payload);
    console.log("[Backend Debug] Contact Request Saved Successfully:", contact._id);
    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: contact,
    });
  } catch (error) {
    console.error("[Backend Debug] Controller Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all contact requests
// @route   GET /api/contact
// @access  Private (Admin/Staff/Client)
const getContacts = async (req, res) => {
  try {
    const contacts = await Contact.find({}).sort("-createdAt");
    console.log(
      `[contactController] getContacts - role=${req.user?.role || "unknown"} count=${contacts.length}`
    );
    res.json({
      success: true,
      data: contacts,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single contact request
// @route   GET /api/contact/:id
// @access  Private (Admin/Staff/Client)
const getContactById = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: "Contact request not found (Invalid ID)" });
    }
    const contact = await Contact.findById(req.params.id);
    if (contact) {
      res.json({ success: true, data: contact });
    } else {
      res.status(404).json({ success: false, message: "Contact request not found" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update contact status
// @route   PATCH /api/contact/:id/status
// @access  Private (Admin/Staff/Client)
const updateContactStatus = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: "Contact request not found (Invalid ID)" });
    }
    const contact = await Contact.findById(req.params.id);
    if (contact) {
      contact.status = req.body.status || contact.status;
      const updatedContact = await contact.save();
      res.json({
        success: true,
        message: "Status updated successfully",
        data: updatedContact,
      });
    } else {
      res.status(404).json({ success: false, message: "Contact request not found" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete contact request
// @route   DELETE /api/contact/:id
// @access  Private (Admin/Staff/Client)
const deleteContact = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: "Contact request not found (Invalid ID)" });
    }
    const contact = await Contact.findByIdAndDelete(req.params.id);
    if (contact) {
      console.log(`[contactController] deleteContact - ${req.params.id} deleted by ${req.user?.email} (${req.user?.role})`);
      res.json({ success: true, message: "Contact entry removed safely" });
    } else {
      res.status(404).json({ success: false, message: "Contact request not found" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  submitContact,
  getContacts,
  getContactById,
  updateContactStatus,
  deleteContact,
};
