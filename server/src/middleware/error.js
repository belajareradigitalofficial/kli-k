import { AppError } from "../lib/errors.js";

export function notFound(req, res) {
  res.status(404).json({ error: "Not Found" });
}

/**
 * Error handler wajib 4 argumen agar dikenali Express.
 *
 * Catatan penting:
 * - Kalau header sudah terkirim, delegasikan ke Express (next(err)) supaya
 *   koneksi ditutup dengan benar, bukan mencoba menulis response kedua.
 * - Pesan detail hanya dibocorkan di development agar stack/SQL tidak
 *   tersebar di production.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const status = err instanceof AppError ? err.status : err.status || err.statusCode || 500;

  // Log ringkas tanpa body request/kredensial.
  console.error(`[error] ${status} ${req.method} ${req.originalUrl}: ${err.message}`);

  const payload = {
    error: status >= 500 ? "Internal Server Error" : err.message || "Bad Request",
  };

  if (err instanceof AppError && err.code) {
    payload.code = err.code;
  }

  if (process.env.NODE_ENV === "development" && status >= 500) {
    payload.detail = err.message;
  }

  res.status(status).json(payload);
}
