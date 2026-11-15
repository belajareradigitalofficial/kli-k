import rateLimit from "express-rate-limit";

/**
 * Rate limiter yang bisa dimatikan lewat RATE_LIMIT_DISABLED=true.
 *
 * Ini hanya untuk lingkungan tes otomatis: banyak request dibuat dari satu
 * alamat IP sehingga limiter akan tercapai sebelum skenario selesai.
 * Jangan diaktifkan di production.
 */
export function createLimiter(options) {
  if (process.env.RATE_LIMIT_DISABLED === "true") {
    return (req, res, next) => next();
  }

  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    ...options,
  });
}
