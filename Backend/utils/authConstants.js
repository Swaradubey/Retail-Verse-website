const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

/** Default: hexerve@gmail.com — override via SUPER_ADMIN_EMAIL env var in production. */
const SUPER_ADMIN_EMAIL = String(
  process.env.SUPER_ADMIN_EMAIL || "hexerve@gmail.com"
)
  .toLowerCase()
  .trim();

const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || "12345";

module.exports = {
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PASSWORD,
};
