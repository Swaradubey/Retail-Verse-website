const mongoose = require('mongoose');

/**
 * Returns the canonical merchant ID for the authenticated user.
 * When clientId exists, it's the Client document _id (tenant-level).
 * Otherwise, it falls back to the User's own _id.
 */
function getMerchantId(req) {
  return req.user?.clientId || req.user?.id || req.user?._id;
}

/**
 * Returns ALL possible merchant ID candidates for backward compatibility.
 * This handles the case where connections were created under a legacy
 * identity (e.g., User _id) before clientId was assigned.
 */
function getMerchantIdCandidates(req) {
  const candidates = [];
  if (req.user?.clientId) candidates.push(String(req.user.clientId));
  if (req.user?.id) candidates.push(String(req.user.id));
  if (req.user?._id) {
    const s = String(req.user._id);
    if (!candidates.includes(s)) candidates.push(s);
  }
  return [...new Set(candidates)];
}

/**
 * Find a document with merchantId fallback across all candidate IDs.
 * If found under a legacy ID, automatically migrates to the canonical ID.
 *
 * @param {Model} model - Mongoose model to query
 * @param {Object} baseQuery - Query fields (excluding merchantId)
 * @param {string[]} merchantCandidates - Ordered list of merchant IDs to try
 * @returns {Promise<Object|null>} Found document, or null
 */
async function findWithMerchantFallback(model, baseQuery, merchantCandidates) {
  if (!merchantCandidates || merchantCandidates.length === 0) return null;

  const canonicalId = merchantCandidates[0];

  for (const mid of merchantCandidates) {
    const doc = await model.findOne({ ...baseQuery, merchantId: mid });
    if (doc) {
      // Migrate if stored under a legacy merchantId
      if (String(doc.merchantId) !== String(canonicalId)) {
        console.log(`[Merchant Migration] Migrating ${model.modelName || 'document'} ${doc._id} from merchantId ${doc.merchantId} -> ${canonicalId}`);
        await model.updateOne({ _id: doc._id }, { $set: { merchantId: canonicalId } });
      }
      return doc;
    }
  }
  return null;
}

/**
 * Build a merchant filter object that matches any candidate ID.
 */
function merchantFilter(req) {
  const ids = getMerchantIdCandidates(req);
  return ids.length > 0 ? { merchantId: { $in: ids } } : { merchantId: null };
}

module.exports = {
  getMerchantId,
  getMerchantIdCandidates,
  findWithMerchantFallback,
  merchantFilter
};
