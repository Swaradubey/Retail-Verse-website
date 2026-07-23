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

function normalizeProductName(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/\bpcs?\b/g, "")
    .replace(/\bpieces?\b/g, "")
    .trim();
}

function similarity(a, b) {
  const na = normalizeProductName(a);
  const nb = normalizeProductName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(na, nb);
  return 1 - dist / maxLen;
}

function tokenize(value) {
  return normalizeProductName(value).split(/\s+/).filter(Boolean);
}

function tokenSimilarity(a, b) {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.length || !tb.length) return 0;
  const setA = new Set(ta);
  const setB = new Set(tb);
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

const NUMBER_WORD_MAP = {
  "one": 1, "a": 1, "an": 1, "single": 1,
  "two": 2, "a pair": 2, "pair": 2, "couple": 2,
  "three": 3, "triple": 3,
  "four": 4, "four pack": 4,
  "five": 5,
  "six": 6, "half dozen": 6, "half a dozen": 6,
  "seven": 7, "eight": 8, "nine": 9,
  "ten": 10, "dozen": 12, "a dozen": 12,
  "eleven": 11, "twelve": 12,
  "twenty": 20, "twenty-four": 24, "twenty four": 24,
  "fifty": 50, "hundred": 100,
};

function detectQuantityNearProduct(transcription, productName) {
  const normalizedTxn = normalizeProductName(transcription);
  const normalizedProduct = normalizeProductName(productName);
  if (!normalizedProduct) return null;

  const txnWords = normalizedTxn.split(/\s+/);
  const productWords = normalizedProduct.split(/\s+/);

  const productIndex = normalizedTxn.indexOf(normalizedProduct);
  if (productIndex === -1) return null;

  const textBefore = normalizedTxn.slice(0, productIndex).trim();
  const beforeWords = textBefore ? textBefore.split(/\s+/) : [];

  for (let i = beforeWords.length - 1; i >= 0; i--) {
    const word = beforeWords[i];
    if (NUMBER_WORD_MAP[word] !== undefined) return NUMBER_WORD_MAP[word];
    const num = parseInt(word, 10);
    if (!isNaN(num) && num > 0 && num < 1000) return num;
  }

  return null;
}

