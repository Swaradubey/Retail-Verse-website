const crypto = require("crypto");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Product = require("../models/Product");
const User = require("../models/User");
const TrackOrder = require("../models/TrackOrder");
const Invoice = require("../models/Invoice");
const shiprocketService = require("../services/shiprocketService");
const { 
  resolveClientId, 
  buildScopeQuery, 
  applyScope 
} = require("../utils/tenantResolver");
const Client = require("../models/Client");
const { normalizeRole } = require("../utils/clientScopedRoles");

const isValidObjectId = (id) => {
  if (id === null || id === undefined) return false;
  const s = String(id).trim();
  if (!s || s === "null" || s === "undefined" || s === "all" || s === "super_admin" || s === "admin") return false;
  return mongoose.Types.ObjectId.isValid(s);
};

/** Standard stages (1–6) for timeline UI */
const TRACKING_STAGE_LABELS = [
  "Order Placed",
  "Confirmed",
  "Packed",
  "Shipped",
  "Out for Delivery",
  "Delivered",
];

function generateTrackingId() {
  return `TRK-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function buildInitialTracking() {
  const now = new Date();
  const estimatedDelivery = new Date(now);
  estimatedDelivery.setDate(estimatedDelivery.getDate() + 7);
  return {
    trackingId: generateTrackingId(),
    orderStatus: "placed",
    trackingStatus: "Order Placed",
    currentStage: 1,
    estimatedDelivery,
    trackingHistory: [
      {
        stage: 1,
        label: "Order Placed",
        message: "We received your order.",
        at: now,
      },
    ],
  };
}

/**
 * Merge safe defaults for legacy orders and attach timeline + display ids for API consumers.
 */
function enrichOrderTracking(order) {
  const o = order.toObject ? order.toObject() : { ...order };
  const statusLowerEarly = String(o.orderStatus || "").toLowerCase();
  if (statusLowerEarly === "cancelled") {
    const effectiveTrackingId =
      o.trackingId && String(o.trackingId).trim() ? String(o.trackingId).trim() : o.orderId;
    const stagesCancelled = TRACKING_STAGE_LABELS.map((label, i) => ({
      step: i + 1,
      label,
      status: "pending",
    }));
    let stageSnap =
      typeof o.currentStage === "number" && o.currentStage >= 1 && o.currentStage <= 6
        ? o.currentStage
        : 1;
    if (o.isDelivered) stageSnap = 6;
    return {
      ...o,
      effectiveTrackingId,
      trackingStatusResolved: "Cancelled",
      orderStatusResolved: "cancelled",
      currentStageResolved: stageSnap,
      stages: stagesCancelled,
      isCancelled: true,
      estimatedDelivery: o.estimatedDelivery || null,
    };
  }
  let stage =
    typeof o.currentStage === "number" && o.currentStage >= 1 && o.currentStage <= 6
      ? o.currentStage
      : 1;
  if (o.isDelivered) {
    stage = 6;
  }
  const effectiveTrackingId =
    o.trackingId && String(o.trackingId).trim() ? String(o.trackingId).trim() : o.orderId;

  const trackingStatusResolved =
    o.trackingStatus ||
    (o.isDelivered ? "Delivered" : "Processing");

  const orderStatusResolved =
    o.orderStatus ||
    (o.isDelivered ? "delivered" : "placed");

  if (!Array.isArray(o.trackingHistory) || o.trackingHistory.length === 0) {
    o.trackingHistory = [
      {
        stage: 1,
        label: "Order Placed",
        message: "Order on file (legacy record).",
        at: o.createdAt || new Date(),
      },
    ];
  }

  const currentStageResolved = o.isDelivered ? 6 : Math.min(6, Math.max(1, stage));

  const stages = TRACKING_STAGE_LABELS.map((label, i) => {
    const step = i + 1;
    let status;
    if (o.isDelivered) {
      status = "complete";
    } else if (step < currentStageResolved) {
      status = "complete";
    } else if (step === currentStageResolved) {
      status = "current";
    } else {
      status = "pending";
    }
    return { step, label, status };
  });

  return {
    ...o,
    effectiveTrackingId,
    trackingStatusResolved,
    orderStatusResolved,
    currentStageResolved,
    stages,
    estimatedDelivery: o.estimatedDelivery || null,
  };
}

/**
 * Enrich API response with live Shiprocket courier data when `awbCode` exists.
 * Persists a snapshot on successful sync (courier fields + lastTrackingSyncAt).
 */
async function attachLiveShiprocket(order) {
  const base = enrichOrderTracking(order);

  if (base.isCancelled) {
    return {
      ...base,
      shiprocket: {
        syncStatus: "not_applicable",
        message: "Courier tracking is not shown for cancelled orders.",
      },
    };
  }

  if (!shiprocketService.isShiprocketConfigured()) {
    const diag = shiprocketService.getShiprocketEnvDiagnostics();
    console.warn(
      `[Shiprocket] Tracking unavailable — missing: ${diag.missingAuthEnv.join(", ") || "(none)"}. Set credentials in Backend/.env and restart.`
    );
    return {
      ...base,
      shiprocket: {
        syncStatus: "not_configured",
        message:
          "Live courier tracking is not configured on the server. Add SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD to the backend environment and restart. Your order status below reflects our store records.",
      },
    };
  }

  let awbRaw = order.awbCode != null && String(order.awbCode).trim() ? String(order.awbCode).trim() : "";
  const hasSrIds =
    (order.shiprocketShipmentId != null && String(order.shiprocketShipmentId).trim()) ||
    (order.shiprocketOrderId != null && String(order.shiprocketOrderId).trim());

  if (awbRaw && !shiprocketService.isCourierTrackableAwb(awbRaw, order)) {
    console.warn(
      `[Shiprocket] DB awbCode is not a courier AWB (ignoring for track API) — orderId=${order.orderId} had suffix …${awbRaw.slice(-4)} (e.g. internal TRK id or order id)`
    );
    awbRaw = "";
  }

  if (!awbRaw && hasSrIds && shiprocketService.isShiprocketConfigured() && typeof order.save === "function") {
    const refreshed = await shiprocketService.tryRefreshAwbFromShiprocket(order);
    if (refreshed && refreshed.awbCode) {
      const cand = String(refreshed.awbCode).trim();
      if (!shiprocketService.isCourierTrackableAwb(cand, order)) {
        console.warn(
          `[Shiprocket] orders/show returned non-AWB value; not persisting — orderId=${order.orderId}`
        );
      } else {
        order.awbCode = cand;
        if (refreshed.courierName) {
          order.courierName = refreshed.courierName;
          if (!order.shipmentCarrier) order.shipmentCarrier = refreshed.courierName;
        }
        try {
          await order.save();
          awbRaw = cand;
          console.log(
            `[Shiprocket] MongoDB update after AWB refresh — orderId=${order.orderId} awb ending …${awbRaw.slice(-4)}`
          );
          console.log(`[Shiprocket] awbCode saved to DB — orderId=${order.orderId} suffix=…${awbRaw.slice(-4)}`);
        } catch (persistErr) {
          console.warn("[Shiprocket] Could not persist AWB from orders/show:", persistErr.message || persistErr);
          awbRaw = cand;
        }
      }
    }
  }

  if (!awbRaw && !hasSrIds && !base.isCancelled && shiprocketService.isShiprocketConfigured()) {
    // Determine if this is a POS order (POS skips auto-shipment)
    const orderIdStr = order.orderId ? String(order.orderId).trim() : "";
    const isPosOrder = order.orderSource === "pos" || /^ORD-POS-/i.test(orderIdStr);

    if (!isPosOrder) {
      console.log(`[Shiprocket] Auto-reconcile — attempting to create missing shipment for orderId=${order.orderId}`);
      try {
        const sr = await shiprocketService.createAdhocShipmentFromOrder(order);
        if (sr && !sr.duplicateSkipped && (sr.awbCode || sr.shiprocketShipmentId || sr.shiprocketOrderId)) {
          if (sr.awbCode) {
            order.awbCode = sr.awbCode;
            awbRaw = sr.awbCode;
          }
          if (sr.courierName) {
            order.courierName = sr.courierName;
            order.shipmentCarrier = sr.courierName;
          }
          if (sr.shiprocketShipmentId) order.shiprocketShipmentId = sr.shiprocketShipmentId;
          if (sr.shiprocketOrderId) order.shiprocketOrderId = sr.shiprocketOrderId;
          if (sr.trackingUrl) order.trackingUrl = sr.trackingUrl;
          if (sr.trackingStatus) order.trackingStatus = sr.trackingStatus;
          if (sr.shipmentResponse) order.shiprocketRawResponse = sr.shipmentResponse;
          order.shipmentCreateError = sr.awbAssignErrorMessage || undefined;
          await order.save();
          console.log(`[Shiprocket] Auto-reconcile succeeded — orderId=${order.orderId} awb=${order.awbCode || "pending"}`);
          // Update hasSrIds for subsequent logic in this function
          // (not strictly needed as we check awbRaw again, but good for clarity)
        }
      } catch (reconErr) {
        console.warn(`[Shiprocket] Auto-reconcile failed for orderId=${order.orderId}:`, reconErr.message || reconErr);
        // Persist the validation/creation error so it shows up in the UI
        try {
          order.shipmentCreateError = String(reconErr.message || "Shipment creation failed").slice(0, 2000);
          await order.save();
        } catch (saveErr) {
          console.error(`[Shiprocket] Could not save auto-reconcile error for orderId=${order.orderId}:`, saveErr.message);
        }
      }
    }
  }

  if (!awbRaw) {
    if (hasSrIds || (order.shiprocketShipmentId || order.shiprocketOrderId)) {
      const srHint = order.shipmentCreateError && String(order.shipmentCreateError).trim();
      console.log(
        `[Shiprocket] Tracking fetch skipped (no usable AWB yet) — orderId=${order.orderId} shiprocketOrderId=${order.shiprocketOrderId || "—"} shiprocketShipmentId=${order.shiprocketShipmentId || "—"}${srHint ? ` note=${srHint.slice(0, 120)}` : ""}`
      );
      return {
        ...base,
        shiprocket: {
          syncStatus: "pending_awb",
          message: srHint
            ? `Shipment is booked with Shiprocket but there is no courier AWB yet. ${srHint}`
            : "Shipment is booked with Shiprocket but a courier AWB is not assigned yet. Refresh after some time.",
          shiprocketOrderId: order.shiprocketOrderId || null,
          shiprocketShipmentId: order.shiprocketShipmentId || null,
          trackingUrl: order.trackingUrl || null,
          courierName: order.courierName || order.shipmentCarrier || null,
          shipmentCreateError: srHint || null,
        },
      };
    }
    return {
      ...base,
      shiprocket: {
        syncStatus: "no_shipment",
        message: order.shipmentCreateError
          ? `Could not create Shiprocket shipment: ${order.shipmentCreateError}`
          : "No courier shipment (AWB) is linked yet. Tracking will appear after the order is shipped and booked with Shiprocket.",
      },
    };
  }

  try {
    console.log(
      `[Shiprocket] attachLiveShiprocket — calling courier track with DB awbCode suffix=…${awbRaw.slice(-4)} orderId=${order.orderId}`
    );
    const result = await shiprocketService.trackByAwb(awbRaw);
    if (result.notFound || !result.ok) {
      console.warn(
        `[Shiprocket] Courier track finished without data — orderId=${order.orderId} awb suffix=…${awbRaw.slice(-4)} notFound=${!!result.notFound} ok=${!!result.ok}`
      );
      if (result.notFound) {
        return {
          ...base,
          shiprocket: {
            syncStatus: "courier_track_not_found",
            message:
              "Shiprocket courier tracking has no scan data for this AWB yet. If the label was just generated, try again later.",
            awbCode: awbRaw,
            shiprocketOrderId: order.shiprocketOrderId || null,
            shiprocketShipmentId: order.shiprocketShipmentId || null,
          },
        };
      }
      const pendingMsg = "Shipment created but AWB is not assigned yet.";
      const softMsg =
        "Live courier tracking is not available yet. Please refresh in a few minutes.";
      return {
        ...base,
        shiprocket: {
          syncStatus: hasSrIds ? "pending_awb" : "not_found",
          message: hasSrIds ? pendingMsg : softMsg,
          awbCode: awbRaw,
          shiprocketOrderId: order.shiprocketOrderId || null,
          shiprocketShipmentId: order.shiprocketShipmentId || null,
        },
      };
    }

    console.log(
      `[Shiprocket] Tracking fetch ok — orderId=${order.orderId} awb ending …${awbRaw.slice(-4)}`
    );

    const normalized = shiprocketService.normalizeTrackingPayload(result.json);
    const layout = shiprocketService.buildStagesFromNormalized(normalized);

    let stages = base.stages;
    let trackingStatusResolved = base.trackingStatusResolved;
    let currentStageResolved = base.currentStageResolved;

    if (layout.isCancelledCourier) {
      stages = layout.stages;
      trackingStatusResolved = layout.trackingStatusResolved;
      currentStageResolved = layout.currentStageResolved;
    } else if (normalized.scanEvents.length > 0 || normalized.shipmentStatus) {
      stages = layout.stages;
      trackingStatusResolved = layout.trackingStatusResolved;
      currentStageResolved = layout.currentStageResolved;
    }

    const trackingHistoryFromCourier = normalized.scanEvents.map((e) => ({
      stage: null,
      label: e.label,
      message: e.message,
      at: e.at,
    }));

    const trackingHistoryOut =
      trackingHistoryFromCourier.length > 0 ? trackingHistoryFromCourier : base.trackingHistory;

    const timelineSnapshot = trackingHistoryFromCourier.slice(0, 40).map((e) => ({
      label: e.label,
      message: e.message,
      at: new Date(e.at),
    }));

    const courierEdd =
      normalized.estimatedDeliveryIso && String(normalized.estimatedDeliveryIso).trim()
        ? normalized.estimatedDeliveryIso
        : null;
    const estimatedDeliveryMerged =
      courierEdd ||
      (base.estimatedDelivery != null
        ? base.estimatedDelivery instanceof Date
          ? base.estimatedDelivery.toISOString()
          : String(base.estimatedDelivery)
        : null);

    if (order.save && typeof order.save === "function") {
      try {
        if (normalized.courierName) order.courierName = normalized.courierName;
        if (normalized.trackingUrl) order.trackingUrl = normalized.trackingUrl;
        if (normalized.awbCode && shiprocketService.isCourierTrackableAwb(normalized.awbCode, order)) {
          order.awbCode = normalized.awbCode;
        }
        if (normalized.courierName && !order.shipmentCarrier) {
          order.shipmentCarrier = normalized.courierName;
        }
        if (courierEdd) {
          const d = new Date(courierEdd);
          if (!Number.isNaN(d.getTime())) order.estimatedDelivery = d;
        }
        if (normalized.shippedAtIso) {
          const d = new Date(normalized.shippedAtIso);
          if (!Number.isNaN(d.getTime())) order.shippedAt = d;
        }
        if (normalized.deliveredAtIso) {
          const d = new Date(normalized.deliveredAtIso);
          if (!Number.isNaN(d.getTime())) {
            order.deliveredAt = d;
            order.isDelivered = true;
          }
        }
        if (currentStageResolved > (order.currentStage || 0)) {
          order.currentStage = currentStageResolved;
          order.trackingStatus = trackingStatusResolved;
          // Sync orderStatus if it matches a standard lifecycle mapping
          const statusMap = {
            2: "confirmed",
            3: "packed",
            4: "shipped",
            5: "out_for_delivery",
            6: "delivered",
          };
          if (statusMap[currentStageResolved]) {
            order.orderStatus = statusMap[currentStageResolved];
            order.status = statusMap[currentStageResolved];
          }
        }
        order.trackingStages = timelineSnapshot;
        order.trackingTimeline = timelineSnapshot;
        order.shipmentResponse = result.json;
        order.lastTrackingSyncAt = new Date();
        await order.save();
      } catch (persistErr) {
        console.error("[Shiprocket] persist snapshot:", persistErr.message || persistErr);
      }
    }

    return {
      ...base,
      estimatedDelivery: estimatedDeliveryMerged,
      stages,
      trackingStatusResolved,
      currentStageResolved,
      trackingHistory: trackingHistoryOut,
      shiprocket: {
        syncStatus: "ok",
        courierName: normalized.courierName || order.courierName || null,
        awbCode: normalized.awbCode || awbRaw,
        trackingUrl: normalized.trackingUrl || order.trackingUrl || null,
        lastTrackingSyncAt: order.lastTrackingSyncAt
          ? new Date(order.lastTrackingSyncAt).toISOString()
          : new Date().toISOString(),
        shipmentStatus: normalized.shipmentStatus || null,
        estimatedDelivery: courierEdd,
      },
    };
  } catch (err) {
    const code = err && err.code ? String(err.code) : "";
    console.error(
      `[Shiprocket] trackByAwb failed awb=${awbRaw} code=${code || "unknown"}:`,
      err.message || err
    );
    return {
      ...base,
      shiprocket: {
        syncStatus: "error",
        message:
          err && err.message
            ? String(err.message)
            : "Could not load live tracking from Shiprocket. Store status is shown below.",
        awbCode: awbRaw,
      },
    };
  }
}

/** Stage used for cancellation eligibility (shipped = stage 4+ blocks user cancel). */
function getStageForCancellationRules(order) {
  if (order.isDelivered) return 6;
  const cs = order.currentStage;
  if (typeof cs === "number" && cs >= 1 && cs <= 6) return cs;
  return 1;
}

function isOrderEligibleForCancellation(order) {
  if (!order || order.isDelivered) return false;
  const st = String(order.orderStatus || "placed").toLowerCase();
  if (st === "cancelled") return false;
  if (st === "delivered" || st === "shipped" || st === "out_for_delivery") return false;
  const stage = getStageForCancellationRules(order);
  if (stage >= 4) return false;
  return true;
}

/** Storefront roles — orders are attributed to these accounts (not staff/admin POS sessions). */
const CUSTOMER_ORDER_ROLES = ["user", "customer"];

function normalizeEmailForOrder(e) {
  if (e == null || typeof e !== "string") return "";
  return String(e).trim().toLowerCase();
}

/** Used when schema needs a shippingAddress object but POS does not collect one */
const DEFAULT_POS_SHIPPING = {
  fullName: "POS Customer",
  address: "In-store purchase",
  city: "N/A",
  state: "N/A",
  zipCode: "000000",
  country: "N/A",
};

/** Whitelist safe payment metadata; strip CVV, full card numbers, and unknown keys */
function sanitizePaymentDetails(details) {
  if (!details || typeof details !== "object") return undefined;
  const out = {};

  const cardName = details.cardholderName ?? details.cardName;
  if (cardName != null && String(cardName).trim()) {
    out.cardName = String(cardName).trim().slice(0, 120);
  }

  const rawLast = details.last4 ?? details.cardLast4;
  if (rawLast != null && String(rawLast).trim()) {
    const digits = String(rawLast).replace(/\D/g, "");
    if (digits.length >= 4) out.cardLast4 = digits.slice(-4);
  }

  if (details.expiryDate != null && String(details.expiryDate).trim()) {
    out.expiryDate = String(details.expiryDate).trim().slice(0, 10);
  }

  if (details.upiId != null && String(details.upiId).trim()) {
    out.upiId = String(details.upiId).trim().slice(0, 100);
  }

  return Object.keys(out).length ? out : undefined;
}

// @desc    Create new order
// @route   POST /api/orders
// @access  Public
const createOrder = async (req, res) => {
  try {
    const clientId = req.user?.clientId || req.clientId || (await resolveClientId(req));
    console.log("-----------------------------------------");
    const payloadKeys =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? Object.keys(req.body)
        : [];
    console.log("[BACKEND] Incoming order payload keys:", payloadKeys.join(", ") || "(none)");
    console.log("[BACKEND] Incoming Order Request Body:", JSON.stringify(req.body, null, 2));

    const {
      items,
      shippingAddress: rawShippingAddress,
      paymentMethod,
      paymentDetails: rawPaymentDetails,
      totalPrice,
      user,
      orderId,
      order_id: orderIdSnake,
      orderSource,
      source,
      orderType,
      channel,
      isPos,
      isPOS,
      offlineOrderId: rawOfflineOrderId,
      customerEmail: rawCustomerEmail,
      customerName: rawCustomerName,
      customerId: rawCustomerId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    } = req.body;

    const offlineOrderIdStr =
      rawOfflineOrderId != null && String(rawOfflineOrderId).trim()
        ? String(rawOfflineOrderId).trim()
        : "";

    if (offlineOrderIdStr) {
      const existingOffline = await Order.findOne({ offlineOrderId: offlineOrderIdStr });
      if (existingOffline) {
        console.log(
          "[BACKEND] Duplicate offlineOrderId; returning existing order:",
          existingOffline.orderId
        );
        return res.status(200).json({
          success: true,
          message: "Order already recorded",
          data: enrichOrderTracking(existingOffline),
        });
      }
    }

    /** True for explicit POS markers (any non-empty string form) or POS order ids (in-store flow). */
    function isPosMarkerValue(v) {
      if (v === true || v === 1) return true;
      if (typeof v === "string") {
        const s = v.trim().toLowerCase();
        return (
          s === "pos" ||
          s === "point-of-sale" ||
          s === "in-store" ||
          s === "in_store" ||
          s === "walk-in"
        );
      }
      return false;
    }

    /** Some clients send "true" / "1" instead of boolean true for isPos */
    function truthyPosFlag(v) {
      if (v === true || v === 1) return true;
      if (typeof v === "string") {
        const s = v.trim().toLowerCase();
        return s === "true" || s === "1" || s === "yes";
      }
      return false;
    }

    const rawOrderId = orderId != null ? orderId : orderIdSnake;
    const orderIdStr = rawOrderId != null ? String(rawOrderId).trim() : "";
    const isPosOrder =
      truthyPosFlag(isPos) ||
      truthyPosFlag(isPOS) ||
      isPosMarkerValue(orderSource) ||
      isPosMarkerValue(source) ||
      isPosMarkerValue(orderType) ||
      isPosMarkerValue(channel) ||
      /^POS-/i.test(orderIdStr) ||
      /^ORD-POS-/i.test(orderIdStr);

    console.log(
      `[BACKEND] Order origin: ${isPosOrder ? "POS (in-store)" : "website / delivery"} (isPos=${JSON.stringify(
        isPos
      )}, orderId prefix: ${orderIdStr ? orderIdStr.slice(0, 12) : "(none)"})`
    );

    const rawShipObj =
      rawShippingAddress != null &&
      typeof rawShippingAddress === "object" &&
      !Array.isArray(rawShippingAddress)
        ? rawShippingAddress
        : {};

    let shippingAddress = isPosOrder
      ? {
          ...DEFAULT_POS_SHIPPING,
          ...rawShipObj,
        }
      : rawShippingAddress;

    // Normalize shipping phone number using the same logic as Shiprocket service
    if (shippingAddress && typeof shippingAddress === "object" && shippingAddress.phone) {
      const country = String(shippingAddress.country || "India").trim();
      const normalizedPhone = shiprocketService.normalizePhoneNumber(shippingAddress.phone, country);
      if (normalizedPhone) {
        console.log(`[BACKEND] Normalizing shipping phone: ${shippingAddress.phone} -> ${normalizedPhone}`);
        shippingAddress.phone = normalizedPhone;
      } else if (!isPosOrder) {
        // For delivery orders, we must have a valid phone number for Shiprocket
        console.warn(`[VALIDATION] Invalid phone number provided: "${shippingAddress.phone}"`);
        return res.status(400).json({
          success: false,
          message: `Invalid phone number format: "${shippingAddress.phone}". A valid 10-digit mobile number is required.`
        });
      }
    } else if (shippingAddress && !isPosOrder) {
      // Phone is missing and it's not a POS order
      console.warn("[VALIDATION] Phone number is required for shipping address");
      return res.status(400).json({
        success: false,
        message: "Phone number is required for shipping address."
      });
    }

    if (isPosOrder && shippingAddress && typeof shippingAddress === "object") {
      const posShipKeys = ["fullName", "address", "city", "state", "zipCode", "country"];
      for (const k of posShipKeys) {
        if (!String(shippingAddress[k] || "").trim()) {
          shippingAddress[k] = DEFAULT_POS_SHIPPING[k];
        }
      }
    }

    console.log("[BACKEND] Extracted items:", items?.length || 0, "items");
    console.log("[BACKEND] Extracted shippingAddress present:", !!shippingAddress);
    if (isPosOrder) {
      console.log(
        "[BACKEND] POS: shipping address validation skipped; using in-store placeholder where needed"
      );
    }
    console.log("[BACKEND] Extracted paymentMethod:", paymentMethod);
    console.log("[BACKEND] Extracted totalPrice:", totalPrice);

    // 1. Validate items
    if (!items || !Array.isArray(items) || items.length === 0) {
      console.warn("[VALIDATION] Order items are required");
      return res.status(400).json({
        success: false,
        message: "Order items are required"
      });
    }

    // 2. Validate shippingAddress (website delivery requires it; POS gets defaults)
    if (!shippingAddress) {
      if (isPosOrder) {
        shippingAddress = { ...DEFAULT_POS_SHIPPING };
        console.log("[BACKEND] POS: applied DEFAULT_POS_SHIPPING (body had no shipping object)");
      } else {
        console.warn("[VALIDATION] Shipping address is required (non-POS order)");
        return res.status(400).json({
          success: false,
          message: "Shipping address is required"
        });
      }
    }

    const { fullName, address, city, state, zipCode, country } = shippingAddress || {};

    if (!isPosOrder) {
      if (!fullName) {
        console.warn("[VALIDATION] Full name is required");
        return res.status(400).json({ success: false, message: "Full name is required" });
      }
      if (!address) {
        console.warn("[VALIDATION] Address is required");
        return res.status(400).json({ success: false, message: "Address is required" });
      }
      if (!city) {
        console.warn("[VALIDATION] City is required");
        return res.status(400).json({ success: false, message: "City is required" });
      }
      if (!state) {
        console.warn("[VALIDATION] State is required");
        return res.status(400).json({ success: false, message: "State is required" });
      }
      if (!zipCode) {
        console.warn("[VALIDATION] ZIP Code is required");
        return res.status(400).json({ success: false, message: "ZIP Code is required" });
      }
      if (!country) {
        console.warn("[VALIDATION] Country is required");
        return res.status(400).json({ success: false, message: "Country is required" });
      }
    }

    const paymentDetails = sanitizePaymentDetails(rawPaymentDetails);

    // 3. Validate paymentMethod
    if (!paymentMethod) {
      console.warn("[VALIDATION] Payment method is required");
      return res.status(400).json({
        success: false,
        message: "Payment method is required"
      });
    }

    // 4. Validate totalPrice
    if (totalPrice === undefined || isNaN(Number(totalPrice))) {
      console.warn("[VALIDATION] Total price must be a valid number:", totalPrice);
      return res.status(400).json({
        success: false,
        message: "Total price must be a valid number"
      });
    }

    // 5. Finalize items and check stock (if product exists in DB)
    const orderItems = [];
    for (const item of items) {
      if (!item.name || item.price === undefined || !item.quantity) {
        console.warn("[VALIDATION] Incomplete item data:", item);
        return res.status(400).json({
          success: false,
          message: "Each item must have a name, price, and quantity"
        });
      }

      const resolvedProductId = item.productId || item._id || item.id || `unknown-${Date.now()}`;

      let itemCategory = item.category || "Uncategorized";

      // 5. Finalize items and check stock (if product exists in DB)
      if (mongoose.Types.ObjectId.isValid(resolvedProductId)) {
        const product = await Product.findById(resolvedProductId);
        
        if (product) {
          if (product.category) {
            itemCategory = product.category;
          }
          const availableStock = Number(product.stock || 0);
          const orderedQty = Number(item.quantity || 0);
          
          console.log(`[STOCK CHECK] Product: ${product.name} (${resolvedProductId}), DB Stock: ${product.stock}, Ordered Qty: ${item.quantity}, Comparison: ${orderedQty} > ${availableStock}`);

          if (availableStock < orderedQty || availableStock <= 0) {
            console.warn(`[VALIDATION] Insufficient stock for ${product.name}. Requested: ${orderedQty}, Available: ${availableStock}`);
            return res.status(400).json({
              success: false,
              message: `Insufficient stock for ${product.name}. Available: ${availableStock}`
            });
          }
        } else {
          console.log(`[STOCK CHECK] Product not found in DB for validation: ${resolvedProductId} (clientId: ${clientId})`);
        }
      }

      const rate = Number(item.gstRate || 0);
      const amt = Number(item.gstAmount) || ((Number(item.price) * Number(item.quantity) * rate) / 100);
      orderItems.push({
        productId: String(resolvedProductId),
        name: item.name,
        price: Number(item.price),
        quantity: Number(item.quantity),
        image: item.image || "",
        category: itemCategory,
        gstRate: rate,
        gstAmount: amt,
      });
    }

    // 6. Resolve linked user + customer snapshot (admin directory / analytics)
    //
    // Website: JWT customer (req.user) wins — never trust body.user on non-POS (spoofing).
    // POS (in-store): matching priority (see admin getCustomers $lookup):
    //   1) body.user = valid customer User _id (verified against DB + CUSTOMER_ORDER_ROLES)
    //   2) else body.customerEmail OR shippingAddress.email matches a customer account (guest website uses body only; POS may only put email on shipping)
    //   3) else optional guest snapshot: customerEmail / name from body or shipping (user stays unset; admin matches on email only)
    // Walk-in POS with no email: unlinked — does not inflate any customer row (by design).
    let resolvedUserId;
    let customerEmailSnap;
    let customerNameSnap;

    if (!isPosOrder && req.user && CUSTOMER_ORDER_ROLES.includes(req.user.role)) {
      resolvedUserId = req.user._id;
      customerEmailSnap = normalizeEmailForOrder(req.user.email) || undefined;
      customerNameSnap = String(req.user.name || "").trim() || undefined;
    } else if (isPosOrder) {
      const rawUserStr = user != null ? String(user).trim() : "";
      const rawCustomerIdStr =
        rawCustomerId != null && String(rawCustomerId).trim()
          ? String(rawCustomerId).trim()
          : "";
      const idCandidate = rawUserStr || rawCustomerIdStr;
      if (
        idCandidate &&
        mongoose.Types.ObjectId.isValid(idCandidate) &&
        idCandidate.length === 24
      ) {
        const linked = await User.findById(idCandidate).select("email name role");
        if (linked && CUSTOMER_ORDER_ROLES.includes(linked.role)) {
          resolvedUserId = linked._id;
          customerEmailSnap = normalizeEmailForOrder(linked.email) || undefined;
          customerNameSnap = String(linked.name || "").trim() || undefined;
        }
      }
      if (!resolvedUserId) {
        // Prefer explicit body.customerEmail; fall back to shipping snapshot (POS often collects email with address).
        const emailForPos =
          normalizeEmailForOrder(rawCustomerEmail) ||
          normalizeEmailForOrder(shippingAddress?.email);
        if (emailForPos) {
          const byEmail = await User.findOne({
            email: emailForPos,
            role: { $in: CUSTOMER_ORDER_ROLES },
          }).select("email name");
          if (byEmail) {
            resolvedUserId = byEmail._id;
            customerEmailSnap = normalizeEmailForOrder(byEmail.email) || undefined;
            customerNameSnap = String(byEmail.name || "").trim() || undefined;
          } else {
            customerEmailSnap = emailForPos;
            customerNameSnap =
              rawCustomerName != null && String(rawCustomerName).trim()
                ? String(rawCustomerName).trim()
                : shippingAddress && typeof shippingAddress.fullName === "string"
                  ? shippingAddress.fullName.trim()
                  : undefined;
          }
        } else {
          customerEmailSnap = undefined;
          customerNameSnap =
            rawCustomerName != null && String(rawCustomerName).trim()
              ? String(rawCustomerName).trim()
              : shippingAddress && typeof shippingAddress.fullName === "string"
                ? shippingAddress.fullName.trim()
                : undefined;
        }
      }
    } else {
      const fromBodyEmail = normalizeEmailForOrder(rawCustomerEmail);
      customerEmailSnap = fromBodyEmail || undefined;
      customerNameSnap =
        rawCustomerName != null && String(rawCustomerName).trim()
          ? String(rawCustomerName).trim()
          : shippingAddress && typeof shippingAddress.fullName === "string"
            ? shippingAddress.fullName.trim()
            : undefined;
    }

    /** Denormalize for admin directory: some POS clients only sent email on shippingAddress. */
    if (isPosOrder && !customerEmailSnap) {
      const shipE = normalizeEmailForOrder(shippingAddress?.email);
      if (shipE) customerEmailSnap = shipE;
    }

    // 6b. Create and save order
    // Order model has no cancelled/refunded status field — every persisted document is a completed placement; totalSpent sums totalPrice for those.
    const order = new Order({
      orderId: orderIdStr || orderId || orderIdSnake || `ORD-${Date.now()}`,
      clientId: clientId || undefined,
      user: resolvedUserId || undefined,
      ...(customerNameSnap ? { customerName: customerNameSnap } : {}),
      ...(customerEmailSnap ? { customerEmail: customerEmailSnap } : {}),
      items: orderItems,
      ...(isPosOrder ? { orderSource: "pos" } : {}),
      ...(offlineOrderIdStr ? { offlineOrderId: offlineOrderIdStr } : {}),
      shippingAddress,
      paymentMethod,
      paymentDetails,
      totalPrice: Number(totalPrice),
      taxPrice: req.body.taxPrice != null ? Number(req.body.taxPrice) : orderItems.reduce((sum, i) => sum + (i.gstAmount || 0), 0),
      cgstAmount: req.body.cgstAmount != null ? Number(req.body.cgstAmount) : (orderItems.reduce((sum, i) => sum + (i.gstAmount || 0), 0) / 2),
      sgstAmount: req.body.sgstAmount != null ? Number(req.body.sgstAmount) : (orderItems.reduce((sum, i) => sum + (i.gstAmount || 0), 0) / 2),
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      paymentStatus: (isPosOrder || paymentMethod === "razorpay") ? "paid" : "pending",
      isPaid: (isPosOrder || paymentMethod === "razorpay"),
      paidAt: (isPosOrder || paymentMethod === "razorpay") ? Date.now() : undefined,
      amount: paymentMethod === "razorpay" ? Number(totalPrice) : undefined,
      currency: paymentMethod === "razorpay" ? "INR" : undefined,
      ...buildInitialTracking(),
    });

    try {
      const createdOrder = await order.save();
      console.log("[BACKEND] Order Created Successfully:", createdOrder.orderId);

      // 7. Update stock with robust validation and rollback (Manual Transaction)
      const deductedItems = [];
      try {
        for (const item of createdOrder.items) {
          const stockId = item.productId;
          if (stockId && mongoose.Types.ObjectId.isValid(stockId)) {
            const orderedQty = Number(item.quantity || 0);
            
            // Build update query ensuring enough stock
            const updateQuery = { 
              _id: stockId, 
              stock: { $gte: orderedQty } 
            };

            console.log(`[STOCK DEDUCTION] Attempting deduction for ${item.name} (${stockId}). Qty: ${orderedQty}`);

            const updatedProduct = await Product.findOneAndUpdate(
              updateQuery,
              { $inc: { stock: -orderedQty } },
              { new: true, runValidators: true }
            );

            if (!updatedProduct) {
              // Fetch current stock for better error message
              const checkProduct = await Product.findById(stockId);
              const currentStock = checkProduct ? Number(checkProduct.stock || 0) : 0;
              
              console.warn(`[STOCK ERROR] Insufficient stock for ${item.name} during final deduction. Requested: ${orderedQty}, Available: ${currentStock}`);
              throw new Error(`Insufficient stock for ${item.name}. Available: ${currentStock}. Order could not be completed.`);
            }
            
            console.log(`[STOCK DEDUCTION] Success for ${item.name}. New Stock: ${updatedProduct.stock}`);
            deductedItems.push({ productId: stockId, quantity: orderedQty });

            try {
              const { updateInventory } = require('../services/inventoryService');
              await updateInventory({
                tenantId: clientId || updatedProduct.clientId || updatedProduct.merchantId,
                productId: updatedProduct._id,
                quantity: updatedProduct.stock,
                source: isPosOrder ? 'pos_order' : 'website_order',
                referenceId: createdOrder._id
              });
            } catch (syncErr) {
              console.warn(`[orderController] Stock sync warning: ${syncErr.message}`);
            }

            if (updatedProduct.stock <= 10) {
              console.warn(`[LOW STOCK] Product: ${item.name} (${stockId}), New Stock: ${updatedProduct.stock} — below threshold 10.`);
            }
          }
        }
      } catch (stockError) {
        console.error("[BACKEND] Stock deduction failed, rolling back:", stockError.message);
        
        // Rollback deducted stock
        for (const rolledBack of deductedItems) {
          await Product.updateOne(
            { _id: rolledBack.productId, clientId },
            { $inc: { stock: rolledBack.quantity } }
          );
        }
        
        // Remove the order and invoice (if possible) to maintain consistency
        await Order.findByIdAndDelete(createdOrder._id);
        await Invoice.deleteOne({ orderRef: createdOrder._id });
        
        return res.status(400).json({
          success: false,
          message: stockError.message || "Failed to update inventory stock"
        });
      }

      // Create Invoice dynamically
      try {
        const invSubtotal = createdOrder.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        const invTax = createdOrder.taxPrice || createdOrder.items.reduce((sum, i) => sum + (i.gstAmount || 0), 0);
        const invoiceData = new Invoice({
          invoiceNumber: `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          orderId: createdOrder.orderId,
          orderRef: createdOrder._id,
          customerName: createdOrder.customerName || (createdOrder.shippingAddress && createdOrder.shippingAddress.fullName) || "Unknown",
          customerEmail: createdOrder.customerEmail || (createdOrder.shippingAddress && createdOrder.shippingAddress.email) || "",
          items: createdOrder.items.map(i => ({
             name: i.name,
             quantity: i.quantity,
             price: i.price,
             subtotal: (i.price * i.quantity) || 0,
             gstRate: i.gstRate || 0,
             gstAmount: i.gstAmount || 0,
          })),
          subtotal: invSubtotal,
          tax: invTax,
          cgst: invTax / 2,
          sgst: invTax / 2,
          totalAmount: Number(createdOrder.totalPrice),
          paymentMethod: createdOrder.paymentMethod,
          paymentStatus: isPosOrder ? "paid" : createdOrder.paymentStatus,
          orderStatus: createdOrder.orderStatus,
          clientId: createdOrder.clientId
        });
        await invoiceData.save();
        console.log("[BACKEND] Invoice Created Automatically for:", createdOrder.orderId);
      } catch (invErr) {
        console.error("[ERROR] Failed to generate automatic Invoice:", invErr);
      }

      // 8. Shiprocket: auto-create shipment for website delivery orders (COD & prepaid share this path).
      let responseOrder = createdOrder;
      if (isPosOrder) {
        console.log(
          `[Shiprocket] Auto shipment skipped — POS / in-store order ${createdOrder.orderId}`
        );
      } else if (shiprocketService.isShiprocketConfigured()) {
        try {
          if (!shiprocketService.orderAlreadyHasShipment(createdOrder)) {
            const sr = await shiprocketService.createAdhocShipmentFromOrder(createdOrder);
            if (!sr.duplicateSkipped) {
              createdOrder.shiprocketRawResponse = sr.shipmentResponse;
              createdOrder.shipmentCreatedAt = new Date();
              if (sr.awbCode) createdOrder.awbCode = sr.awbCode;
              if (sr.courierName) {
                createdOrder.courierName = sr.courierName;
                createdOrder.shipmentCarrier = sr.courierName;
              }
              if (sr.shiprocketShipmentId) createdOrder.shiprocketShipmentId = sr.shiprocketShipmentId;
              if (sr.shiprocketOrderId) createdOrder.shiprocketOrderId = sr.shiprocketOrderId;
              if (sr.trackingUrl) createdOrder.trackingUrl = sr.trackingUrl;
              if (sr.trackingStatus) createdOrder.trackingStatus = sr.trackingStatus;
              await createdOrder.save();
              responseOrder = createdOrder;
            }
          }
        } catch (srErr) {
          console.error(`[Shiprocket] Auto shipment failed:`, srErr.message);
        }
      }

      // Resolve client business profile for the response
      let business = null;
      if (responseOrder.clientId) {
        try {
          const clientDoc = await Client.findById(responseOrder.clientId);
          if (clientDoc) {
            business = {
              name: clientDoc.companyName || clientDoc.shopName || "",
              tagline: clientDoc.brandingName || "",
              address: clientDoc.permanentAddress || "",
              email: clientDoc.email || "",
              phone: clientDoc.phone || "",
              logo: clientDoc.logo || null,
            };
          }
        } catch (bErr) {
          console.warn("[createOrder] Failed to resolve business profile:", bErr.message);
        }
      }

      const orderData = enrichOrderTracking(responseOrder);
      if (business) {
        orderData.business = business;
      }

      res.status(201).json({
        success: true,
        message: "Order placed successfully",
        data: orderData,
      });

    } catch (saveError) {
      if (saveError.code === 11000 && offlineOrderIdStr) {
        const existingDup = await Order.findOne({ offlineOrderId: offlineOrderIdStr });
        if (existingDup) {
          console.log(
            "[BACKEND] Duplicate key on offlineOrderId; returning existing:",
            existingDup.orderId
          );
          let dupBusiness = null;
          if (existingDup.clientId) {
            try {
              const dupClient = await Client.findById(existingDup.clientId);
              if (dupClient) {
                dupBusiness = {
                  name: dupClient.companyName || dupClient.shopName || "",
                  tagline: dupClient.brandingName || "",
                  address: dupClient.permanentAddress || "",
                  email: dupClient.email || "",
                  phone: dupClient.phone || "",
                  logo: dupClient.logo || null,
                };
              }
            } catch (bErr) {
              console.warn("[createOrder] Failed to resolve business profile for duplicate:", bErr.message);
            }
          }
          const dupOrderData = enrichOrderTracking(existingDup);
          if (dupBusiness) {
            dupOrderData.business = dupBusiness;
          }
          return res.status(200).json({
            success: true,
            message: "Order already recorded",
            data: dupOrderData,
          });
        }
      }
      console.error("[ERROR] Mongoose save error:", saveError.message);
      if (saveError.errors) {
        Object.keys(saveError.errors).forEach((p) => {
          console.error(`[VALIDATION] ${p}: ${saveError.errors[p].message}`);
        });
      }
      res.status(500).json({
        success: false,
        message: "Failed to save order to database",
        error: saveError.message
      });
    }
  } catch (error) {
    console.error("[ERROR] createOrder catch block:", error);
    res.status(500).json({
      success: false,
      message: "Server error while creating order",
      error: error.message,
    });
  }
};

