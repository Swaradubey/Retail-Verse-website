const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

const ensurePrivilegedUsers = require("../utils/ensurePrivilegedUsers");

function parseMongoUriForLog(uri) {
  if (!uri || typeof uri !== "string") {
    return { host: null, dbName: null };
  }
  const trimmed = uri.trim();
  const m = trimmed.match(/^mongodb(\+srv)?:\/\/(?:[^@/]+)@([^/?]+)(?:\/([^?]*))?/);
  if (!m) {
    return { host: "(invalid URI format)", dbName: null };
  }
  const dbName = m[3] && m[3].length > 0 ? m[3] : "(default)";
  return { host: m[2], dbName };
}

let cached = global.mongooseCache;

if (!cached) {
  cached = global.mongooseCache = { connection: null, promise: null };
}

const connectDB = async () => {
  try {
    dotenv.config({ path: path.join(__dirname, "..", ".env") });
  } catch (err) {
    console.warn("[MongoDB Config] dotenv config could not be loaded:", err.message);
  }

  const rawUri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;
  const mongoUri = typeof rawUri === "string" ? rawUri.trim() : "";

  if (!mongoUri) {
    console.error(
      "[MongoDB] MONGO_URI or MONGODB_URI is missing or empty. Set it in Backend/.env (no quotes around the value)."
    );
    process.exit(1);
  }

  if (cached.connection) {
    console.log("[MongoDB] Using cached database connection");
    return cached.connection;
  }

  const { host, dbName } = parseMongoUriForLog(mongoUri);
  console.log("[MongoDB] MONGO_URI loaded (host:", host + ", database:", dbName + ")");
  console.log("[MongoDB] Connection attempt started…");

  try {
    if (!cached.promise) {
      const mongooseOptions = {
        maxPoolSize: 25, // Maintain up to 25 socket connections
        minPoolSize: 5,  // Keep at least 5 connections warm to avoid cold query latency
        socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
        serverSelectionTimeoutMS: 8000, // Keep trying to send operations for 8s
        maxIdleTimeMS: 30000, // Close connections after 30s of idle
        family: 4, // Use IPv4, skip slow IPv6 resolution on cloud hosts
      };
      cached.promise = mongoose.connect(mongoUri, mongooseOptions).then((mongooseInstance) => {
        return mongooseInstance;
      });
    }
    
    cached.connection = await cached.promise;
    console.log("[MongoDB] Connected successfully");
    await ensurePrivilegedUsers();

    // Ensure high-performance compound indexes exist in MongoDB Atlas (production safe)
    try {
      const Product = require("../models/Product");
      const Invoice = require("../models/Invoice");
      const Quote = require("../models/Quote");
      const User = require("../models/User");

      Promise.all([
        Product.createIndexes(),
        Invoice.createIndexes(),
        Quote.createIndexes(),
        User.createIndexes(),
      ]).catch((idxErr) => {
        console.warn("[MongoDB] Index build warning:", idxErr.message);
      });
    } catch (e) {}

    return cached.connection;
  } catch (error) {
    cached.promise = null;
    const name = error && error.name ? error.name : "Error";
    const msg = error && error.message ? error.message : String(error);
    console.error("[MongoDB] Connection failed");
    console.error(`  Name: ${name}`);
    console.error(`  Message: ${msg}`);
    if (error && error.reason) {
      console.error(`  Reason: ${error.reason}`);
    }
    if (/whitelist|IP|not allowed|ECONNREFUSED|ETIMEDOUT|Server selection timed out/i.test(msg)) {
      console.error(
        "[MongoDB] Hint: In Atlas → Network Access, add your current IP (or 0.0.0.0/0 only for testing)."
      );
    }
    if (/authentication failed|bad auth/i.test(msg)) {
      console.error(
        "[MongoDB] Hint: Check Database Access user/password; URL-encode special characters in the password inside the URI."
      );
    }
    process.exit(1);
  }
};

module.exports = connectDB;
