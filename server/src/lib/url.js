import { AppError } from "./errors.js";

const MAX_URL_LENGTH = 8192;

/**
 * Validasi target URL. Hanya http/https, tanpa embedded credentials
 * (https://user:pass@host), supaya link tidak bisa dipakai menyamar
 * sebagai situs lain atau menyelundupkan kredensial.
 */
export function validateTargetUrl(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new AppError(400, "targetUrl wajib diisi", "INVALID_URL");
  }

  const value = raw.trim();

  if (value.length > MAX_URL_LENGTH) {
    throw new AppError(400, `targetUrl maksimal ${MAX_URL_LENGTH} karakter`, "URL_TOO_LONG");
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(400, "targetUrl bukan URL yang valid", "INVALID_URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AppError(400, "URL harus http atau https", "INVALID_PROTOCOL");
  }

  if (url.username || url.password) {
    throw new AppError(400, "URL tidak boleh berisi kredensial", "URL_HAS_CREDENTIALS");
  }

  return url.toString();
}