const getOrders = async (req, res) => {
  try {
    const normalizedRole = normalizeRole(req.user?.role);
    const isSuperAdmin = normalizedRole === "super_admin";
    const isAdmin = normalizedRole === "admin";

    let scopeQuery = {};
    if (isSuperAdmin || isAdmin) {
      // Super Admin and Admin: Use explicit clientId if provided, else global
      const explicitClientId = req.query?.clientId || req.headers["x-client-id"];
      if (isValidObjectId(explicitClientId)) {
        scopeQuery = { clientId: String(explicitClientId) };
      }
    } else {
      // For other roles, use the standard scoping logic
      const resolvedClientId = await resolveClientId(req);
      scopeQuery = buildScopeQuery(req.user, resolvedClientId, true);
    }

    const query = { isDeleted: { $ne: true } };
    if (scopeQuery && Object.keys(scopeQuery).length > 0) {
      applyScope(query, scopeQuery);
    }

    // Fetch orders with sort latest first
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .populate("user", "name email")
      .populate({
        path: "clientId",
        select: "name businessName email logo",
        options: { strictPopulate: false }
      })
      .lean();

    // Calculate stats
    let totalRevenue = 0;
    let deliveredCount = 0;
    let inProgressCount = 0;

    const data = orders.map((o) => {
      try {
        const enriched = enrichOrderTracking(o);
        
        // Use normalized status for stats
        const status = (enriched.orderStatusResolved || enriched.orderStatus || enriched.status || "").toLowerCase();
        const isCancelled = enriched.isCancelled === true || status === "cancelled";
        const isDelivered = enriched.isDelivered === true || status === "delivered" || status === "completed";
        const isPaid = enriched.isPaid === true || enriched.paymentStatus === "paid" || isDelivered;

        if (!isCancelled) {
          if (isDelivered) {
            deliveredCount++;
          } else {
            inProgressCount++;
          }
          if (isPaid) {
            totalRevenue += Number(enriched.totalPrice || 0);
          }
        }

        return enriched;
      } catch (err) {
        console.warn("[DEBUG getOrders] Error enriching order:", o?._id, err.message);
        return o; // Return original if enrichment fails
      }
    });

    const response = {
      success: true,
      count: data.length,
      totalOrders: data.length,
      inProgress: inProgressCount,
      delivered: deliveredCount,
      revenue: totalRevenue,
      stats: {
        totalOrders: data.length,
        inProgress: inProgressCount,
        delivered: deliveredCount,
        revenue: totalRevenue,
      },
      data: data,
    };

    console.log("[DEBUG getOrders] API Response Shape:", Object.keys(response).join(", "));
    console.log("-----------------------------------------");

    res.json(response);
  } catch (error) {
    console.error("[DEBUG getOrders] CRITICAL ERROR:", error);
    res.status(200).json({
      success: false,
      message: "Could not load orders",
      error: error.message,
      totalOrders: 0,
      inProgress: 0,
      delivered: 0,
      revenue: 0,
      data: [],
      stats: {
        totalOrders: 0,
        inProgress: 0,
        delivered: 0,
        revenue: 0,
      }
    });
  }
};


