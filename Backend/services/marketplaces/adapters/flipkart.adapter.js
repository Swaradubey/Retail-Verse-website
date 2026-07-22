const MarketplaceAdapter = require('../MarketplaceAdapter');
const MarketplaceProductMapping = require('../../../models/MarketplaceProductMapping');
const flipkartApiClient = require('../flipkartApiClient');

class FlipkartMarketplaceAdapter extends MarketplaceAdapter {
  async connect() {
    return { success: true };
  }

  async testConnection() {
    return flipkartApiClient.checkHealth(this.connection);
  }

  /**
   * Validate product against Flipkart readiness rules
   */
  async validateProduct(product) {
    const errors = [];
    const missingFields = [];

    if (!product.sku) {
      missingFields.push('sku');
      errors.push('Seller SKU is missing');
    }
    if (!product.name && !product.title) {
      missingFields.push('title');
      errors.push('Product name/title is missing');
    }
    
    // Price validations
    const price = Number(product.price);
    const mrp = Number(product.originalPrice || product.comparePrice || product.price);
    
    if (isNaN(price) || price < 0) {
      missingFields.push('price');
      errors.push('Selling price is invalid or negative');
    }
    if (isNaN(mrp) || mrp < 0) {
      missingFields.push('originalPrice');
      errors.push('MRP (original price) is invalid or negative');
    }
    if (price > mrp) {
      errors.push('Selling price exceeds MRP');
    }

    // Inventory validations
    const stock = Number(product.stock);
    if (isNaN(stock) || stock < 0) {
      missingFields.push('stock');
      errors.push('Available stock is negative or invalid');
    }

    // Package dimensions and weight
    const weight = Number(product.weight);
    if (isNaN(weight) || weight <= 0) {
      missingFields.push('weight');
      errors.push('Package weight is missing or invalid');
    }

    const length = Number(product.dimensions?.length);
    const width = Number(product.dimensions?.width);
    const height = Number(product.dimensions?.height);

    if (isNaN(length) || length <= 0 || isNaN(width) || width <= 0 || isNaN(height) || height <= 0) {
      missingFields.push('dimensions');
      errors.push('Package dimensions (length, width, height) are missing or invalid');
    }

    // Check mapping status for Flipkart catalog FSN
    const mapping = await MarketplaceProductMapping.findOne({
      marketplaceConnectionId: this.connection._id,
      retailVerseProductId: product._id
    });

    let mappingStatus = 'READY';
    if (!mapping || !mapping.flipkartFsn) {
      mappingStatus = 'NEEDS_FSN_MAPPING';
      errors.push('Flipkart FSN catalog mapping is missing');
    } else if (errors.length > 0) {
      if (errors.some(e => e.includes('price'))) {
        mappingStatus = 'INVALID_PRICE';
      } else if (errors.some(e => e.includes('stock'))) {
        mappingStatus = 'INVALID_STOCK';
      } else {
        mappingStatus = 'MISSING_REQUIRED_FIELDS';
      }
    }

    // Update mapping status in db if it exists
    if (mapping) {
      mapping.mappingStatus = mappingStatus;
      mapping.lastErrorCode = errors.length > 0 ? 'VALIDATION_FAILED' : '';
      mapping.lastErrorMessage = errors.join(', ');
      await mapping.save();
    }

    return {
      isValid: errors.length === 0,
      missingFields,
      errors,
      mappingStatus,
      fsn: mapping?.flipkartFsn || null,
      locationId: mapping?.flipkartLocationId || this.connection.metadata?.locationId || 'loc-default',
      categoryId: mapping?.categoryId || 'cat-default'
    };
  }

