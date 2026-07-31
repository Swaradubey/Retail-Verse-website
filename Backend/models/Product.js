const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },
    sku: {
      type: String,
      required: [true, "SKU is required"],
      unique: true,
      trim: true,
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
    },
    originalPrice: {
      type: Number,
      min: [0, "Original price cannot be negative"],
    },
    stock: {
      type: Number,
      required: [true, "Stock level is required"],
      default: 0,
      min: [0, "Stock cannot be negative"],
    },
    image: {
      type: String,
      default: "",
    },
    description: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    isOnSale: {
      type: Boolean,
      default: false,
    },
    salePercentage: {
      type: Number,
      default: 0,
      min: [0, "Sale percentage cannot be negative"],
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
    },
    clientName: {
      type: String,
      default: "",
    },
    merchantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    barcode: {
      type: String,
      default: "",
      trim: true,
    },
    title: {
      type: String,
      default: "",
    },
    brand: {
      type: String,
      default: "",
    },
    tags: {
      type: [String],
      default: [],
    },
    images: {
      type: [String],
      default: [],
    },
    comparePrice: {
      type: Number,
      default: 0,
    },
    quantity: {
      type: Number,
      default: 0,
    },
    weight: {
      type: Number,
      default: 0,
    },
    dimensions: {
      width: { type: Number, default: 0 },
      height: { type: Number, default: 0 },
      length: { type: Number, default: 0 },
    },
    status: {
      type: String,
      enum: ["active", "draft", "archived", "pending", "syncing", "success", "failed"],
      default: "active",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdByRole: {
      type: String,
      default: "",
    },
    rating: {
      type: Number,
      default: 0,
    },
    numReviews: {
      type: Number,
      default: 0,
    },
    reviews: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        rating: {
          type: Number,
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        updatedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    skipShopifySync: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true,
  }
);

const computeSaleData = (docLike) => {
  const price = Number(docLike.price);
  const originalPrice = Number(docLike.originalPrice);
  const hasValidDiscount =
    Number.isFinite(price) &&
    Number.isFinite(originalPrice) &&
    originalPrice > 0 &&
    originalPrice > price;

  if (hasValidDiscount) {
    const percent = Math.round(((originalPrice - price) / originalPrice) * 100);
    docLike.isOnSale = true;
    docLike.salePercentage = Math.max(0, percent);
    return;
  }

  docLike.isOnSale = false;
  docLike.salePercentage = 0;
};

productSchema.pre("save", function (next) {
  this._isNewProduct = this.isNew;
  this._stockChanged = this.isModified("stock");
  this._priceChanged = this.isModified("price");
  this._productUpdated = !this.isNew && (
    this.isModified("name") ||
    this.isModified("description") ||
    this.isModified("category") ||
    this.isModified("images") ||
    this.isModified("image") ||
    this.isModified("brand") ||
    this.isModified("weight") ||
    this.isModified("barcode") ||
    this.isModified("comparePrice") ||
    this.isModified("originalPrice") ||
    this.isModified("tags")
  );
  this._tagsChanged = !this.isNew && this.isModified("tags");
  this._isActiveChanged = !this.isNew && this.isModified("isActive");

  computeSaleData(this);

  // Sync title and name
  if (this.name && !this.title) {
    this.title = this.name;
  } else if (this.title && !this.name) {
    this.name = this.title;
  }

  // Sync quantity and stock
  if (this.stock !== undefined && (this.quantity === undefined || this.quantity === 0)) {
    this.quantity = this.stock;
  } else if (this.quantity !== undefined && (this.stock === undefined || this.stock === 0)) {
    this.stock = this.quantity;
  }

  // Sync comparePrice and originalPrice
  if (this.originalPrice !== undefined && (this.comparePrice === undefined || this.comparePrice === 0)) {
    this.comparePrice = this.originalPrice;
  } else if (this.comparePrice !== undefined && (this.originalPrice === undefined || this.originalPrice === 0)) {
    this.originalPrice = this.comparePrice;
  }

  // Sync images and image
  if (this.image && (!this.images || this.images.length === 0)) {
    this.images = [this.image];
  } else if (this.images && this.images.length > 0 && !this.image) {
    this.image = this.images[0];
  }

  // Sync merchantId and createdBy
  if (!this.merchantId && this.createdBy) {
    this.merchantId = this.createdBy;
  } else if (this.merchantId && !this.createdBy) {
    this.createdBy = this.merchantId;
  }

  next();
});

