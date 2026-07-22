const mongoose = require("mongoose");
const MarketplaceSyncJobService = require("../services/MarketplaceSyncJobService");

let isRunning = true;
let isPolling = false;

async function runWorker() {
  console.log("[MarketplaceSyncWorker] Worker started. Polling MongoDB for jobs...");

  // Setup graceful shutdown
  const shutdown = () => {
    console.log("[MarketplaceSyncWorker] Shutting down cleanly...");
    isRunning = false;
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  while (isRunning) {
    if (!isPolling) {
      isPolling = true;
      try {
        await MarketplaceSyncJobService.releaseStaleLocks();
        await MarketplaceSyncJobService.processPendingJobs();
      } catch (error) {
        console.error("[MarketplaceSyncWorker] Error during polling cycle:", error.message);
      } finally {
        isPolling = false;
      }
    }

    // Wait 5 seconds before next poll
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  console.log("[MarketplaceSyncWorker] Worker exited.");
  process.exit(0);
}

// Check if running as a standalone script
if (require.main === module) {
  require("dotenv").config();
  const connectDB = require("../config/db");
  connectDB().then(() => runWorker());
}

module.exports = { runWorker };
