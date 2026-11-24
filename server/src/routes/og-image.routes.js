import { Router } from "express";
import { assertPublicUrl, DEFAULT_FETCH_TIMEOUT_MS } from "../lib/og.js";

/**
 * Proxy gambar OG: GET /og-image/:slug
 *
 * `og:image` pada HTML preview menunjuk ke sini, bukan langsung ke situs
 * tujuan. Alasannya: server WhatsApp harus bisa mengambil gambar itu, dan
 * sebagian situs (atau WAF/CDN-nya) memblokir alamat IP crawler Meta. Dengan
 * proxy same-origin, WhatsApp hanya perlu menjangkau kli-k.id — domain yang
 * pasti bisa dia akses karena di situlah halaman preview-nya.
 *
 * Kalau pengambilan gagal, route membalas 302 ke URL gambar asli. Artinya
 * tidak ada yang lebih buruk daripada sebelumnya; crawler masih punya
 * kesempatan mengambil langsung dari sumbernya.
 */

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 jam di memori
const MAX_CACHE_ENTRIES = 200;

export function createOgImageRouter(service, { fetchImpl, timeoutMs, lookup } = {}) {
  const router = Router();
  const cache = new Map();

  router.get("/:slug", async (req, res, next) => {
    // IGambar hanya relevan untuk slug yang benar-benar ada.
    const link = await service.getBySlug(req.params.slug);
    if (!link) return next();

    const sourceUrl = link.ogImage;
    if (!sourceUrl) return next();

    const cached = readCache(cache, link.slug, sourceUrl);
    if (cached) return sendImage(res, cached);

    try {
      const image = await fetchImage(sourceUrl, { fetchImpl, timeoutMs, lookup });
      if (!image) {
        // Gagal mengambil: biarkan crawler mencoba langsung ke sumbernya.
        return redirectToSource(res, sourceUrl);
      }

      writeCache(cache, link.slug, sourceUrl, image);
      res.set("Cache-Control", "public, max-age=300");
      return sendImage(res, image);
    } catch (err) {
      console.error(`[og-image] gagal mengambil ${sourceUrl}: ${err.message}`);
      return redirectToSource(res, sourceUrl);
    }
  });

  return router;
}

async function fetchImage(rawUrl, { fetchImpl, timeoutMs, lookup } = {}) {
  // URL gambar berasal dari HTML pihak ketiga, jadi tetap harus divalidasi:
  // kalau tidak, endpoint ini bisa dipakai membaca alamat internal.
  await assertPublicUrl(rawUrl, { lookup });

  const response = await (fetchImpl ?? globalThis.fetch)(rawUrl, {
    signal: AbortSignal.timeout(timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS),
    headers: {
      "user-agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      accept: "image/avif,image/webp,image/jpeg,image/png,image/*",
    },
  });

  if (!response.ok) return null;

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.startsWith("image/")) return null;

  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_IMAGE_BYTES) return null;

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) return null;

  return { body: buffer, contentType };
}

/** Format gambar yang didukung WhatsApp. Selain ini, tampilkan apa adanya. */
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function sendImage(res, image) {
  const type = ALLOWED_IMAGE_TYPES.has(image.contentType.split(";")[0].trim())
    ? image.contentType.split(";")[0].trim()
    : "application/octet-stream";

  res.set("Content-Type", type);
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Cache-Control", "public, max-age=3600");
  res.status(200).end(image.body);
}

function redirectToSource(res, sourceUrl) {
  res.set("Cache-Control", "no-store");
  res.redirect(302, sourceUrl);
}

function readCache(cache, slug, sourceUrl) {
  const entry = cache.get(slug);
  if (!entry) return null;
  if (entry.sourceUrl !== sourceUrl) {
    cache.delete(slug);
    return null;
  }
  if (entry.expiresAt < Date.now()) {
    cache.delete(slug);
    return null;
  }
  return entry.image;
}

function writeCache(cache, slug, sourceUrl, image) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    // Map mempertahankan urutan sisip: buang yang paling lama.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(slug, { sourceUrl, image, expiresAt: Date.now() + CACHE_TTL_MS });
}