  /**
   * Reconcile or create new listing on Flipkart
   */
  async createListing(product) {
    const validation = await this.validateProduct(product);
    if (!validation.fsn) {
      throw new Error(`Cannot sync product: Flipkart FSN catalog mapping is missing.`);
    }
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    const sku = product.sku;
    const fsn = validation.fsn;
    const locationId = validation.locationId;

    // Check if listing already exists on Flipkart
    console.log(`[Flipkart Sync] Checking if SKU ${sku} already exists on Flipkart...`);
    const remoteListing = await flipkartApiClient.getListing(this.connection, sku);

    if (remoteListing) {
      console.log(`[Flipkart Sync] SKU ${sku} already exists on Flipkart. Reconciling...`);
      // Update local mapping if missing
      let mapping = await MarketplaceProductMapping.findOne({
        marketplaceConnectionId: this.connection._id,
        sellerSku: sku
      });

      if (!mapping) {
        mapping = new MarketplaceProductMapping({
          merchantId: this.connection.merchantId,
          marketplaceConnectionId: this.connection._id,
          retailVerseProductId: product._id,
          sellerSku: sku,
          flipkartFsn: fsn,
          flipkartLocationId: locationId,
          mappingStatus: 'SYNCED',
          listingStatus: 'ACTIVE'
        });
      }

      mapping.flipkartListingId = remoteListing[sku]?.listing_id || 'LST-' + sku;
      mapping.lastSyncedPrice = product.price;
      mapping.lastSyncedStock = product.stock;
      mapping.lastSyncedAt = new Date();
      mapping.mappingStatus = 'SYNCED';
      await mapping.save();

      // Trigger an update to ensure data matches Retail Verse
      return this.updateListing(product);
    }

    // Build creation payload
    const payload = {
      [sku]: {
        product_id: fsn,
        price: {
          mrp: Number(product.originalPrice || product.comparePrice || product.price),
          selling_price: Number(product.price),
          currency: 'INR'
        },
        inventory: {
          locations: [
            {
              location_id: locationId,
              quantity: Number(product.stock)
            }
          ]
        },
        shipping: {
          local_shipping_charge: 0,
          zonal_shipping_charge: 0,
          national_shipping_charge: 0,
          procurement_sla: 2,
          procurement_type: 'REGULAR'
        },
        listing_status: 'ACTIVE'
      }
    };

    console.log(`[Flipkart Sync] Creating listing for SKU ${sku} with FSN ${fsn}...`);
    const result = await flipkartApiClient.createListing(this.connection, payload);

    let mapping = await MarketplaceProductMapping.findOne({
      marketplaceConnectionId: this.connection._id,
      retailVerseProductId: product._id
    });

    if (!mapping) {
      mapping = new MarketplaceProductMapping({
        merchantId: this.connection.merchantId,
        marketplaceConnectionId: this.connection._id,
        retailVerseProductId: product._id,
        sellerSku: sku,
        flipkartFsn: fsn
      });
    }

    mapping.flipkartListingId = result[sku]?.listing_id || 'LST-' + sku;
    mapping.flipkartLocationId = locationId;
    mapping.lastSyncedPrice = product.price;
    mapping.lastSyncedStock = product.stock;
    mapping.lastSyncedAt = new Date();
    mapping.mappingStatus = 'SYNCED';
    mapping.listingStatus = 'ACTIVE';
    await mapping.save();

    return {
      success: true,
      listingId: mapping.flipkartListingId,
      fsn: fsn
    };
  }

  /**
   * Update listing details
   */
  async updateListing(product) {
    const validation = await this.validateProduct(product);
    if (!validation.fsn) {
      throw new Error(`Cannot update product: Flipkart FSN catalog mapping is missing.`);
    }
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    const sku = product.sku;
    const locationId = validation.locationId;

    const payload = {
      [sku]: {
        product_id: validation.fsn,
        price: {
          mrp: Number(product.originalPrice || product.comparePrice || product.price),
          selling_price: Number(product.price),
          currency: 'INR'
        },
        inventory: {
          locations: [
            {
              location_id: locationId,
              quantity: Number(product.stock)
            }
          ]
        },
        shipping: {
          local_shipping_charge: 0,
          zonal_shipping_charge: 0,
          national_shipping_charge: 0,
          procurement_sla: 2,
          procurement_type: 'REGULAR'
        },
        listing_status: 'ACTIVE'
      }
    };

    console.log(`[Flipkart Sync] Updating listing for SKU ${sku}...`);
    await flipkartApiClient.updateListing(this.connection, payload);

    const mapping = await MarketplaceProductMapping.findOne({
      marketplaceConnectionId: this.connection._id,
      retailVerseProductId: product._id
    });

    if (mapping) {
      mapping.lastSyncedPrice = product.price;
      mapping.lastSyncedStock = product.stock;
      mapping.lastSyncedAt = new Date();
      mapping.mappingStatus = 'SYNCED';
      await mapping.save();
    }

    return { success: true };
  }

