const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const Client = require("../models/Client");
const ClientRazorpayConfig = require("../models/ClientRazorpayConfig");
const { encrypt, decrypt } = require("../utils/encryption");
const { createRazorpayOrder, verifyRazorpayPayment } = require("../controllers/paymentController");

async function runTests() {
  console.log("=== STARTING RAZORPAY INTEGRATION TESTS ===");

  // 1. Test Encryption/Decryption
  console.log("\n[TEST 1] Testing Encryption/Decryption Utility...");
  const secret = "test_key_secret_123456";
  const encrypted = encrypt(secret);
  const decrypted = decrypt(encrypted);

  if (decrypted === secret) {
    console.log("✔ Encryption/Decryption match!");
  } else {
    console.error("❌ Encryption/Decryption mismatch! Expected:", secret, "Got:", decrypted);
    process.exit(1);
  }

  // 2. Connect to MongoDB
  console.log("\n[TEST 2] Connecting to MongoDB database...");
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("❌ MONGO_URI is not set in .env");
    process.exit(1);
  }
  await mongoose.connect(mongoUri);
  console.log("✔ Connected to MongoDB successfully.");

  try {
    // 3. Test Database Model CRUD & Unique index
    console.log("\n[TEST 3] Testing ClientRazorpayConfig database model...");
    // Find or create a mock client
    let client = await Client.findOne();
    if (!client) {
      console.log("No client found in database. Creating a mock client...");
      client = await Client.create({
        companyName: "Test Company Ltd",
        gst: "07AAAAA1111A1Z1",
        phone: "9999999999",
        email: "testcompany@example.com",
      });
      console.log("✔ Created mock client ID:", client._id);
    } else {
      console.log("✔ Found existing client ID:", client._id);
    }

    // Clear any existing config for this client
    await ClientRazorpayConfig.deleteOne({ clientId: client._id });

    // Create a new config
    const rawKeyId = "rzp_test_mock_key_id";
    const rawSecret = "rzp_test_mock_secret_key";
    const webhookSecret = "webhook_secret_value";

    const config = await ClientRazorpayConfig.create({
      clientId: client._id,
      razorpayEnabled: true,
      razorpayKeyId: rawKeyId,
      razorpayKeySecretEncrypted: encrypt(rawSecret),
      webhookSecretEncrypted: encrypt(webhookSecret),
      isConnected: true,
    });

    console.log("✔ Saved ClientRazorpayConfig successfully.");

    // Retrieve and verify decryption
    const savedConfig = await ClientRazorpayConfig.findOne({ clientId: client._id });
    const decSecret = decrypt(savedConfig.razorpayKeySecretEncrypted);
    const decWebhook = decrypt(savedConfig.webhookSecretEncrypted);

    if (decSecret === rawSecret && decWebhook === webhookSecret) {
      console.log("✔ Decrypted values retrieved from DB match original values!");
    } else {
      console.error("❌ Decrypted value mismatch!");
      process.exit(1);
    }

    // 4. Test client-specific payment fallback / logic
    console.log("\n[TEST 4] Simulating Client-Specific Payment Resolution...");
    // We will simulate the request object
    const req = {
      clientId: client._id.toString(),
      body: {
        amount: 10,
        currency: "INR",
      },
    };

    let resolvedClientId = req.clientId;
    const clientConfig = await ClientRazorpayConfig.findOne({
      clientId: resolvedClientId,
      razorpayEnabled: true,
    });

    if (clientConfig && clientConfig.razorpayKeyId && clientConfig.razorpayKeySecretEncrypted) {
      const decSec = decrypt(clientConfig.razorpayKeySecretEncrypted);
      console.log("✔ Successfully resolved client-specific Razorpay Key ID:", clientConfig.razorpayKeyId);
      console.log("✔ Successfully decrypted Key Secret (Masked output):", decSec.substring(0, 4) + "...");
    } else {
      console.error("❌ Failed to resolve client config!");
      process.exit(1);
    }

    // Clean up mock config if it was created
    await ClientRazorpayConfig.deleteOne({ clientId: client._id });
    console.log("\n✔ Cleanup completed successfully.");

  } catch (err) {
    console.error("❌ Error running Mongoose tests:", err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("✔ Disconnected from MongoDB.");
  }

  console.log("\n=== ALL TESTS PASSED SUCCESSFULLY ===");
}

runTests();