function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fallbackExtractItemsFromTranscription(transcription, products) {
  if (!transcription || !products || !products.length) return [];

  const normalizedTxn = normalizeText(transcription);
  if (!normalizedTxn) return [];

  const matched = [];
  const usedProductIds = new Set();

  // Phase 1: Exact product name match (highest priority)
  for (const product of products) {
    const normalizedProduct = normalizeText(product.name || "");
    if (!normalizedProduct) continue;

    if (normalizedTxn === normalizedProduct) {
      const quantity = detectQuantityNearProduct(transcription, product.name) || 1;
      usedProductIds.add(String(product._id));
      matched.push({
        spokenText: product.name,
        quantity,
        matched: true,
        productId: String(product._id),
        productName: product.name,
        categoryName: product.category || "",
        price: product.price || 0,
        stockQuantity: product.stock ?? 0,
        confidence: 1,
        matchType: "exact-product-name",
        requiresConfirmation: false,
      });
    }
  }

  // Phase 2: Exact SKU/barcode match
  for (const product of products) {
    if (usedProductIds.has(String(product._id))) continue;
    const normalizedSku = normalizeText(product.sku || "");
    const normalizedBarcode = normalizeText(product.barcode || "");
    if (normalizedSku && normalizedSku === normalizedTxn) {
      usedProductIds.add(String(product._id));
      matched.push({
        spokenText: product.sku,
        quantity: 1,
        matched: true,
        productId: String(product._id),
        productName: product.name,
        categoryName: product.category || "",
        price: product.price || 0,
        stockQuantity: product.stock ?? 0,
        confidence: 0.98,
        matchType: "sku",
        requiresConfirmation: false,
      });
    } else if (normalizedBarcode && normalizedBarcode === normalizedTxn) {
      usedProductIds.add(String(product._id));
      matched.push({
        spokenText: product.barcode,
        quantity: 1,
        matched: true,
        productId: String(product._id),
        productName: product.name,
        categoryName: product.category || "",
        price: product.price || 0,
        stockQuantity: product.stock ?? 0,
        confidence: 0.97,
        matchType: "barcode",
        requiresConfirmation: false,
      });
    }
  }

  // Phase 3: Name contained in transcription, or transcription contained in name
  for (const product of products) {
    if (usedProductIds.has(String(product._id))) continue;
    const normalizedProduct = normalizeText(product.name || "");
    if (!normalizedProduct) continue;

    const productInTxn = normalizedTxn.includes(normalizedProduct);
    const txnInProduct = normalizedProduct.includes(normalizedTxn);

    if (productInTxn || txnInProduct) {
      const quantity = detectQuantityNearProduct(transcription, product.name) || 1;
      const isExact = normalizedTxn === normalizedProduct;
      usedProductIds.add(String(product._id));
      matched.push({
        spokenText: product.name,
        quantity,
        matched: true,
        productId: String(product._id),
        productName: product.name,
        categoryName: product.category || "",
        price: product.price || 0,
        stockQuantity: product.stock ?? 0,
        confidence: isExact ? 1 : 0.85,
        matchType: isExact ? "exact-product-name" : "contains",
        requiresConfirmation: !isExact,
      });
    }
  }

  // Phase 4: Token match (word-by-word)
  for (const product of products) {
    if (usedProductIds.has(String(product._id))) continue;
    const txnTokens = normalizedTxn.split(/\s+/).filter(Boolean);
    const prodTokens = normalizeText(product.name || "").split(/\s+/).filter(Boolean);
    if (!txnTokens.length || !prodTokens.length) continue;

    const commonTokens = txnTokens.filter((t) => prodTokens.some((pt) => pt === t || pt.startsWith(t) || t.startsWith(pt)));
    if (commonTokens.length > 0 && commonTokens.length >= Math.min(txnTokens.length, prodTokens.length) * 0.5) {
      const quantity = detectQuantityNearProduct(transcription, product.name) || 1;
      usedProductIds.add(String(product._id));
      matched.push({
        spokenText: product.name,
        quantity,
        matched: true,
        productId: String(product._id),
        productName: product.name,
        categoryName: product.category || "",
        price: product.price || 0,
        stockQuantity: product.stock ?? 0,
        confidence: 0.7 + (commonTokens.length / Math.max(txnTokens.length, prodTokens.length)) * 0.2,
        matchType: "token",
        requiresConfirmation: true,
      });
    }
  }

  // Phase 5: Fuzzy match
  for (const product of products) {
    if (usedProductIds.has(String(product._id))) continue;
    const simScore = similarity(transcription, product.name || "");
    if (simScore >= 0.4) {
      const quantity = detectQuantityNearProduct(transcription, product.name) || 1;
      usedProductIds.add(String(product._id));
      matched.push({
        spokenText: product.name,
        quantity,
        matched: true,
        productId: String(product._id),
        productName: product.name,
        categoryName: product.category || "",
        price: product.price || 0,
        stockQuantity: product.stock ?? 0,
        confidence: simScore,
        matchType: "fuzzy",
        requiresConfirmation: true,
      });
    }
  }

  // Phase 6: Category match
  if (matched.length === 0) {
    const normalizedCategory = normalizeText(transcription);
    for (const product of products) {
      const pCat = product.category || "";
      const normalizedPCat = normalizeText(pCat);
      if (normalizedPCat && (normalizedPCat.includes(normalizedCategory) || normalizedCategory.includes(normalizedPCat))) {
        const quantity = detectQuantityNearProduct(transcription, product.name) || 1;
        usedProductIds.add(String(product._id));
        matched.push({
          spokenText: product.name,
          quantity,
          matched: true,
          productId: String(product._id),
          productName: product.name,
          categoryName: product.category || "",
          price: product.price || 0,
          stockQuantity: product.stock ?? 0,
          confidence: 0.82,
          matchType: "category",
          requiresConfirmation: true,
        });
      }
    }
  }

  return matched;
}

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
    "eleven": 11, "twelve": 12,
    "twenty": 20, "twenty-four": 24, "twenty four": 24,
    "fifty": 50, "hundred": 100,
  };
  if (WORD_MAP[s] !== undefined) return WORD_MAP[s];
  const n = parseFloat(s);
  if (!isNaN(n) && n > 0) return Math.round(n);
  return null;
}