// @desc    Dashboard overview — latest orders (website + POS), newest first
// @route   GET /api/orders/dashboard/latest-transactions?limit=
// @access  Private (same roles as GET /api/orders)
const getLatestTransactions = async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const normalizedRole = normalizeRole(req.user?.role);
    const isSuperAdmin = normalizedRole === "super_admin";
    const isAdmin = normalizedRole === "admin";

    let scopeQuery = {};
    if (isSuperAdmin || isAdmin) {
      const explicitClientId = req.query?.clientId || req.headers["x-client-id"];
      if (isValidObjectId(explicitClientId)) {
        scopeQuery = { clientId: String(explicitClientId) };
      }
    } else {
      const resolvedClientId = await resolveClientId(req);
      scopeQuery = buildScopeQuery(req.user, resolvedClientId, true);
    }

    const query = { isDeleted: { $ne: true } };
    if (scopeQuery && Object.keys(scopeQuery).length > 0) {
      applyScope(query, scopeQuery);
    }

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("user", "name email")
      .populate({
        path: "clientId",
        select: "name businessName email",
        options: { strictPopulate: false }
      })
      .lean();

    // Transform records — skip nulls or broken entries, never throw
    const data = orders
      .map((o) => {
        if (!o) return null;
        try {
          const displayId = o.orderId || String(o._id);

          const customerName =
            (o.customerName && String(o.customerName).trim()) ||
            (o.user?.name && String(o.user.name).trim()) ||
            (o.shippingAddress?.fullName && String(o.shippingAddress.fullName).trim()) ||
            "Guest Customer";

          const customerEmail =
            (o.customerEmail && String(o.customerEmail).trim()) ||
            (o.user?.email && String(o.user.email).trim()) ||
            (o.shippingAddress?.email && String(o.shippingAddress.email).trim()) ||
            null;

          let orderStatusResolved = o.orderStatus || "placed";
          try {
            const enriched = enrichOrderTracking(o);
            orderStatusResolved = enriched.orderStatusResolved || orderStatusResolved;
          } catch (_) {
            // enrichOrderTracking is non-critical for the list view
          }

          return {
            id: String(o._id),
            orderId: displayId,
            customerName,
            customerEmail,
            totalPrice: Number(o.totalPrice) || 0,
            orderStatus: orderStatusResolved,
            trackingStatus: o.trackingStatus || null,
            createdAt: o.createdAt ? (o.createdAt.toISOString ? o.createdAt.toISOString() : o.createdAt) : null,
            orderSource: o.orderSource || null,
            isDelivered: !!o.isDelivered,
            itemCount: Array.isArray(o.items) ? o.items.length : 0,
          };
        } catch (mapErr) {
          console.warn("[DEBUG getLatestTransactions] skipping order:", o?._id, mapErr.message);
          return null;
        }
      })
      .filter((item) => item !== null);

    console.log("[DEBUG getLatestTransactions] Final data count:", data.length);
    console.log("-----------------------------------------");

    res.json({ success: true, count: data.length, data });
  } catch (error) {
    console.error("[DEBUG getLatestTransactions] CRITICAL ERROR:", error);
    res.json({ success: true, count: 0, data: [] });
  }
};

