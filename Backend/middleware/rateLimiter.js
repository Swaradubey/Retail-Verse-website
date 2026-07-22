const rateLimits = new Map();

/**
 * A lightweight in-memory rate limiter middleware.
 * @param {Object} options Configuration options
 * @param {number} options.windowMs Time window in milliseconds (default: 15 mins)
 * @param {number} options.max Maximum requests per window (default: 100)
 * @param {string} options.message Error message response (default: 'Too many requests')
 */
const rateLimiter = (options = {}) => {
  const windowMs = options.windowMs || 15 * 60 * 1000; // 15 mins
  const max = options.max || 100;
  const message = options.message || 'Too many requests from this IP, please try again after 15 minutes';

  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const now = Date.now();

    let clientData = rateLimits.get(ip);

    if (!clientData) {
      clientData = {
        requests: 1,
        resetTime: now + windowMs
      };
      rateLimits.set(ip, clientData);
      return next();
    }

    if (now > clientData.resetTime) {
      clientData.requests = 1;
      clientData.resetTime = now + windowMs;
      return next();
    }

    clientData.requests += 1;

    if (clientData.requests > max) {
      return res.status(429).json({
        success: false,
        message: message,
        retryAfterMs: clientData.resetTime - now
      });
    }

    next();
  };
};

module.exports = rateLimiter;
