const crypto = require('crypto');

// Copy the exact normalization function from marketplace.controller
function normalizeShopDomain(input) {
  if (!input || typeof input !== "string") {
    throw new Error("Shop domain is required");
  }

  let shop = input.trim().toLowerCase();

  shop = shop
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split("?")[0]
    .replace(/\.$/, "");

  if (!shop.endsWith(".myshopify.com")) {
    shop = `${shop}.myshopify.com`;
  }

  const shopRegex =
    /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

  if (!shopRegex.test(shop)) {
    throw new Error("Invalid Shopify shop domain");
  }

  return shop;
}

// Copy the HMAC validation function from marketplace.controller
function verifyShopifyHmac(query, apiSecret) {
  const { hmac, ...params } = query;
  if (!hmac || typeof hmac !== 'string') return false;

  const sortedParams = Object.keys(params)
    .sort()
    .map(key => {
      const val = params[key];
      const valStr = Array.isArray(val) ? val.join(',') : String(val);
      return `${key}=${valStr}`;
    })
    .join('&');

  const calculatedHmac = crypto
    .createHmac('sha256', apiSecret)
    .update(sortedParams)
    .digest('hex');

  const calculatedHmacBuffer = Buffer.from(calculatedHmac, 'utf-8');
  const hmacBuffer = Buffer.from(hmac, 'utf-8');

  if (calculatedHmacBuffer.length !== hmacBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(calculatedHmacBuffer, hmacBuffer);
}

// Test cases
const testCases = [
  { input: 'mystore', expected: 'mystore.myshopify.com' },
  { input: 'mystore.myshopify.com', expected: 'mystore.myshopify.com' },
  { input: 'https://mystore.myshopify.com/admin', expected: 'mystore.myshopify.com' },
  { input: 'www.retailverse.in', expectedError: true },
  { input: 'javascript:alert(1)', expectedError: true },
];

console.log('--- Testing Shopify Domain Normalization ---');
let failed = 0;
for (const tc of testCases) {
  try {
    const result = normalizeShopDomain(tc.input);
    if (tc.expectedError) {
      console.error(`FAIL: Expected error for "${tc.input}" but got "${result}"`);
      failed++;
    } else if (result !== tc.expected) {
      console.error(`FAIL: Expected "${tc.expected}" for "${tc.input}" but got "${result}"`);
      failed++;
    } else {
      console.log(`PASS: "${tc.input}" => "${result}"`);
    }
  } catch (err) {
    if (tc.expectedError) {
      console.log(`PASS: "${tc.input}" correctly threw error: "${err.message}"`);
    } else {
      console.error(`FAIL: Expected "${tc.expected}" for "${tc.input}" but got error: "${err.message}"`);
      failed++;
    }
  }
}

console.log('\n--- Testing HMAC Verification ---');
const secret = 'shpss_secret12345';
const queryParams = {
  shop: 'teststore.myshopify.com',
  state: 'random_state_string',
  timestamp: '1600000000',
  code: 'auth_code_123'
};

const message = Object.keys(queryParams)
  .sort()
  .map(k => `${k}=${queryParams[k]}`)
  .join('&');

const validHmac = crypto
  .createHmac('sha256', secret)
  .update(message)
  .digest('hex');

const queryWithValidHmac = { ...queryParams, hmac: validHmac };
const queryWithInvalidHmac = { ...queryParams, hmac: 'wrong_hmac_signature' };
const queryWithShortHmac = { ...queryParams, hmac: 'short' };

const test1 = verifyShopifyHmac(queryWithValidHmac, secret);
const test2 = verifyShopifyHmac(queryWithInvalidHmac, secret);
const test3 = verifyShopifyHmac(queryWithShortHmac, secret);

if (test1 === true) {
  console.log('PASS: Valid HMAC correctly verified');
} else {
  console.error('FAIL: Valid HMAC verification failed');
  failed++;
}

if (test2 === false) {
  console.log('PASS: Invalid HMAC correctly rejected');
} else {
  console.error('FAIL: Invalid HMAC was accepted');
  failed++;
}

if (test3 === false) {
  console.log('PASS: Short HMAC correctly rejected (no RangeError crashed)');
} else {
  console.error('FAIL: Short HMAC was accepted');
  failed++;
}

if (failed === 0) {
  console.log('\nALL TESTS PASSED SUCCESSFULLY!');
} else {
  console.error(`\n${failed} TESTS FAILED.`);
  process.exit(1);
}