const getOrderById = async (req, res) => {
  try {
    const raw = req.params.id != null ? String(req.params.id).trim() : "";
    if (!raw) {
      return res.status(400).json({ success: false, message: "Order id is required" });
    }

    const normalizedRole = normalizeRole(req.user?.role);
    const isSuperAdmin = normalizedRole === "super_admin";
    const isAdmin = normalizedRole === "admin";

    let scopeQuery = {};
    if (!isSuperAdmin && !isAdmin) {
      const resolvedClientId = await resolveClientId(req);
      scopeQuery = buildScopeQuery(req.user, resolvedClientId, true);
    }

    // Build a flexible query to find by orderId or Mongo _id
    const query = {
      $or: [
        { orderId: raw },
        ...(isValidObjectId(raw) ? [{ _id: raw }] : [])
      ]
    };
    
    // Apply tenant scoping ONLY if not Super Admin and not Admin
    if (!isSuperAdmin && !isAdmin) {
      applyScope(query, scopeQuery);
    }

    const order = await Order.findOne(query)
      .populate("user", "name email")
      .populate({
        path: "clientId",
        select: "name businessName email logo",
        options: { strictPopulate: false }
      });

    if (order) {
      // Use enrichOrderTracking to ensure safe defaults for the UI
      const data = enrichOrderTracking(order);
      
      // Ensure items array is safe even if malformed in DB
      if (!Array.isArray(data.items)) {
        data.items = [];
      }

      res.json({ success: true, data });
    } else {
      // Check if order exists at all (ignoring scope) to provide better error context
      const existsIgnoringScope = await Order.findOne({
        $or: [
          { orderId: raw },
          ...(mongoose.Types.ObjectId.isValid(raw) ? [{ _id: raw }] : [])
        ]
      }).select("_id orderId");

      if (existsIgnoringScope) {
        console.warn(`[OrderController] Order ${raw} found but blocked by scope:`, scopeQuery);
        return res.status(403).json({ success: false, message: "Order found but you do not have permission to access it" });
      }

      res.status(404).json({ success: false, message: "Order not found" });
    }
  } catch (error) {
    console.error("[OrderController] getOrderById error:", error.message);
    res.status(500).json({ success: false, message: "Error fetching order details" });
  }
};

