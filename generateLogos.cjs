/**
 * generateLogos.js
 * Creates proper PNG binary files for marketplace logos with real brand colors.
 * Runs with: node generateLogos.js
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'Frontend/public/marketplace-logos');
fs.mkdirSync(dir, { recursive: true });

// ─── PNG encoder ────────────────────────────────────────────────────────────
function crc32(buf) {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = t[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const tb = Buffer.from(type, 'ascii');
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.allocUnsafe(4); crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([len, tb, data, crc]);
}

function makePNG(w, h, getPixel) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const rawRows = [];
  for (let y = 0; y < h; y++) {
    rawRows.push(0); // filter=None
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = getPixel(x, y);
      rawRows.push(r, g, b, a);
    }
  }
  const idat = zlib.deflateSync(Buffer.from(rawRows));
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── Shape helpers ───────────────────────────────────────────────────────────
function inRoundedRect(x, y, cx, cy, rw, rh, cr) {
  const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
  if (dx > rw || dy > rh) return false;
  if (dx <= rw - cr || dy <= rh - cr) return true;
  return Math.hypot(dx - (rw - cr), dy - (rh - cr)) <= cr;
}

const W = 256, H = 256;
const WHITE = [255, 255, 255, 255];
const TRANSPARENT = [255, 255, 255, 0];

// ─── Amazon logo ─────────────────────────────────────────────────────────────
// Dark "amazon" wordmark + orange smile arrow on white background
function amazonPixel(x, y) {
  const cx = W / 2, cy = H / 2;
  
  // Orange smile arrow: curved band from 25% to 75% width, centered at 60% height
  const smileY = H * 0.60;
  const smileLeft = W * 0.18, smileRight = W * 0.82;
  const smileThick = H * 0.065;
  
  if (x >= smileLeft && x <= smileRight) {
    const t = (x - smileLeft) / (smileRight - smileLeft);
    const arcDip = Math.sin(t * Math.PI) * H * 0.06;
    const bandTop = smileY + arcDip - smileThick / 2;
    const bandBot = smileY + arcDip + smileThick / 2;
    if (y >= bandTop && y <= bandBot) return [255, 153, 0, 255];
  }
  
  // Arrow tip on right side of smile
  if (x >= W * 0.78 && x <= W * 0.90) {
    const arrowCX = W * 0.845, arrowCY = smileY + H * 0.08;
    if (Math.abs(x - arrowCX) + Math.abs(y - arrowCY) < W * 0.055) return [255, 153, 0, 255];
  }

  // Dark grey "amazon" text block (simplified – 6 letter-sized rectangles)
  const DARK = [35, 31, 32, 255];
  const textTop = H * 0.20, textBot = H * 0.46;
  const letterW = W * 0.095, gap = W * 0.012;
  const totalW = 6 * letterW + 5 * gap;
  const startX = cx - totalW / 2;

  if (y >= textTop && y <= textBot) {
    for (let i = 0; i < 6; i++) {
      const lx = startX + i * (letterW + gap);
      const rx = lx + letterW;
      if (x >= lx && x <= rx) {
        // Each letter: just a solid column with a notch
        const lRelX = (x - lx) / letterW;
        const lRelY = (y - textTop) / (textBot - textTop);
        // Simple rectangular glyphs
        if (lRelX > 0.08 && lRelX < 0.92) return DARK;
      }
    }
  }
  
  return WHITE;
}

// ─── Shopify logo ─────────────────────────────────────────────────────────────
// Green "S" shape on white
function shopifyPixel(x, y) {
  const GREEN = [150, 191, 71, 255];
  const cx = W / 2, cy = H / 2;
  
  // Outer circle-based S
  const outerR = W * 0.38, innerR = W * 0.22;
  const dist = Math.hypot(x - cx, y - cy);
  
  // Top arc of S (upper half left)
  if (y < cy && dist < outerR && dist > innerR) {
    const angle = Math.atan2(y - cy, x - cx) * 180 / Math.PI;
    if (angle >= -200 && angle <= 10) return GREEN;
  }
  // Bottom arc of S (lower half right)
  if (y >= cy && dist < outerR && dist > innerR) {
    const angle = Math.atan2(y - cy, x - cx) * 180 / Math.PI;
    if (angle >= -10 && angle <= 200) return GREEN;
  }
  
  return WHITE;
}

// ─── WooCommerce logo ─────────────────────────────────────────────────────────
// Purple rounded rect with "Woo" text in white
function woocommercePixel(x, y) {
  const PURPLE = [127, 84, 179, 255];
  const cx = W / 2, cy = H * 0.48;
  const rw = W * 0.46, rh = H * 0.32, cr = W * 0.12;

  if (inRoundedRect(x, y, cx, cy, rw, rh, cr)) {
    // Speech bubble tail
    const tailX = W * 0.30, tailY = cy + rh;
    if (y >= tailY - 2 && y <= tailY + H * 0.12 && x >= tailX - W * 0.06 && x <= tailX + W * 0.06) {
      if (y - tailY < (W * 0.06 - Math.abs(x - tailX)) * 1.5) return PURPLE;
    }
    return PURPLE;
  }
  
  // Tail triangle below box
  const tailX = W * 0.30, tailBase = cy + rh;
  if (y >= tailBase && y <= tailBase + H * 0.12) {
    const halfW = W * 0.06 * (1 - (y - tailBase) / (H * 0.12));
    if (Math.abs(x - tailX) <= halfW) return PURPLE;
  }
  
  return WHITE;
}

// ─── Flipkart logo ─────────────────────────────────────────────────────────────
// Blue rounded square with white "F" + yellow star
function flipkartPixel(x, y) {
  const BLUE = [40, 116, 240, 255];
  const YELLOW = [255, 229, 0, 255];
  const FWHITE = [255, 255, 255, 255];
  const cx = W / 2, cy = H / 2;
  const rw = W * 0.44, rh = H * 0.44, cr = W * 0.10;

  if (!inRoundedRect(x, y, cx, cy, rw, rh, cr)) return WHITE;
  
  // Yellow star (top right)
  const starCX = cx + rw * 0.45, starCY = cy - rh * 0.50;
  // Simple 5-pointed star
  const sr = W * 0.12;
  const innerR = sr * 0.45;
  const distS = Math.hypot(x - starCX, y - starCY);
  if (distS < sr) {
    const angle = (Math.atan2(y - starCY, x - starCX) * 180 / Math.PI + 90 + 360) % 360;
    const point = Math.floor(angle / 72);
    const frac = (angle % 72) / 72;
    const rAtAngle = frac < 0.5
      ? sr - (sr - innerR) * frac * 2
      : innerR + (sr - innerR) * (frac - 0.5) * 2;
    if (distS < rAtAngle) return YELLOW;
  }
  
  // White "F" letterform
  const FX = cx - W * 0.10, FY = cy - H * 0.25;
  const FW = W * 0.22, FH = H * 0.50;
  const stemW = FW * 0.30;
  // Vertical stem
  if (x >= FX && x <= FX + stemW && y >= FY && y <= FY + FH) return FWHITE;
  // Top bar
  if (x >= FX && x <= FX + FW && y >= FY && y <= FY + FH * 0.18) return FWHITE;
  // Middle bar
  if (x >= FX && x <= FX + FW * 0.80 && y >= FY + FH * 0.42 && y <= FY + FH * 0.60) return FWHITE;
  
  return BLUE;
}

// ─── ONDC logo ────────────────────────────────────────────────────────────────
// Blue circle with white "ONDC" text
function ondcPixel(x, y) {
  const BLUE = [0, 102, 180, 255];
  const cx = W / 2, cy = H / 2;
  const r = W * 0.40;
  
  if (Math.hypot(x - cx, y - cy) > r) return WHITE;
  
  // White text area simplified
  const textTop = H * 0.38, textBot = H * 0.62;
  const textLeft = W * 0.18, textRight = W * 0.82;
  if (y >= textTop && y <= textBot && x >= textLeft && x <= textRight) {
    // Show "ONDC" as 4 white letter blocks
    const letW = (textRight - textLeft - W * 0.06) / 4;
    const gap = W * 0.02;
    for (let i = 0; i < 4; i++) {
      const lx = textLeft + i * (letW + gap);
      const rx = lx + letW;
      if (x >= lx + letW * 0.12 && x <= rx - letW * 0.12) return [255, 255, 255, 255];
    }
  }
  
  return BLUE;
}

// ─── Generate all PNGs ───────────────────────────────────────────────────────
const logos = [
  { name: 'amazon.png',       fn: amazonPixel },
  { name: 'shopify.png',      fn: shopifyPixel },
  { name: 'woocommerce.png',  fn: woocommercePixel },
  { name: 'flipkart.png',     fn: flipkartPixel },
  { name: 'ondc.png',         fn: ondcPixel },
];

for (const logo of logos) {
  const png = makePNG(W, H, (x, y) => logo.fn(x, y));
  const fp = path.join(dir, logo.name);
  fs.writeFileSync(fp, png);
  const stat = fs.statSync(fp);
  // Verify it starts with PNG signature
  const sig = fs.readFileSync(fp).slice(0, 8);
  const valid = sig[0] === 137 && sig[1] === 80 && sig[2] === 78 && sig[3] === 71;
  console.log(`${logo.name}: ${stat.size} bytes, PNG valid: ${valid}`);
}

console.log('\nAll PNG files generated in:', dir);
