import { AppError } from "../lib/errors.js";
import { readSessionToken } from "../lib/session.js";

/**
 * Memuat user dari cookie sesi. Tidak menolak request — route yang butuh
 * login memakai requireAuth setelah ini.
 */
export function createSessionLoader(authService) {
  return async function loadSession(req, res, next) {
    try {
      const token = readSessionToken(req);
      if (!token) {
        req.user = null;
        return next();
      }

      const resolved = await authService.resolveSession(token);
      req.user = resolved?.user ?? null;
      req.sessionToken = token;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return next(new AppError(401, "Silakan masuk terlebih dahulu", "UNAUTHORIZED"));
  }
  next();
}

/**
 * Cek Origin untuk request yang mengubah data (POST/PATCH/DELETE).
 *
 * Cookie dikirim otomatis oleh browser, jadi tanpa cek ini situs lain bisa
 * memicu aksi atas nama pengguna (CSRF). Request tanpa header Origin
 * (curl, alat CLI) tetap diizinkan karena tidak membawa cookie browser
 * lintas situs — tapi kalau Origin ada dan tidak cocok, ditolak.
 */
export function createOriginCheck(allowedOrigins) {
  const allowed = new Set(allowedOrigins.filter(Boolean));

  return function checkOrigin(req, res, next) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      return next();
    }

    const origin = req.get("origin");
    if (!origin) return next();

    if (!allowed.has(origin)) {
      return next(new AppError(403, "Origin tidak diizinkan", "CSRF_ORIGIN_REJECTED"));
    }

    next();
  };
}
