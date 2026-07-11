const path = require("path");
const dotenv = require("dotenv");
const envPath = path.resolve(__dirname, "..", ".env");
const envResult = dotenv.config({ path: envPath });
if (envResult.error) {
  console.warn(`[seedThemes] dotenv could not read ${envPath}: ${envResult.error.message}`);
}

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is not defined in .env");
  process.exit(1);
}

const mongoose = require("mongoose");
const Theme = require("../models/Theme");

const MONGO_URI = process.env.MONGO_URI;

const themes = [
  {
    key: "luxe-commerce",
    name: "Luxe Commerce",
    description: "Premium, elegant, editorial and luxury-focused theme. Suitable for fashion, beauty, jewellery, lifestyle and premium retail brands.",
    isEnabled: true,
    isDefault: true,
    features: [
      "Large hero banners",
      "Refined typography",
      "Spacious layouts",
      "Sophisticated product cards",
      "Premium collection sections",
      "Soft animations and hover effects",
      "Elegant header and footer",
      "Clean checkout and product-detail presentation",
    ],
    layoutStyle: "Editorial / Spacious",
    typographyStyle: "Serif headings, refined body text",
    colorPalette: {
      primary: "#1a1a2e",
      secondary: "#c9a96e",
      accent: "#e8d5b7",
      background: "#fcfbf8",
    },
  },
  {
    key: "nova-marketplace",
    name: "Nova Marketplace",
    description: "Modern, energetic, conversion-focused marketplace-style theme. Suitable for electronics, general retail, grocery, multi-category and high-volume stores.",
    isEnabled: true,
    isDefault: false,
    features: [
      "Compact information-rich header",
      "Strong search experience",
      "Category navigation",
      "Promotional banners",
      "Product grids with badges, prices and ratings",
      "Flash-sale and featured-product sections",
      "Modern card styling and micro-interactions",
      "Fast and practical shopping experience",
    ],
    layoutStyle: "Marketplace / Conversion-focused",
    typographyStyle: "Sans-serif headings, clean body text",
    colorPalette: {
      primary: "#0f172a",
      secondary: "#3b82f6",
      accent: "#f97316",
      background: "#ffffff",
    },
  },
];

async function seed() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("Connected.");

    const existing = await Theme.countDocuments({});
    if (existing > 0) {
      console.log(`Themes already seeded (${existing} found). Updating...`);
      for (const t of themes) {
        await Theme.findOneAndUpdate({ key: t.key }, t, { upsert: true, new: true });
      }
      console.log("Themes updated.");
    } else {
      await Theme.insertMany(themes);
      console.log(`Seeded ${themes.length} themes.`);
    }

    await mongoose.disconnect();
    console.log("Done.");
    process.exit(0);
  } catch (error) {
    console.error("Seed error:", error.message);
    process.exit(1);
  }
}

seed();
