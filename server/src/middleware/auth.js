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
 *
 * Perbandingan dilakukan pada dua tingkat:
 *
 * 1. Daftar `CORS_ORIGIN` apa adanya — jalur eksplisit untuk origin lain
 *    (mis. frontend Vite di port berbeda saat pengembangan).
 * 2. Host yang sama dengan request ini. Ini menutup kasus `www` vs non-www,
 *    perbedaan skema di belakang reverse proxy, dan port yang tidak terduga.
 *
 * Membandingkan host tetap aman untuk CSRF: browser selalu mengisi Host dari
 * URL yang dibuka, dan request lintas situs membawa Origin dengan host lain.
 */
export function createOriginCheck(allowedOrigins) {
  const allowed = new Set(allowedOrigins.filter(Boolean));

  return function checkOrigin(req, res, next) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      return next();
    }

    const origin = req.get("origin");
    if (!origin) return next();

    if (allowed.has(origin)) return next();

    if (isSameHost(origin, req.get("host"))) return next();

    // Dicatat tanpa header cookie/body, supaya penyebab penolakan bisa
    // ditelusuri tanpa menebak-nebak.
    if (process.env.NODE_ENV !== "test") {
      console.warn(
        `[csrf] Origin ditolak: ${origin} (Host: ${req.get("host") ?? "-"}). ` +
          `CORS_ORIGIN saat ini: ${[...allowed].join(", ") || "(kosong)"}`,
      );
    }

    return next(new AppError(403, "Origin tidak diizinkan", "CSRF_ORIGIN_REJECTED"));
  };
}

function isSameHost(origin, host) {
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    // Origin tidak bisa diurai (mis. "null" dari iframe sandbox).
    return false;
  }
}
