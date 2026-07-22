const express = require("express");
const router = express.Router();
const MarketplaceSyncJob = require("../models/MarketplaceSyncJob");
const MarketplaceSyncJobService = require("../services/MarketplaceSyncJobService");
const { protect } = require("../middleware/authMiddleware");
const { getMerchantId, merchantFilter } = require("../utils/merchantHelper");

// GET /api/marketplace-sync/jobs
router.get("/", protect, async (req, res) => {
  try {
    const { productId, marketplace, status, operation } = req.query;
    
    const merchantId = getMerchantId(req);
    const query = merchantFilter(req);
    
    if (productId) query.productId = productId;
    if (marketplace) query.marketplace = marketplace;
    if (status) query.status = status;
    if (operation) query.operation = operation;

    const jobs = await MarketplaceSyncJob.find(query).sort("-createdAt");

    // Remove sensitive data before sending
    const sanitizedJobs = jobs.map(job => {
      const j = job.toObject();
      if (j.result && j.result.accessToken) delete j.result.accessToken;
      if (j.payload && j.payload.accessToken) delete j.payload.accessToken;
      return j;
    });

    res.json({ success: true, count: sanitizedJobs.length, data: sanitizedJobs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/marketplace-sync/jobs/:jobId
router.get("/:jobId", protect, async (req, res) => {
  try {
    const merchantId = getMerchantId(req);
    const job = await MarketplaceSyncJob.findOne({ _id: req.params.jobId, ...merchantFilter(req) });

    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    const sanitizedJob = job.toObject();
    if (sanitizedJob.result && sanitizedJob.result.accessToken) delete sanitizedJob.result.accessToken;
    if (sanitizedJob.payload && sanitizedJob.payload.accessToken) delete sanitizedJob.payload.accessToken;

    res.json({ success: true, data: sanitizedJob });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/marketplace-sync/jobs/:jobId/retry
router.post("/:jobId/retry", protect, async (req, res) => {
  try {
    const merchantId = getMerchantId(req);
    const job = await MarketplaceSyncJob.findOne({ _id: req.params.jobId, ...merchantFilter(req) });

    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    if (job.status !== "failed" && job.status !== "retry_scheduled") {
      return res.status(400).json({ success: false, message: "Only failed or scheduled jobs can be retried manually" });
    }

    job.status = "pending";
    job.availableAt = new Date();
    job.lockedAt = null;
    job.lockedBy = null;
    await job.save();

    // Trigger immediate async processing without awaiting
    MarketplaceSyncJobService.processJob(job._id).catch(err => {
      console.error(`[JobRetry] Direct process error for job ${job._id}:`, err.message);
    });

    res.json({ success: true, message: "Job retry initiated", data: job });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
