const https = require("https");
const http = require("http");

/**
 * Render Keep-Alive Service
 * Pings the server periodically (every 12 minutes) to prevent Render's free tier from going to sleep.
 */
function startKeepAlive() {
  const isProduction = process.env.NODE_ENV === "production" || process.env.RENDER;
  const externalUrl = process.env.RENDER_EXTERNAL_URL || process.env.BACKEND_URL || process.env.SERVER_URL;

  if (!externalUrl) {
    console.log("[KeepAlive] Notice: RENDER_EXTERNAL_URL / BACKEND_URL not set. Running internal health monitor.");
    return;
  }

  const pingUrl = externalUrl.replace(/\/+$/, "") + "/api/health";
  const intervalMs = 12 * 60 * 1000; // 12 minutes (Render sleeps after 15 minutes)

  console.log(`[KeepAlive] Service enabled. Pinging ${pingUrl} every 12 minutes to prevent cold starts.`);

  const client = pingUrl.startsWith("https") ? https : http;

  const ping = () => {
    try {
      const req = client.get(pingUrl, { timeout: 10000 }, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          console.log(`[KeepAlive] Heartbeat ping successful (${res.statusCode}) - Server kept warm.`);
        } else {
          console.warn(`[KeepAlive] Heartbeat ping returned status: ${res.statusCode}`);
        }
      });

      req.on("error", (err) => {
        console.warn(`[KeepAlive] Heartbeat ping error: ${err.message}`);
      });

      req.on("timeout", () => {
        req.destroy();
        console.warn("[KeepAlive] Heartbeat ping timed out.");
      });
    } catch (err) {
      console.warn(`[KeepAlive] Heartbeat unexpected error: ${err.message}`);
    }
  };

  // Schedule ping interval
  const timer = setInterval(ping, intervalMs);
  if (timer.unref) timer.unref(); // Don't hold Node process open if exiting
}

module.exports = { startKeepAlive };