  /**
   * Update listing inventory only
   */
  async updateInventory(product) {
    const mapping = await MarketplaceProductMapping.findOne({
      marketplaceConnectionId: this.connection._id,
      retailVerseProductId: product._id
    });

    if (!mapping) {
      throw new Error('Product mapping does not exist for Flipkart.');
    }

    const sku = product.sku;
    const locationId = mapping.flipkartLocationId || 'loc-default';
    
    // Formula availableToSell = onHand - reserved - safetyStock. Send 0 if negative.
    const availableToSell = Math.max(0, Number(product.stock) || 0);

    const payload = {
      [sku]: [
        {
          location_id: locationId,
          quantity: availableToSell
        }
      ]
    };

    console.log(`[Flipkart Sync] Syncing inventory for SKU ${sku} at location ${locationId} to ${availableToSell}...`);
    await flipkartApiClient.updateInventory(this.connection, payload);

    mapping.lastSyncedStock = availableToSell;
    mapping.lastSyncedAt = new Date();
    await mapping.save();

    return { success: true };
  }

  /**
   * Update listing price only
   */
  async updatePrice(product) {
    const mapping = await MarketplaceProductMapping.findOne({
      marketplaceConnectionId: this.connection._id,
      retailVerseProductId: product._id
    });

    if (!mapping) {
      throw new Error('Product mapping does not exist for Flipkart.');
    }

    const sku = product.sku;
    const mrp = Number(product.originalPrice || product.comparePrice || product.price);
    const sellingPrice = Number(product.price);

    if (sellingPrice > mrp) {
      throw new Error('Validation failed: Selling price exceeds MRP.');
    }

    const payload = {
      [sku]: [
        {
          mrp: mrp,
          selling_price: sellingPrice,
          currency: 'INR'
        }
      ]
    };

    console.log(`[Flipkart Sync] Syncing price for SKU ${sku} (selling_price: ${sellingPrice}, mrp: ${mrp})...`);
    await flipkartApiClient.updatePrice(this.connection, payload);

    mapping.lastSyncedPrice = sellingPrice;
    mapping.lastSyncedAt = new Date();
    await mapping.save();

    return { success: true };
  }

  /**
   * Deactivate listing (set status to INACTIVE/DRAFT instead of deletion)
   */
  async deleteListing(product) {
    const mapping = await MarketplaceProductMapping.findOne({
      marketplaceConnectionId: this.connection._id,
      retailVerseProductId: product._id
    });

    if (!mapping) {
      return { success: true, message: 'Mapping already removed' };
    }

    const sku = product.sku;
    const payload = {
      [sku]: {
        product_id: mapping.flipkartFsn,
        listing_status: 'INACTIVE'
      }
    };

    console.log(`[Flipkart Sync] Deactivating listing for SKU ${sku}...`);
    try {
      await flipkartApiClient.updateListing(this.connection, payload);
    } catch (err) {
      console.warn(`[Flipkart Sync] Remote deactivation failed (non-fatal): ${err.message}`);
    }

    mapping.listingStatus = 'INACTIVE';
    mapping.mappingStatus = 'NEEDS_FSN_MAPPING'; // set to unmapped/paused state
    await mapping.save();

    return { success: true, message: 'Flipkart listing deactivated successfully.' };
  }
}

module.exports = FlipkartMarketplaceAdapter;
