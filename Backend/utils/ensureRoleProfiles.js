const mongoose = require("mongoose");
const User = require("../models/User");
const Client = require("../models/Client");
const Employee = require("../models/Employee");
const { isClientScopedRole } = require("./clientScopedRoles");

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/**
 * Deterministic valid GSTIN from Mongo ObjectId (unique per user id for auto-provisioned clients).
 */
function toOidHex24(id) {
  if (id instanceof mongoose.Types.ObjectId) return id.toString();
  return new mongoose.Types.ObjectId(id).toString();
}

function syntheticGstFromObjectId(id) {
  const oid = toOidHex24(id);
  const L = (i) => String.fromCharCode(65 + (parseInt(oid[i], 16) % 26));
  const D = (i) => String(parseInt(oid[i], 16) % 10);
  let s = "99";
  for (let i = 0; i < 5; i++) s += L(i);
  for (let i = 5; i < 9; i++) s += D(i);
  s += L(9);
  s += String(1 + (parseInt(oid[10], 16) % 9));
  s += "Z";
  s += "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"[parseInt(oid.slice(11, 13), 16) % 36];
  if (!GSTIN_RE.test(s)) {
    return "99AAAAA0000A1Z9";
  }
  return s;
}

function syntheticPanFromObjectId(id) {
  const oid = toOidHex24(id);
  const L = (i) => String.fromCharCode(65 + (parseInt(oid[i], 16) % 26));
  let s = "";
  for (let i = 0; i < 5; i++) s += L(i);
  for (let i = 5; i < 9; i++) s += String(parseInt(oid[i], 16) % 10);
  s += L(9);
  if (!PAN_RE.test(s)) {
    return "AAAAA0000A";
  }
  return s;
}

async function ensureClientLinked(userDoc) {
  if (!isClientScopedRole(userDoc.role)) {
    return;
  }

  if (userDoc.clientId) {
    return;
  }

  const byUser = await Client.findOne({ userId: userDoc._id }).lean();
  if (byUser) {
    userDoc.clientId = byUser._id;
    await userDoc.save();
    return;
  }

  const email = String(userDoc.email || "")
    .trim()
    .toLowerCase();
  const byEmail = await Client.findOne({ email }).lean();
  if (byEmail) {
    userDoc.clientId = byEmail._id;
    await userDoc.save();
    await Client.updateOne(
      { _id: byEmail._id },
      { $set: { userId: userDoc._id } }
    );
    return;
  }

  const gst = syntheticGstFromObjectId(userDoc._id);
  const pan = syntheticPanFromObjectId(userDoc._id);
  const companyName = `${String(userDoc.name || "Account").trim() || "Account"} — company`;
  const shopName = String(userDoc.name || "").trim();

  try {
    const client = await Client.create({
      companyName,
      gst,
      phone: "0000000000",
      email,
      panNo: pan,
      permanentAddress: "",
      shopName,
      createdBy: null,
      userId: userDoc._id,
    });
    userDoc.clientId = client._id;
    await userDoc.save();
  } catch (err) {
    if (err && err.code === 11000) {
      const recover = await Client.findOne({
        $or: [{ email }, { userId: userDoc._id }, { gst }],
      });
      if (recover) {
        userDoc.clientId = recover._id;
        await userDoc.save();
        await Client.updateOne(
          { _id: recover._id },
          { $set: { userId: userDoc._id } }
        );
        return;
      }
    }
    throw err;
  }
}