productSchema.post("save", async function (doc) {
  if (doc.skipShopifySync) {
    console.log(`[Product Hook] skipShopifySync is true for SKU ${doc.sku}. Skipping auto-sync.`);
    // Reset skipShopifySync in the DB silently without triggering hooks again
    try {
      await mongoose.model("Product").updateOne({ _id: doc._id }, { $set: { skipShopifySync: false } });
    } catch (e) {
      console.error("[Product Hook] Failed to reset skipShopifySync:", e.message);
    }
    return;
  }

  try {
    const MarketplaceConnection = mongoose.model("MarketplaceConnection");
    const MarketplaceSyncJobService = require("../services/MarketplaceSyncJobService");

    // Try all possible owner IDs for backward compatibility
    const ownerIds = [doc.merchantId, doc.clientId, doc.createdBy].filter(Boolean);

    const connections = await MarketplaceConnection.find({
      merchantId: { $in: ownerIds },
      marketplace: { $in: ["shopify", "flipkart", "FLIPKART"] },
      status: "connected",
      isSyncEnabled: true
    });

    for (const conn of connections) {
      const marketplace = conn.marketplace.toLowerCase() === 'flipkart' ? 'flipkart' : conn.marketplace;
      if (doc._isNewProduct) {
        await MarketplaceSyncJobService.createJob({
          merchantId: conn.merchantId,
          productId: doc._id,
          marketplace,
          operation: "CREATE_LISTING"
        });
      } else {
        if (doc._isActiveChanged) {
          // Unpublish/archive or publish based on isActive state
          if (doc.isActive === false) {
            await MarketplaceSyncJobService.createJob({
              merchantId: conn.merchantId,
              productId: doc._id,
              marketplace,
              operation: "DELETE_LISTING"
            });
          } else {
            await MarketplaceSyncJobService.createJob({
              merchantId: conn.merchantId,
              productId: doc._id,
              marketplace,
              operation: "UPDATE_LISTING"
            });
          }
        }
        if (doc._productUpdated) {
          await MarketplaceSyncJobService.createJob({
            merchantId: conn.merchantId,
            productId: doc._id,
            marketplace,
            operation: "UPDATE_LISTING"
          });
        }
        if (doc._stockChanged) {
          await MarketplaceSyncJobService.createJob({
            merchantId: conn.merchantId,
            productId: doc._id,
            marketplace,
            operation: "UPDATE_INVENTORY"
          });
        }
        if (doc._priceChanged) {
          await MarketplaceSyncJobService.createJob({
            merchantId: conn.merchantId,
            productId: doc._id,
            marketplace,
            operation: "UPDATE_PRICE"
          });
        }
      }

      // Immediately trigger inline Shopify sync for instant synchronization
      if (marketplace === 'shopify') {
        try {
          const shopifySyncService = require("../services/shopifySyncService");
          const { decryptSecret } = require("../lib/marketplaces/encryption");
          const shopDomain = conn.storeUrl || conn.shopDomain;
          const accessToken = conn.credentials?.encryptedAccessToken ? decryptSecret(conn.credentials.encryptedAccessToken) : null;
          if (shopDomain && accessToken) {
            shopifySyncService.syncSingleProductInline(doc, conn, shopDomain, accessToken).catch(err => {
              console.warn(`[Product Hook] Auto-sync inline Shopify error for SKU ${doc.sku}:`, err.message);
            });
          }
        } catch (inlineErr) {
          console.warn("[Product Hook] Failed inline Shopify sync trigger:", inlineErr.message);
        }
      }
    }
  } catch (err) {
    console.error("[Product Hook] post-save error:", err.message);
  }
});

productSchema.post("findOneAndDelete", async function (doc) {
  if (!doc) return;
  try {
    const MarketplaceConnection = mongoose.model("MarketplaceConnection");
    const MarketplaceSyncJobService = require("../services/MarketplaceSyncJobService");

    // Try all possible owner IDs for backward compatibility
    const ownerIds = [doc.merchantId, doc.clientId, doc.createdBy].filter(Boolean);

    const connections = await MarketplaceConnection.find({
      merchantId: { $in: ownerIds },
      marketplace: { $in: ["shopify", "flipkart", "FLIPKART"] },
      status: "connected",
      isSyncEnabled: true
    });

    for (const conn of connections) {
      const marketplace = conn.marketplace.toLowerCase() === 'flipkart' ? 'flipkart' : conn.marketplace;
      await MarketplaceSyncJobService.createJob({
        merchantId: conn.merchantId,
        productId: doc._id,
        marketplace,
        operation: "DELETE_LISTING"
      });
    }
  } catch (err) {
    console.error("[Product Hook] post-delete error:", err.message);
  }
});

productSchema.index({ barcode: 1 });
productSchema.index({ clientId: 1, barcode: 1 });

module.exports = mongoose.model("Product", productSchema);
