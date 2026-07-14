/**
 * Product Matching Service — matches spoken product names from the AI extraction
 * against real store products from the database.
 *
 * Matching strategy (in order of confidence):
 * 1. Exact match on product name (case-insensitive)
 * 2. Exact match on SKU
 * 3. AI-provided matchedProductId (validated against store products)
 * 4. Normalised name comparison (strip punctuation, extra spaces)
 * 5. Fuzzy Levenshtein distance matching
 *
 * Returns enriched items with DB-confirmed product info.
 * Never trusts AI-provided prices, stock, or IDs without DB verification.
 */

const mongoose = require("mongoose");

/**
 * Levenshtein distance (edit distance) between two strings.
 * Pure JS — no external dependency needed.
 */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [i];
    for (let j = 1; j <= n; j++) {
      if (i === 0) {
        dp[i][j] = j;
      } else if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Normalise a product name for comparison:
 * - Lowercase
 * - Remove punctuation
 * - Collapse whitespace
 * - Remove common filler words
 */
function normaliseName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Similarity score between two strings (0–1, higher = more similar).
 */
function similarity(a, b) {
  const na = normaliseName(a);
  const nb = normaliseName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(na, nb);
  return 1 - dist / maxLen;
}

/**
 * Parse spoken quantity strings into numbers.
 * "two" → 2, "a pair" → 2, "half dozen" → 6, etc.
 * Returns null if parsing is ambiguous.
 */
function parseSpokenQuantity(qty) {
  if (typeof qty === "number" && !isNaN(qty) && qty > 0) return Math.round(qty);
  const s = String(qty || "").toLowerCase().trim();
  const WORD_MAP = {
    "one": 1, "a": 1, "an": 1, "single": 1,
    "two": 2, "a pair": 2, "pair": 2, "couple": 2,
    "three": 3, "triple": 3,
    "four": 4, "four pack": 4,
    "five": 5,
    "six": 6, "half dozen": 6, "half a dozen": 6,
    "seven": 7, "eight": 8, "nine": 9,
    "ten": 10, "dozen": 12, "a dozen": 12,
    "twenty": 20, "twenty-four": 24, "twenty four": 24,
    "fifty": 50, "hundred": 100,
  };
  if (WORD_MAP[s] !== undefined) return WORD_MAP[s];
  const n = parseFloat(s);
  if (!isNaN(n) && n > 0) return Math.round(n);
  return null;
}

/**
 * Match a single extracted item against the store product list.
 *
 * @param {object} extractedItem  Item from AI extraction
 * @param {Array}  products       All active products for the store (from DB)
 * @returns {object}              Enriched item with matchedProduct and confidence
 */
function matchSingleItem(extractedItem, products) {
  // Guarantee spokenName is always a non-empty string — DB schema requires it.
  const rawSpokenName = extractedItem.spokenName || extractedItem.name || "";
  const spokenName = String(rawSpokenName).trim() || "unknown item";
  const aiMatchId = extractedItem.matchedProductId;

  const scores = products.map((p) => {
    let score = 0;

    // 1. Exact name match
    if (normaliseName(p.name) === normaliseName(spokenName)) {
      score = 1.0;
    }
    // 2. Exact SKU match
    else if (
      p.sku &&
      normaliseName(p.sku) === normaliseName(spokenName)
    ) {
      score = 0.98;
    }
    // 3. AI provided a matching product ID that belongs to this store
    else if (aiMatchId && String(p._id) === String(aiMatchId)) {
      score = Math.max(extractedItem.confidence || 0.5, 0.5);
    }
    // 4. Fuzzy match on name
    else {
      score = similarity(spokenName, p.name);
    }

    return { product: p, score };
  });

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  const best = scores[0];
  const CONFIDENCE_THRESHOLD = 0.4;

  const quantity = parseSpokenQuantity(extractedItem.requestedQuantity) || 1;
  const quantityAmbiguous =
    parseSpokenQuantity(extractedItem.requestedQuantity) === null;

  const alternatives = scores
    .slice(1, 4)
    .filter((s) => s.score >= CONFIDENCE_THRESHOLD)
    .map((s) => String(s.product._id));

  if (!best || best.score < CONFIDENCE_THRESHOLD) {
    return {
      spokenName,
      requestedQuantity: quantity,
      quantityAmbiguous,
      requestedUnit: extractedItem.requestedUnit || null,
      matchedProductId: null,
      matchedProductName: null,
      matchedProductPrice: null,
      matchedProductStock: null,
      matchedProductIsActive: null,
      confidence: best ? best.score : 0,
      alternativeProductIds: alternatives,
      notes: extractedItem.notes || null,
      manuallyOverridden: false,
      requiresReview: true,
      reviewWarning: `Could not find a product matching "${spokenName}" in your store.`,
    };
  }

  const mp = best.product;
  return {
    spokenName,
    requestedQuantity: quantity,
    quantityAmbiguous,
    requestedUnit: extractedItem.requestedUnit || null,
    matchedProductId: String(mp._id),
    matchedProductName: mp.name,
    matchedProductPrice: mp.price, // from DB — NOT from AI
    matchedProductStock: mp.stock,
    matchedProductIsActive: mp.isActive,
    confidence: best.score,
    alternativeProductIds: alternatives,
    notes: extractedItem.notes || null,
    manuallyOverridden: false,
    requiresReview:
      best.score < 0.7 ||
      quantityAmbiguous ||
      !mp.isActive ||
      mp.stock <= 0,
    reviewWarning: !mp.isActive
      ? `"${mp.name}" is inactive.`
      : mp.stock <= 0
      ? `"${mp.name}" appears to be out of stock.`
      : best.score < 0.7
      ? `Low confidence match (${Math.round(best.score * 100)}%) for "${spokenName}" → "${mp.name}".`
      : quantityAmbiguous
      ? `Quantity for "${spokenName}" was unclear — please verify.`
      : null,
  };
}

/**
 * Match all extracted items against store products.
 *
 * @param {Array}  extractedItems  Items from AI extraction
 * @param {Array}  storeProducts   Active products for this store (from DB)
 * @returns {Array}                Resolved items with DB-backed product info
 */
function matchItems(extractedItems, storeProducts) {
  if (!Array.isArray(extractedItems) || extractedItems.length === 0) return [];
  return extractedItems.map((item) => matchSingleItem(item, storeProducts));
}

/**
 * Re-validate resolved items just before order confirmation.
 * Re-fetches prices and stock from the current DB snapshot.
 *
 * @param {Array}  resolvedItems  Items as stored on the VoiceOrder
 * @param {Array}  liveProducts   Fresh products from DB (same store)
 * @returns {{ valid: boolean; items: Array; errors: string[] }}
 */
function revalidateItemsForConfirmation(resolvedItems, liveProducts) {
  const productMap = new Map(liveProducts.map((p) => [String(p._id), p]));
  const errors = [];
  const revalidated = resolvedItems.map((item) => {
    // Normalise the item to a plain object first so that spread and property
    // access are consistent whether item is a Mongoose subdocument or a POJO.
    const plain = typeof item.toObject === "function" ? item.toObject() : { ...item };
    const matchedProductId = plain.matchedProductId
      ? String(plain.matchedProductId)
      : null;

    if (!matchedProductId) {
      errors.push(`Item "${plain.spokenName}" has no matched product.`);
      return { ...plain, matchedProductId, confirmationError: "No product matched." };
    }
    const live = productMap.get(matchedProductId);
    if (!live) {
      errors.push(`Product "${plain.matchedProductName || matchedProductId}" no longer exists.`);
      return { ...plain, matchedProductId, confirmationError: "Product not found in database." };
    }
    if (!live.isActive) {
      errors.push(`Product "${live.name}" is no longer active.`);
      return { ...plain, matchedProductId, confirmationError: "Product is inactive." };
    }
    if (live.stock < plain.requestedQuantity) {
      errors.push(
        `Insufficient stock for "${live.name}". Requested: ${plain.requestedQuantity}, Available: ${live.stock}.`
      );
      return { ...plain, matchedProductId, confirmationError: "Insufficient stock." };
    }
    // Use LIVE price from DB — never the AI or cached price
    return {
      ...plain,
      matchedProductId,
      matchedProductPrice: live.price,
      matchedProductStock: live.stock,
      matchedProductIsActive: live.isActive,
      confirmationError: null,
    };
  });

  return { valid: errors.length === 0, items: revalidated, errors };
}

module.exports = {
  matchItems,
  matchSingleItem,
  revalidateItemsForConfirmation,
  parseSpokenQuantity,
  similarity,
};
