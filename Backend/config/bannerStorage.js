const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// Ensure local uploads/banners directory exists
const localBannersDir = path.resolve(__dirname, "../uploads/banners");
try {
  if (!fs.existsSync(localBannersDir)) {
    fs.mkdirSync(localBannersDir, { recursive: true });
  }
} catch (err) {
  console.warn("[BannerStorage] Failed to create local banners directory:", err.message);
}

// Check Cloudinary configuration safely without crashing if module is missing
let cloudinaryClient = null;
const hasCloudinaryEnv = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (hasCloudinaryEnv) {
  try {
    const cloudinary = require("cloudinary").v2;
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    cloudinaryClient = cloudinary;
    console.log("[BannerStorage] Cloudinary storage configured successfully.");
  } catch (err) {
    console.warn(
      "[BannerStorage] Cloudinary env detected but cloudinary package could not be initialized. Falling back to local disk storage. Error:",
      err.message
    );
    cloudinaryClient = null;
  }
} else {
  console.log("[BannerStorage] Using local disk storage at uploads/banners/");
}

// Multer Disk Storage Configuration (Local Fallback & Default)
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, localBannersDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const fieldPrefix = file.fieldname === "mobileImage" ? "mobile" : "desktop";
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    cb(null, `banner-${fieldPrefix}-${uniqueSuffix}${ext}`);
  },
});

// Multer Allowed Formats & File Filter
const allowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
];

const fileFilter = (req, file, cb) => {
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file format. Only JPG, PNG, WEBP, and AVIF image files under 5MB are allowed."
      )
    );
  }
};

// Base Multer Instance (5MB limit)
const upload = multer({
  storage: diskStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter,
});

// Middleware for uploading 'image' (desktop) and optional 'mobileImage' (mobile cutout)
const bannerUploadFields = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "mobileImage", maxCount: 1 },
]);

/**
 * Middleware wrapper to handle multer errors gracefully
 */
const uploadBannerImages = (req, res, next) => {
  bannerUploadFields(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          message: "Uploaded image file exceeds the 5MB size limit.",
        });
      }
      return res.status(400).json({
        success: false,
        message: `Upload error: ${err.message}`,
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || "Failed to process image upload.",
      });
    }
    next();
  });
};

/**
 * Process uploaded files:
 * Upload desktop and mobile images concurrently via Promise.all() to eliminate waterfall delays.
 * Uses non-blocking asynchronous fs calls to avoid starving Node.js event loop.
 */
async function processBannerUploads(req) {
  const result = {
    imageUrl: req.body.imageUrl || "",
    mobileImageUrl: req.body.mobileImageUrl || "",
  };

  const desktopFile = req.files && req.files.image ? req.files.image[0] : null;
  const mobileFile = req.files && req.files.mobileImage ? req.files.mobileImage[0] : null;

  const uploadTasks = [];

  // Parallel upload 1: Desktop artwork
  if (desktopFile) {
    if (cloudinaryClient) {
      uploadTasks.push(
        cloudinaryClient.uploader
          .upload(desktopFile.path, {
            folder: "banners",
            resource_type: "image",
          })
          .then((uploadRes) => {
            result.imageUrl = uploadRes.secure_url;
            fs.promises.unlink(desktopFile.path).catch(() => {});
          })
          .catch((cloudErr) => {
            console.warn("[BannerStorage] Cloudinary desktop upload failed, using local fallback:", cloudErr.message);
            result.imageUrl = `/uploads/banners/${desktopFile.filename}`;
          })
      );
    } else {
      result.imageUrl = `/uploads/banners/${desktopFile.filename}`;
    }
  }

  // Parallel upload 2: Mobile artwork
  if (mobileFile) {
    if (cloudinaryClient) {
      uploadTasks.push(
        cloudinaryClient.uploader
          .upload(mobileFile.path, {
            folder: "banners/mobile",
            resource_type: "image",
          })
          .then((uploadRes) => {
            result.mobileImageUrl = uploadRes.secure_url;
            fs.promises.unlink(mobileFile.path).catch(() => {});
          })
          .catch((cloudErr) => {
            console.warn("[BannerStorage] Cloudinary mobile upload failed, using local fallback:", cloudErr.message);
            result.mobileImageUrl = `/uploads/banners/${mobileFile.filename}`;
          })
      );
    } else {
      result.mobileImageUrl = `/uploads/banners/${mobileFile.filename}`;
    }
  }

  // Await both uploads in parallel if any
  if (uploadTasks.length > 0) {
    await Promise.all(uploadTasks);
  }

  return result;
}

/**
 * Utility to delete local stored images if banners are deleted or replaced (non-blocking)
 */
function deleteStoredImage(fileUrl) {
  if (!fileUrl || typeof fileUrl !== "string") return;
  if (fileUrl.startsWith("/uploads/banners/")) {
    const filename = path.basename(fileUrl);
    const fullPath = path.join(localBannersDir, filename);
    fs.unlink(fullPath, (err) => {
      if (err && err.code !== "ENOENT") {
        console.warn("[BannerStorage] Could not delete image:", err.message);
      }
    });
  }
}

module.exports = {
  uploadBannerImages,
  processBannerUploads,
  deleteStoredImage,
  localBannersDir,
};
