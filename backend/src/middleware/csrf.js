/**
 * Origin/Referer CSRF Guard for cookie-authenticated state-changing requests.
 * Rejects cross-origin mutating requests from untrusted origins.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfOriginGuard(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  // Only enforce when cookie auth is present or origin header is supplied
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const allowedOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
  const extraOrigins = String(process.env.EXTRA_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const netlifyOrigins = [process.env.URL, process.env.DEPLOY_PRIME_URL]
    .map((s) => (s || '').trim())
    .filter(Boolean);
  const allowedOrigins = new Set([
    allowedOrigin,
    ...extraOrigins,
    ...netlifyOrigins,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    `http://localhost:${process.env.PORT || 4000}`
  ]);

  if (origin) {
    if (!allowedOrigins.has(origin)) {
      return res.status(403).json({ error: 'Cross-origin request blocked by CSRF policy.' });
    }
    return next();
  }

  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (!allowedOrigins.has(refOrigin)) {
        return res.status(403).json({ error: 'Invalid referer blocked by CSRF policy.' });
      }
    } catch {
      return res.status(403).json({ error: 'Malformed referer header.' });
    }
  }

  next();
}
