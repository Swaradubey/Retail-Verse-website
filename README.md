# Retailverse POS & Thermal Printing System

Retailverse includes a high-performance, seamless Direct Thermal Printing engine for POS receipts and continuous inventory barcode sticker rolls.

---

## 🖨️ Thermal Printing Architecture

The system provides dual-mode direct printing without manual "Save Print Output As" PDF file dialogs:

1. **Direct WebUSB Hardware Bridge (ESC/POS)**:
   - Communicates directly with physical thermal receipt and barcode printers over WebUSB.
   - Sends raw binary ESC/POS buffers (`ESC @` init, text styling, `GS k` CODE128 barcodes, `GS V` auto-paper cut).
   - Direct physical printing with zero dialog interruption.

2. **Isolated Hidden `<iframe>` DOM Thermal Engine**:
   - Zero-margin, isolated container printing with exact millimeter page rules (`@page { size: 80mm auto; margin: 0; }` or `@page { size: 58mm auto; margin: 0; }`).
   - Pitch-black (`#000000`) high-contrast styling for crisp thermal print heads.
   - Never alters the current screen, triggers blank tab redirects, or corrupts UI state.

---

## 🏷️ Inventory Barcode & Product Label Printing

Thermal barcode printing is supported across the Inventory module:
- **Formats Supported**:
  - `50mm × 25mm` (Standard 2-inch thermal sticker roll)
  - `50mm × 30mm` (Jewelry & retail sticker roll)
  - `40mm × 30mm` (Compact die-cut sticker)
  - `72mm × 40mm` (Wide 80mm continuous roll)
- **Features**:
  - Direct **Print Barcode** action button directly on each row in `InventoryTable`.
  - Batch copy selector with quick presets (1, 5, 10, or instant stock quantity).
  - High-contrast pure black SVG CODE128 rendering (`shape-rendering: crispEdges`).
  - Configurable store name and SKU display toggles.

---

## ⚙️ In-App Hardware Settings

Click the **Thermal Printer** button in the POS top bar or Inventory header to:
- Pair/disconnect USB thermal printers via WebUSB.
- Switch between **80mm** (3-inch) and **58mm** (2-inch) roll profiles.
- Toggle automatic guillotine paper cut (`ESC/POS GS V`).
- Customize Store Name, Address, Phone, GSTIN, and Footer note.
- Run diagnostic test prints for receipts and barcode stickers.

---

## 💻 Developer Quickstart

```bash
# Install dependencies
npm install

# Start Vite frontend dev server
npm run dev
```