// @desc    Logged-in customer: orders with tracking (own only)
// @route   GET /api/orders/my-tracking
// @access  Private (user, customer)
const getMyOrdersTracking = async (req, res) => {
  try {
    const resolvedClientId = await resolveClientId(req);
    const clientId = req.user?.clientId || req.clientId || resolvedClientId;
    const isAdmin = req.user && ["admin", "super_admin", "manager", "staff", "inventory_manager", "cashier"].includes(req.user.role);
    
    const query = {};
    if (!isAdmin) {
      query.user = req.user._id;
    } else if (isValidObjectId(clientId)) {
      query.clientId = String(clientId);
    }
    
    const limit = isAdmin ? 20 : 50;

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("user", "name email")
      .populate("clientId", "name businessName email logo")
      .lean();
    const data = orders.map((doc) => enrichOrderTracking(doc));
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Logged-in customer: single order by order id, tracking id, AWB, Shiprocket ids, or Mongo _id (own only)
// @route   GET /api/orders/track?query=...  OR  GET /api/orders/track/:identifier
// @access  Private (user, customer)
const getOrderTrackingByIdentifier = async (req, res) => {
  try {
    const fromParam = req.params && req.params.identifier != null ? String(req.params.identifier).trim() : "";
    const fromQuery = req.query && req.query.query != null ? String(req.query.query).trim() : "";
    const raw = fromParam || fromQuery;
    if (!raw) {
      return res.status(400).json({ success: false, message: "Order or tracking id required" });
    }

    const isAdmin =
      req.user &&
      ["admin", "super_admin", "manager", "staff", "inventory_manager", "cashier"].includes(
        req.user.role
      );

    const orConditions = [{ orderId: raw }, { trackingId: raw }, { awbCode: raw }];
    if (raw) {
      orConditions.push({ shiprocketShipmentId: raw });
      orConditions.push({ shiprocketOrderId: raw });
    }
    if (/^\d+$/.test(raw)) {
      orConditions.push({ shiprocketOrderId: raw });
      orConditions.push({ shiprocketShipmentId: raw });
    }
    if (isValidObjectId(raw)) {
      try {
        orConditions.push({ _id: new mongoose.Types.ObjectId(String(raw)) });
      } catch (_) {
        /* ignore */
      }
    }

    const query = { $or: orConditions };

    if (!isAdmin) {
      query.user = req.user._id;
    }

    const order = await Order.findOne(query);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const data = await attachLiveShiprocket(order);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Update tracking fields (admin / staff)
// @route   PATCH /api/orders/:id/tracking
// @access  Private (admin, staff, inventory_manager, cashier)
const patchOrderTracking = async (req, res) => {
  try {
    const param = req.params.id;
    let order = await Order.findOne({ orderId: param });
    if (!order && mongoose.Types.ObjectId.isValid(param)) {
      order = await Order.findById(param);
    }
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (String(order.orderStatus || "").toLowerCase() === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Cannot update tracking for a cancelled order",
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const {
      orderStatus,
      trackingStatus,
      currentStage,
      estimatedDelivery,
      shipmentCarrier,
      shippedAt,
      deliveredAt,
      isDelivered,
      appendHistory,
      refundAmount,
      refundedAt,
      cancelledAt,
    } = body;

    if (orderStatus != null && String(orderStatus).trim()) {
      order.orderStatus = String(orderStatus).trim();
      order.status = String(orderStatus).trim();
    }
    if (trackingStatus != null && String(trackingStatus).trim()) {
      order.trackingStatus = String(trackingStatus).trim();
    }
    if (typeof currentStage === "number" && !Number.isNaN(currentStage)) {
      order.currentStage = Math.min(6, Math.max(1, Math.round(currentStage)));
    }
    if (estimatedDelivery != null) {
      const d = new Date(estimatedDelivery);
      if (!Number.isNaN(d.getTime())) order.estimatedDelivery = d;
    }
    if (shipmentCarrier != null) {
      order.shipmentCarrier = String(shipmentCarrier).trim() || undefined;
    }
    if (shippedAt != null) {
      const d = new Date(shippedAt);
      if (!Number.isNaN(d.getTime())) order.shippedAt = d;
    }
    if (deliveredAt != null) {
      const d = new Date(deliveredAt);
      if (!Number.isNaN(d.getTime())) order.deliveredAt = d;
    }
    if (typeof isDelivered === "boolean") {
      order.isDelivered = isDelivered;
      if (isDelivered) {
        order.currentStage = 6;
        order.orderStatus = order.orderStatus === "placed" ? "delivered" : order.orderStatus || "delivered";
        order.status = order.orderStatus;
        order.trackingStatus = order.trackingStatus || "Delivered";
        if (!order.deliveredAt) order.deliveredAt = new Date();
      }
    }

    if (appendHistory && typeof appendHistory === "object") {
      const h = appendHistory;
      order.trackingHistory = order.trackingHistory || [];
      order.trackingHistory.push({
        stage:
          typeof h.stage === "number"
            ? Math.min(6, Math.max(1, h.stage))
            : order.currentStage || 1,
        label: h.label != null ? String(h.label).slice(0, 120) : undefined,
        message: h.message != null ? String(h.message).slice(0, 500) : undefined,
        at: h.at ? new Date(h.at) : new Date(),
      });
    }

    if (refundAmount !== undefined && refundAmount !== null) {
      const n = Number(refundAmount);
      if (!Number.isNaN(n) && n >= 0) {
        order.refundAmount = n;
        if (n > 0 && refundedAt == null) {
          order.refundedAt = new Date();
        }
      }
    }
    if (refundedAt !== undefined) {
      if (refundedAt === null || refundedAt === "") {
        order.refundedAt = undefined;
      } else {
        const d = new Date(refundedAt);
        if (!Number.isNaN(d.getTime())) order.refundedAt = d;
      }
    }
    if (cancelledAt !== undefined) {
      if (cancelledAt === null || cancelledAt === "") {
        order.cancelledAt = undefined;
      } else {
        const d = new Date(cancelledAt);
        if (!Number.isNaN(d.getTime())) order.cancelledAt = d;
      }
    }

    await order.save();
    res.json({ success: true, data: enrichOrderTracking(order) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const deleteOrder = async (req, res) => {
  try {
    const normalizedRole = normalizeRole(req.user?.role);
    const isSuperAdmin = normalizedRole === "super_admin";

    const clientId = !isSuperAdmin ? (req.user?.clientId || req.clientId || (await resolveClientId(req))) : null;
    const paramId = req.params.id;

    // Support both custom orderId (e.g. #RV-POS-...) and MongoDB _id
    let order = null;
    if (isSuperAdmin) {
      order = await Order.findOne({ orderId: paramId });
      if (!order && isValidObjectId(paramId)) {
        order = await Order.findById(paramId);
      }
    } else {
      order = await Order.findOne({ orderId: paramId, clientId });
      if (!order && isValidObjectId(paramId)) {
        order = await Order.findOne({ _id: paramId, clientId });
      }
    }

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const oid = order.orderId;
    const mongoId = order._id;

    // Hard delete from MongoDB — avoids Mongoose validation errors on save()
    await Order.deleteOne({ _id: mongoId });

    console.log("[OrderDelete LOG]: Deleted order ID:", mongoId, "orderId:", oid);

    // Clean up related tracking logs
    if (oid) {
      try {
        await TrackOrder.deleteMany({ orderId: oid });
      } catch (trkErr) {
        console.error(`[OrderDelete] Failed to delete tracking logs for ${oid}:`, trkErr.message);
      }
    }

    // Clean up related invoice record if exists
    try {
      await Invoice.deleteOne({ orderId: oid });
    } catch (invErr) {
      console.error(`[OrderDelete] Failed to delete invoice for ${oid}:`, invErr.message);
    }

    return res.json({ success: true, message: "Order deleted successfully", deletedId: mongoId });
  } catch (error) {
    console.error("[OrderDelete] Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error while deleting order" });
  }
};

/** Admin-only sequential tracking: label → stage (2–6). Order Placed (1) is set at checkout. */
const ADMIN_TRACKING_KEYS = {
  Confirmed: { stage: 2, orderStatus: "confirmed" },
  Packed: { stage: 3, orderStatus: "packed" },
  Shipped: { stage: 4, orderStatus: "shipped" },
  "Out for Delivery": { stage: 5, orderStatus: "out_for_delivery" },
  Delivered: { stage: 6, orderStatus: "delivered" },
};

function normalizeAdminTrackingInput(raw) {
  if (raw == null || typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  const map = {
    confirmed: "Confirmed",
    packed: "Packed",
    shipped: "Shipped",
    "out for delivery": "Out for Delivery",
    out_for_delivery: "Out for Delivery",
    outfordelivery: "Out for Delivery",
    delivered: "Delivered",
  };
  if (map[s]) return map[s];
  for (const key of Object.keys(ADMIN_TRACKING_KEYS)) {
    if (key.toLowerCase() === s) return key;
  }
  return null;
}

function getEffectiveCurrentStageDoc(order) {
  if (order.isDelivered) return 6;
  const cs = order.currentStage;
  if (typeof cs === "number" && cs >= 1 && cs <= 6) return cs;
  return 1;
}

// @desc    Admin: advance tracking one stage at a time (sequential)
// @route   PATCH /api/orders/:orderId/tracking-status
// @access  Private (admin)
const patchOrderTrackingStatus = async (req, res) => {
  try {
    const param = req.params.orderId;
    let order = await Order.findOne({ orderId: param });
    if (!order && mongoose.Types.ObjectId.isValid(param)) {
      order = await Order.findById(param);
    }
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (String(order.orderStatus || "").toLowerCase() === "cancelled") {
      return res.status(400).json({ success: false, message: "Cannot update tracking for a cancelled order" });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const label = normalizeAdminTrackingInput(body.trackingStatus);
    if (!label || !ADMIN_TRACKING_KEYS[label]) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid trackingStatus. Use: Confirmed, Packed, Shipped, Out for Delivery, or Delivered.",
      });
    }

    const { stage: targetStage, orderStatus: nextOrderStatus } = ADMIN_TRACKING_KEYS[label];
    const currentStage = getEffectiveCurrentStageDoc(order);

    if (currentStage >= 6) {
      return res.status(400).json({ success: false, message: "Order is already delivered." });
    }

    if (targetStage < currentStage) {
      return res.status(400).json({
        success: false,
        message: "Cannot move tracking backward. Advance stages in order.",
      });
    }

    if (targetStage === currentStage) {
      return res.json({
        success: true,
        message: "Order is already at this stage.",
        data: enrichOrderTracking(order),
      });
    }

    if (targetStage !== currentStage + 1) {
      return res.status(400).json({
        success: false,
        message: `Next stage must be one step ahead. Current stage: ${currentStage} (${TRACKING_STAGE_LABELS[currentStage - 1]}).`,
      });
    }

    const now = new Date();
    order.currentStage = targetStage;
    order.orderStatus = nextOrderStatus;
    order.status = nextOrderStatus;
    order.trackingStatus = TRACKING_STAGE_LABELS[targetStage - 1];
    order.updatedBy = req.user._id;

    if (targetStage === 2 && !order.confirmedAt) order.confirmedAt = now;
    if (targetStage === 3 && !order.packedAt) order.packedAt = now;
    if (targetStage === 4) {
      if (!order.shippedAt) order.shippedAt = now;
      if (!shiprocketService.orderAlreadyHasShipment(order) && shiprocketService.isShiprocketConfigured()) {
        try {
          const sr = await shiprocketService.createAdhocShipmentFromOrder(order);
          if (sr && !sr.duplicateSkipped && (sr.awbCode || sr.shiprocketShipmentId || sr.shiprocketOrderId)) {
            if (sr.awbCode) order.awbCode = sr.awbCode;
            order.courierName = sr.courierName || order.courierName;
            order.shiprocketShipmentId = sr.shiprocketShipmentId || order.shiprocketShipmentId;
            order.shiprocketOrderId = sr.shiprocketOrderId || order.shiprocketOrderId;
            order.shipmentCarrier = sr.courierName || order.shipmentCarrier;
            if (sr.trackingUrl) order.trackingUrl = sr.trackingUrl;
            if (sr.shipmentResponse) {
              order.shiprocketRawResponse = sr.shipmentResponse;
              if (!order.shipmentCreatedAt) order.shipmentCreatedAt = new Date();
            }
            if (sr.awbCode && String(sr.awbCode).trim()) {
              order.shipmentCreateError = undefined;
            } else if (sr.awbAssignErrorMessage) {
              order.shipmentCreateError = String(sr.awbAssignErrorMessage).slice(0, 2000);
            }
            console.log(
              `[Shiprocket] Admin Shipped — saved Shiprocket ids for ${order.orderId} awb=${sr.awbCode ? "yes" : "no"} shipmentCreateError=${order.shipmentCreateError ? "yes" : "no"}`
            );
          }
        } catch (srErr) {
          const msg = srErr && srErr.message ? String(srErr.message).slice(0, 2000) : "Shiprocket error";
          order.shipmentCreateError = msg;
          if (srErr && srErr.shiprocketJson) {
            order.shiprocketShipmentError = {
              code: srErr.code || "CREATE_FAILED",
              message: msg,
              at: new Date(),
              shiprocketResponse: srErr.shiprocketJson,
            };
          }
          console.error(
            "[Shiprocket] createAdhocShipmentFromOrder (admin Shipped):",
            msg,
            srErr && srErr.shiprocketJson ? JSON.stringify(srErr.shiprocketJson).slice(0, 800) : ""
          );
        }
      } else if (shiprocketService.orderAlreadyHasShipment(order)) {
        console.log(
          `[Shiprocket] Admin Shipped stage — shipment already exists for order ${order.orderId}, skipping create`
        );
      }
    }
    if (targetStage === 5 && !order.outForDeliveryAt) order.outForDeliveryAt = now;
    if (targetStage === 6) {
      order.isDelivered = true;
      if (!order.deliveredAt) order.deliveredAt = now;
    }

    if (body.estimatedDelivery != null && String(body.estimatedDelivery).trim() !== "") {
      const d = new Date(body.estimatedDelivery);
      if (!Number.isNaN(d.getTime())) order.estimatedDelivery = d;
    }

    order.trackingHistory = order.trackingHistory || [];
    order.trackingHistory.push({
      stage: targetStage,
      label: TRACKING_STAGE_LABELS[targetStage - 1],
      message: `Status updated to ${TRACKING_STAGE_LABELS[targetStage - 1]}.`,
      at: now,
    });

    await order.save();
    res.json({ success: true, message: "Tracking updated", data: enrichOrderTracking(order) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Customer (or admin): cancel order before shipment — persists cancellation on the Order document
// @route   PATCH /api/orders/:orderId/cancel
// @access  Private (user, customer, admin, super_admin)
const cancelOrder = async (req, res) => {
  try {
    const param = req.params.orderId;
    let order = await Order.findOne({ orderId: param });
    if (!order && mongoose.Types.ObjectId.isValid(param)) {
      order = await Order.findById(param);
    }
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const isPrivileged = req.user && ["admin", "super_admin"].includes(req.user.role);
    if (!isPrivileged) {
      if (!order.user || String(order.user) !== String(req.user._id)) {
        return res.status(403).json({ success: false, message: "Not authorized to cancel this order" });
      }
    }

    if (!isOrderEligibleForCancellation(order)) {
      return res.status(400).json({
        success: false,
        message: "This order can no longer be cancelled (already shipped, delivered, or cancelled).",
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const cancellationReason =
      body.cancellationReason != null && String(body.cancellationReason).trim()
        ? String(body.cancellationReason).trim().slice(0, 500)
        : "Customer requested cancellation";

    const previousStatus = String(order.orderStatus || "placed");
    const now = new Date();

    const cancelledItems = (order.items || []).map((item) => {
      const price = Number(item.price);
      const qty = Number(item.quantity);
      return {
        productId: String(item.productId),
        name: item.name,
        price,
        quantity: qty,
        subtotal: price * qty,
      };
    });

    const pm = String(order.paymentMethod || "").toLowerCase();
    const refundStatus =
      pm.includes("cod") || pm.includes("cash") || pm.includes("store") ? "not_applicable" : "pending";

    for (const item of order.items || []) {
      const pid = item.productId;
      if (pid && mongoose.Types.ObjectId.isValid(String(pid))) {
        await Product.findByIdAndUpdate(String(pid), {
          $inc: { stock: Number(item.quantity) || 0 },
        });
      }
    }

    let histStage = 1;
    if (order.isDelivered) histStage = 6;
    else if (typeof order.currentStage === "number" && order.currentStage >= 1 && order.currentStage <= 6) {
      histStage = order.currentStage;
    }

    order.previousStatus = previousStatus;
    order.orderStatus = "cancelled";
    order.status = "cancelled";
    order.trackingStatus = "Cancelled";
    order.cancelledAt = now;
    order.cancelledBy = req.user._id;
    order.cancellationReason = cancellationReason;
    order.cancelledItems = cancelledItems;
    order.refundStatus = refundStatus;

    order.trackingHistory = order.trackingHistory || [];
    order.trackingHistory.push({
      stage: histStage,
      label: "Cancelled",
      message: `Order cancelled. ${cancellationReason}`,
      at: now,
    });

    await order.save();

    res.json({
      success: true,
      message: "Order cancelled successfully",
      data: enrichOrderTracking(order),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function addMonths(d, n) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

function monthWindowContaining(ref) {
  const start = startOfMonth(ref);
  const end = addMonths(start, 1);
  return { start, end };
}

function previousMonthWindow(ref) {
  const thisStart = startOfMonth(ref);
  const prevEnd = thisStart;
  const prevStart = addMonths(thisStart, -1);
  return { start: prevStart, end: prevEnd };
}

function pctChange(current, previous) {
  if (previous == null || Number.isNaN(previous) || previous === 0) {
    if (current == null || Number.isNaN(current) || current === 0) return 0;
    return 100;
  }
  return ((current - previous) / previous) * 100;
}

/** Not delivered / cancelled / completed — in-flight pipeline (all channels). */
function buildActiveOrdersFilter(userId) {
  return {
    user: userId,
    isDelivered: { $ne: true },
    $nor: [
      { orderStatus: { $regex: /^(cancelled|delivered|completed)$/i } },
      { status: { $regex: /^(cancelled|delivered|completed)$/i } },
    ],
  };
}

/** Website / app checkout (excludes in-store POS). */
function websiteOrderBase(userId) {
  return {
    user: userId,
    $or: [
      { orderSource: { $exists: false } },
      { orderSource: null },
      { orderSource: "" },
      { orderSource: { $ne: "pos" } },
    ],
  };
}

async function userWebsiteConversionRateForWindow(userId, start, end) {
  const base = {
    ...websiteOrderBase(userId),
    createdAt: { $gte: start, $lt: end },
  };
  const total = await Order.countDocuments(base);
  if (total === 0) return { rate: 0, total: 0, delivered: 0 };
  const delivered = await Order.countDocuments({
    ...base,
    $or: [
      { isDelivered: true },
      { orderStatus: { $regex: /^(delivered|completed)$/i } },
      { status: { $regex: /^(delivered|completed)$/i } },
    ],
  });
  const rate = Math.min(100, (delivered / total) * 100);
  return { rate: Math.round(rate * 100) / 100, total, delivered };
}

// @desc    Logged-in storefront user — overview KPIs (active pipeline, total orders, website completion rate)
// @route   GET /api/orders/me/dashboard-overview
// @access  Private (user, customer)
const getUserDashboardOverview = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();
    const cur = monthWindowContaining(now);
    const prev = previousMonthWindow(now);

    const [activeOrders, totalOrders, convCur, convPrev] = await Promise.all([
      Order.countDocuments(buildActiveOrdersFilter(userId)),
      Order.countDocuments({ user: userId }),
      userWebsiteConversionRateForWindow(userId, cur.start, cur.end),
      userWebsiteConversionRateForWindow(userId, prev.start, prev.end),
    ]);

    const conversionRateChange = Math.round(pctChange(convCur.rate, convPrev.rate) * 10) / 10;

    res.json({
      success: true,
      data: {
        activeOrders,
        totalOrders,
        conversionRate: convCur.rate,
        conversionRateChange,
        meta: {
          conversionDenominator: "website_orders_placed_in_month",
          conversionNumerator: "delivered_or_completed_in_that_month",
          activeOrdersScope: "non_terminal_non_delivered_all_channels",
          totalOrdersScope: "all_orders_linked_to_user",
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  createOrder,
  getOrders,
  getLatestTransactions,
  getOrderById,
  deleteOrder,
  getMyOrdersTracking,
  getOrderTrackingByIdentifier,
  getUserDashboardOverview,
  patchOrderTracking,
  patchOrderTrackingStatus,
  cancelOrder,
};