async function ensureEmployeeStub(userDoc) {
  if (userDoc.role !== "employee" && userDoc.role !== "store_manager") {
    return;
  }
  if (!userDoc.clientId) {
    return;
  }

  const byUser = await Employee.findOne({ userId: userDoc._id }).lean();
  if (byUser) {
    return;
  }

  const email = String(userDoc.email || "")
    .trim()
    .toLowerCase();
  const dup = await Employee.findOne({
    email,
    clientId: userDoc.clientId,
  });

  if (dup) {
    if (!dup.userId) {
      await Employee.updateOne({ _id: dup._id }, { $set: { userId: userDoc._id } });
    }
    return;
  }

  try {
    await Employee.create({
      name: String(userDoc.name || "User").trim() || "User",
      email,
      phone: "0000000000",
      address: "—",
      role: userDoc.role,
      clientId: userDoc.clientId,
      shopName: "",
      status: "active",
      createdBy: userDoc._id,
      userId: userDoc._id,
    });
  } catch (err) {
    if (err && err.code === 11000) {
      const row = await Employee.findOne({ email, clientId: userDoc.clientId });
      if (row && !row.userId) {
        await Employee.updateOne({ _id: row._id }, { $set: { userId: userDoc._id } });
      }
      return;
    }
    throw err;
  }
}

async function ensureVendorProfile(userDoc) {
  const normRole = String(userDoc.role || "").trim().toLowerCase();
  if (normRole !== "vendor") {
    return;
  }

  const Vendor = require("../models/Vendor");
  const email = String(userDoc.email || "").trim().toLowerCase();

  let vendor = await Vendor.findOne({
    $or: [
      { userId: userDoc._id },
      ...(email ? [{ email }] : []),
      ...(userDoc.vendorRef ? [{ _id: userDoc.vendorRef }] : []),
    ],
  });

  if (vendor) {
    let modified = false;
    if (!vendor.userId || String(vendor.userId) !== String(userDoc._id)) {
      vendor.userId = userDoc._id;
      modified = true;
    }
    if (userDoc.clientId && !vendor.clientId) {
      vendor.clientId = userDoc.clientId;
      modified = true;
    }
    if (modified) await vendor.save();

    if (!userDoc.vendorRef || String(userDoc.vendorRef) !== String(vendor._id)) {
      userDoc.vendorRef = vendor._id;
      await userDoc.save();
    }
    return vendor;
  }

  try {
    const newVendor = await Vendor.create({
      name: String(userDoc.name || "Vendor Partner").trim(),
      companyName: userDoc.name ? `${userDoc.name} Supplies` : "Vendor Organization",
      email: email || `vendor_${userDoc._id}@retailverse.in`,
      phone: userDoc.phone || "",
      address: userDoc.address || "",
      category: "General Supplies",
      userId: userDoc._id,
      clientId: userDoc.clientId || null,
      isActive: userDoc.isActive !== false,
    });

    userDoc.vendorRef = newVendor._id;
    await userDoc.save();
    return newVendor;
  } catch (err) {
    if (err && err.code === 11000) {
      const recovered = await Vendor.findOne({ email });
      if (recovered) {
        recovered.userId = userDoc._id;
        await recovered.save();
        userDoc.vendorRef = recovered._id;
        await userDoc.save();
        return recovered;
      }
    }
    console.warn("[ensureVendorProfile] Warning:", err.message);
  }
}

/**
 * Ensures Client (+ optional Employee stub) exist when the user's role requires them.
 * Idempotent; safe to call on each authenticated request until profiles exist.
 *
 * @param {import("mongoose").Document} userDoc
 */
async function ensureRoleProfilesForUser(userDoc) {
  if (!userDoc || !userDoc.role) {
    return;
  }
  if (!isClientScopedRole(userDoc.role)) {
    return;
  }

  await ensureClientLinked(userDoc);
  await ensureEmployeeStub(userDoc);
  await ensureVendorProfile(userDoc);
}

/**
 * @param {string|import("mongoose").Types.ObjectId} userId
 */
async function ensureRoleProfilesForUserById(userId) {
  const user = await User.findById(userId).select("-password");
  if (!user) {
    return;
  }
  await ensureRoleProfilesForUser(user);
}

module.exports = {
  ensureRoleProfilesForUser,
  ensureRoleProfilesForUserById,
  syntheticGstFromObjectId,
  syntheticPanFromObjectId,
};