function matchSingleItem(extractedItem, products) {
  const spokenName = String(extractedItem.spokenName || extractedItem.name || "").trim();
  const aiMatchId = extractedItem.matchedProductId;

  const normalizedSpoken = normalizeProductName(spokenName);
  const spokenTokens = tokenize(spokenName);

  const scores = products.map((p) => {
    let score = 0;
    let matchType = "none";

    const pName = p.name || "";
    const normalizedPName = normalizeProductName(pName);

    if (normalizedSpoken && normalizedPName === normalizedSpoken) {
      score = 1.0;
      matchType = "exact-product-name";
    } else if (p.sku && normalizeProductName(p.sku) === normalizedSpoken) {
      score = 0.98;
      matchType = "sku";
    } else if (p.barcode && normalizeProductName(p.barcode) === normalizedSpoken) {
      score = 0.97;
      matchType = "barcode";
    } else if (aiMatchId && String(p._id) === String(aiMatchId)) {
      score = Math.max(extractedItem.confidence || 0.5, 0.5);
      matchType = "ai_provided";
    } else if (normalizedSpoken && normalizedPName.startsWith(normalizedSpoken)) {
      score = 0.85;
      matchType = "starts_with";
    } else if (normalizedSpoken && normalizedPName.includes(normalizedSpoken)) {
      score = 0.75;
      matchType = "contains";
    } else if (spokenTokens.length > 0) {
      const tokenScore = tokenSimilarity(spokenName, pName);
      if (tokenScore >= 0.5) {
        score = 0.6 + tokenScore * 0.2;
        matchType = "token";
      } else {
        const simScore = similarity(spokenName, pName);
        if (simScore >= 0.4) {
          score = simScore;
          matchType = "fuzzy";
        }
      }
    }

    return { product: p, score, matchType };
  });

  // Add category matching as a lower-priority option
  if (scores.every((s) => s.score < 0.5) && normalizedSpoken) {
    const normalizedCategory = normalizeProductName(spokenName);
    products.forEach((p) => {
      const pCat = p.category || "";
      const normalizedPCat = normalizeProductName(pCat);
      if (normalizedPCat && (normalizedPCat.includes(normalizedCategory) || normalizedCategory.includes(normalizedPCat))) {
        scores.push({
          product: p,
          score: 0.82,
          matchType: "category",
        });
      }
    });
  }

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

  if (!best || best.score < CONFIDENCE_THRESHOLD || !normalizedSpoken) {
    return {
      spokenName,
      requestedQuantity: quantity,
      quantityAmbiguous,
      requestedUnit: extractedItem.requestedUnit || null,
      matchedProductId: null,
      matchedProductName: null,
      matchedProductCategory: null,
      matchedProductPrice: null,
      matchedProductStock: null,
      matchedProductIsActive: null,
      confidence: best ? best.score : 0,
      matchType: best ? best.matchType : "none",
      alternativeProductIds: alternatives,
      notes: extractedItem.notes || null,
      manuallyOverridden: false,
      requiresReview: true,
      reviewWarning: spokenName
        ? `Could not find a product matching "${spokenName}" in your product catalogue.`
        : "No product name was detected in the spoken order.",
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
    matchedProductCategory: mp.category || null,
    matchedProductPrice: mp.price,
    matchedProductStock: mp.stock,
    matchedProductIsActive: mp.isActive,
    confidence: best.score,
    matchType: best.matchType,
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

function matchItems(extractedItems, storeProducts) {
  if (!Array.isArray(extractedItems) || extractedItems.length === 0) return [];
  return extractedItems.map((item) => matchSingleItem(item, storeProducts));
}

function revalidateItemsForConfirmation(resolvedItems, liveProducts) {
  const productMap = new Map(liveProducts.map((p) => [String(p._id), p]));
  const errors = [];
  const revalidated = resolvedItems.map((item) => {
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
  normalizeProductName,
  fallbackExtractItemsFromTranscription,
  tokenize,
  NUMBER_WORD_MAP,
};
