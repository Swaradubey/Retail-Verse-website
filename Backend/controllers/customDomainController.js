const CustomDomain = require("../models/CustomDomain");
const Client = require("../models/Client");
const vercelService = require("../services/vercelService");
const { isValidObjectId } = require("../utils/tenantResolver");
const dns = require("dns").promises;

// @desc    Resolve a custom domain
// @route   GET /api/custom-domains/resolve
// @access  Public
const resolveDomain = async (req, res) => {
  try {
    const { domain } = req.query;

    if (!domain) {
      return res.status(400).json({ success: false, message: "Domain query parameter is required" });
    }

    console.log("[Backend] Incoming domain resolution request for:", domain);

    // Normalize domain: remove protocol, trailing slash, and www.
    let normalizedDomain = domain.toLowerCase().trim();
    normalizedDomain = normalizedDomain.replace(/^https?:\/\//, ""); // Remove http:// or https://
    normalizedDomain = normalizedDomain.replace(/\/$/, ""); // Remove trailing slash
    normalizedDomain = normalizedDomain.replace(/^www\./, ""); // Remove www.

    console.log("[Backend] Normalized domain for lookup:", normalizedDomain);

    const customDomain = await CustomDomain.findOne({
      $or: [
        { domainName: normalizedDomain },
        { domainName: `www.${normalizedDomain}` },
        { domain: normalizedDomain },
        { domain: `www.${normalizedDomain}` }
      ]
    }).populate("clientId");

    if (!customDomain) {
      console.log(`[Backend] Domain not found for: ${normalizedDomain}`);
      return res.status(404).json({ success: false, message: "Custom domain not found" });
    }

    console.log(`[Backend] Matched domain record:`, customDomain.domainName);

    res.status(200).json({
      success: true,
      data: {
        domain: customDomain,
        client: customDomain.clientId
      }
    });
  } catch (error) {
    console.error("[Backend] Error resolving domain:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all custom domains
// @route   GET /api/custom-domains
// @access  Private (Super Admin)
const getAllCustomDomains = async (req, res) => {
  try {
    const isSuperAdmin = req.user && (req.user.role === "super_admin" || req.user.role === "admin");
    const isClient = req.user && (req.user.role === "client" || req.user.role === "client_admin");
    const userClientId = req.user?.clientId;
    const resolvedClientId = req.clientId;
    
    // Determine the effective clientId to filter by
    let clientId = isSuperAdmin ? null : (userClientId || resolvedClientId);

    // Requirement 10 & 16: Log data retrieval details
    console.log(`[customDomain] getAllCustomDomains - Page: Custom Domains, Role: ${req.user?.role}, UserClientId: ${userClientId}, ResolvedClientId: ${resolvedClientId}`);

    const query = isSuperAdmin ? {} : { clientId };
    console.log("-----------------------------------------");
    console.log("role:", req.user?.role, "clientId:", clientId, "query:", JSON.stringify(query));
    console.log("-----------------------------------------");
    const domains = await CustomDomain.find(query).sort({ createdAt: -1 });

    // Requirement 16: Log DB query details
    console.log(`[customDomain] DB Query - Collection: customdomains, Filter: ${JSON.stringify(query)}, Count: ${domains.length}`);

    res.status(200).json({ success: true, count: domains.length, data: domains });
  } catch (error) {
    console.error("[customDomain] getAllCustomDomains error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create a custom domain
// @route   POST /api/custom-domains
// @access  Private (Super Admin)
const createCustomDomain = async (req, res) => {
  try {
    let { domainName, clientId } = req.body;

    if (!domainName || domainName.trim() === "") {
      return res.status(400).json({ message: "Domain name is required" });
    }

    const isSuperAdmin = req.user && (req.user.role === "super_admin" || req.user.role === "admin");
    const isClient = req.user && (req.user.role === "client" || req.user.role === "client_admin");

    // If client, enforce their own clientId
    if (isClient) {
      clientId = req.user.clientId;
    }

    // Fallback: If clientId is still not populated, look up client by userId / email
    if (!clientId && req.user?._id) {
      const foundClient = await Client.findOne({
        $or: [{ userId: req.user._id }, { email: req.user.email }]
      });
      if (foundClient) {
        clientId = foundClient._id;
      }
    }

    // Fallback for Super Admin if no clientId was provided: link to default first client
    if (!clientId && isSuperAdmin) {
      const firstClient = await Client.findOne({}).sort({ createdAt: 1 });
      if (firstClient) {
        clientId = firstClient._id;
      }
    }

    if (!clientId) {
      return res.status(400).json({ message: "Client ID is required to link domain" });
    }

    console.log("Incoming domain:", domainName);

    let formattedDomain = domainName.trim().toLowerCase();
    formattedDomain = formattedDomain.replace(/^https?:\/\//, ""); // Remove http:// or https://
    formattedDomain = formattedDomain.replace(/\/$/, ""); // Remove trailing slash
    formattedDomain = formattedDomain.replace(/^www\./, ""); // Remove www. prefix for root record
    
    console.log("Normalized incoming domain:", formattedDomain);

    // Fetch client to get name
    const client = await Client.findById(clientId);
    const clientName = client ? (client.companyName || client.shopName || "Client") : "Client";

    let successMessage = "Custom domain created successfully";

    // Optional Vercel sync (only if configured; never crash or block on VPS)
    if (vercelService.isConfigured && vercelService.isConfigured()) {
      try {
        await vercelService.addDomain(formattedDomain);
        successMessage = "Custom domain created successfully and synced to Vercel";
      } catch (vercelError) {
        const errorMsg = vercelError.message || "";
        if (
          errorMsg.includes("already in use") || 
          errorMsg.includes("already_exists") || 
          errorMsg.includes("already exists")
        ) {
          console.log(`[Vercel] Domain ${formattedDomain} already exists in Vercel.`);
        } else {
          console.warn(`[Vercel Warning] Could not sync domain to Vercel: ${errorMsg}. Proceeding with VPS registration.`);
        }
      }
    } else {
      console.log(`[VPS Mode] Domain ${formattedDomain} registered directly on VPS.`);
    }

    // DNS Instructions: use configured VPS/Server IP if available
    const serverIp = process.env.SERVER_IP || process.env.VPS_IP || process.env.HOST_IP || "76.76.21.21";
    const dnsInstructions = {
      root: { type: "A", name: "@", value: serverIp },
      subdomain: { type: "CNAME", name: "www", value: formattedDomain }
    };

    // Check if domain exists in DB
    let customDomain = await CustomDomain.findOne({ 
      $or: [
        { domainName: formattedDomain },
        { domainName: `www.${formattedDomain}` },
        { domain: formattedDomain },
        { domain: `www.${formattedDomain}` }
      ] 
    });

    if (customDomain) {
      customDomain.clientId = clientId;
      customDomain.clientName = clientName;
      customDomain.dnsInstructions = dnsInstructions;
      customDomain.status = "Pending";
      customDomain.sslStatus = "Pending";
      await customDomain.save();
      return res.status(200).json({ success: true, data: customDomain, message: successMessage });
    } else {
      customDomain = await CustomDomain.create({
        domainName: formattedDomain,
        domain: formattedDomain,
        clientId,
        clientName,
        status: "Pending",
        sslStatus: "Pending",
        dnsInstructions
      });
      return res.status(201).json({ success: true, data: customDomain, message: successMessage });
    }

  } catch (error) {
    console.error("Error in createCustomDomain:", error);
    if (error.code === 11000) {
      return res.status(400).json({ message: "Domain already exists in the system" });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

const checkDomainStatus = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: "Custom domain not found (Invalid ID)" });
    }
    const customDomain = await CustomDomain.findById(req.params.id);

    if (!customDomain) {
      return res.status(404).json({ success: false, message: "Custom domain not found" });
    }

    // Ownership check for clients
    const isSuperAdmin = req.user && (req.user.role === "super_admin" || req.user.role === "admin");
    if (!isSuperAdmin && String(customDomain.clientId) !== String(req.user?.clientId)) {
      return res.status(403).json({ success: false, message: "You are not allowed to access this domain" });
    }

    let status = customDomain.status || "Pending";
    let sslStatus = customDomain.sslStatus || "Pending";
    let message = "Domain is configured.";

    // 1. If Vercel is configured, check Vercel status first
    if (vercelService.isConfigured && vercelService.isConfigured()) {
      try {
        const vStatus = await vercelService.checkDomainStatus(customDomain.domainName);
        if (vStatus && vStatus.status) {
          status = vStatus.status;
          sslStatus = vStatus.status === 'Verified' ? 'Active' : (vStatus.status === 'Error' ? 'Error' : 'Pending');
          message = vStatus.message || message;
        }
      } catch (err) {
        console.warn("[Vercel status check error, falling back to DNS lookup]:", err.message);
      }
    }

    // 2. Fallback / VPS DNS verification using Node's dns resolver
    if (status !== "Verified") {
      try {
        const expectedIp = process.env.SERVER_IP || process.env.VPS_IP;
        const addresses = await dns.resolve4(customDomain.domainName);
        console.log(`[DNS Check] Resolved IP for ${customDomain.domainName}:`, addresses);
        
        if (addresses && addresses.length > 0) {
          if (expectedIp) {
            if (addresses.includes(expectedIp)) {
              status = "Verified";
              sslStatus = "Active";
              message = `Domain verified pointing to VPS IP (${expectedIp})`;
            } else {
              message = `Domain resolves to ${addresses.join(', ')}. Please update A record to point to ${expectedIp}`;
            }
          } else {
            status = "Verified";
            sslStatus = "Active";
            message = `Domain DNS active (resolving to ${addresses[0]})`;
          }
        }
      } catch (dnsErr) {
        console.log(`[DNS Check] DNS not detected yet for ${customDomain.domainName}:`, dnsErr.code);
        status = "Pending";
        sslStatus = "Pending";
        message = "DNS records not yet detected. Please check your domain DNS settings.";
      }
    }
    
    customDomain.status = status;
    customDomain.sslStatus = sslStatus;
    await customDomain.save();

    res.status(200).json({ 
      success: true, 
      status: customDomain.status, 
      sslStatus: customDomain.sslStatus,
      message,
      data: customDomain 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteCustomDomain = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: "Custom domain not found (Invalid ID)" });
    }
    const customDomain = await CustomDomain.findById(req.params.id);

    if (!customDomain) {
      return res.status(404).json({ success: false, message: "Custom domain not found" });
    }

    // Ownership check for clients
    const isSuperAdmin = req.user && (req.user.role === "super_admin" || req.user.role === "admin");
    if (!isSuperAdmin && String(customDomain.clientId) !== String(req.user?.clientId)) {
      return res.status(403).json({ success: false, message: "You are not allowed to delete this domain" });
    }

    // Remove from Vercel if configured
    if (vercelService.isConfigured && vercelService.isConfigured()) {
      try {
        await vercelService.removeDomain(customDomain.domainName);
      } catch (vercelError) {
        console.warn("Could not remove domain from Vercel (continuing):", vercelError.message);
      }
    }

    await customDomain.deleteOne();

    res.status(200).json({ success: true, message: "Custom domain removed" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getAllCustomDomains,
  createCustomDomain,
  checkDomainStatus,
  deleteCustomDomain,
  resolveDomain,
};
