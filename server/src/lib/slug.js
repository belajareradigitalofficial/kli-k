import { customAlphabet } from "nanoid";
import { AppError } from "./errors.js";

// Huruf kecil + angka, tanpa karakter ambigu (l/1/i, o/0) supaya slug
// mudah dibaca dan diketik ulang.
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const randomSlug = customAlphabet(ALPHABET, 7);

export const SLUG_MIN = 3;
export const SLUG_MAX = 32;

// Slug dipakai sebagai path, jadi dijaga ketat: hanya huruf kecil, angka,
// dash, dan underscore. Sengaja tanpa huruf besar karena collation MySQL
// default bersifat case-insensitive — "Abc" dan "abc" akan dianggap sama
// dan memicu konflik yang membingungkan.
const SLUG_PATTERN = /^[a-z0-9_-]+$/;

export const RESERVED_SLUGS = new Set([
  "api",
  "health",
  "admin",
  "login",
  "logout",
  "register",
  "dashboard",
  "about",
  "static",
  "assets",
  "public",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "docs",
]);

export function generateSlug() {
  return randomSlug();
}

/**
 * Slug custom dari user: opsional, kalau tidak dikirim pakai generateSlug().
 */
export function normalizeSlug(raw) {
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }

  if (typeof raw !== "string") {
    throw new AppError(400, "slug harus berupa teks", "INVALID_SLUG");
  }

  const slug = raw.trim().toLowerCase();

  if (slug.length < SLUG_MIN || slug.length > SLUG_MAX) {
    throw new AppError(
      400,
      `slug harus ${SLUG_MIN}-${SLUG_MAX} karakter`,
      "INVALID_SLUG",
    );
  }

  if (!SLUG_PATTERN.test(slug)) {
    throw new AppError(
      400,
      "slug hanya boleh huruf kecil, angka, dash, dan underscore",
      "INVALID_SLUG",
    );
  }

  if (RESERVED_SLUGS.has(slug)) {
    throw new AppError(400, "slug sudah dipakai sistem", "RESERVED_SLUG");
  }

  return slug;
}
