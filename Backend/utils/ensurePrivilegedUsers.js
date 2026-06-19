const mongoose = require("mongoose");
const User = require("../models/User");
const {
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PASSWORD,
} = require("./authConstants");


function logSeedContext() {
  const dbName =
    mongoose.connection &&
    mongoose.connection.db &&
    typeof mongoose.connection.db.databaseName === "string"
      ? mongoose.connection.db.databaseName
      : "(unknown)";
  const collName =
    User.collection &&
    typeof User.collection.collectionName === "string"
      ? User.collection.collectionName
      : "users";
  console.log(
    `[Seed] MongoDB database: "${dbName}", User model collection: "${collName}"`
  );
}

/**
 * Ensures the Super Admin account exists (idempotent).
 * Normal Admin accounts are created dynamically by the Super Admin through the admin-management flow.
 * Called once after MongoDB connects.
 */
async function ensurePrivilegedUsers() {
  logSeedContext();

  try {
    let superAdminUser = await User.findByNormalizedEmail(SUPER_ADMIN_EMAIL);
    if (!superAdminUser) {
      console.log("[Seed] Super Admin user not in DB, creating...");
      const created = await User.create({
        name: "Super Admin",
        email: SUPER_ADMIN_EMAIL,
        password: SUPER_ADMIN_PASSWORD,
        role: "super_admin",
        isActive: true,
      });
      console.log(
        "[Seed] Super Admin created successfully:",
        SUPER_ADMIN_EMAIL,
        "id=",
        String(created._id)
      );
    } else {
      let needsSave = false;
      if (superAdminUser.email !== SUPER_ADMIN_EMAIL) {
        superAdminUser.email = SUPER_ADMIN_EMAIL;
        needsSave = true;
        console.log(
          "[Seed] Super Admin email normalized to lowercase:",
          SUPER_ADMIN_EMAIL
        );
      }
      if (superAdminUser.role !== "super_admin") {
        superAdminUser.role = "super_admin";
        needsSave = true;
        console.log(
          "[Seed] Super Admin role restored for:",
          SUPER_ADMIN_EMAIL
        );
      }
      if (needsSave) {
        await superAdminUser.save();
      } else {
        console.log(
          "[Seed] Super Admin already present, skipping create:",
          SUPER_ADMIN_EMAIL
        );
      }
    }
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    console.error("[Seed] Failed to create Super Admin:", msg);
    if (err && err.code === 11000) {
      console.error(
        "[Seed] Duplicate key (email). Another user may already use this address — check MongoDB for mixed-case duplicates."
      );
    }
    if (err && err.stack) {
      console.error(err.stack);
    }
  }
}

module.exports = ensurePrivilegedUsers;
