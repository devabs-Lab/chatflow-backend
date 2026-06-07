function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 60 * 1000;
  const max = options.max || 120;
  const keyPrefix = options.keyPrefix || "global";
  const buckets = new Map();

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    const userKey = req.user?.userid || req.ip || "anonymous";
    const key = `${keyPrefix}:${userKey}`;
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    current.count += 1;

    if (current.count > max) {
      res.setHeader("Retry-After", Math.ceil((current.resetAt - now) / 1000));
      return res.status(429).json({ error: "Too many requests" });
    }

    return next();
  };
}

module.exports = createRateLimiter;
