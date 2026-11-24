import { fetchOg, DEFAULT_FETCH_TIMEOUT_MS } from "../lib/og.js";

/**
 * Cache metadata OG per link.
 *
 * Crawler media sosial bisa meminta preview berkali-kali untuk URL yang sama,
 * jadi hasil scrape disimpan di kolom `Link` (lihat schema.prisma). Dengan
 * begitu situs tujuan tidak dibanjiri request dari server kita.
 *
 * Kegagalan juga di-cache (`ogFetchedAt` terisi, kolom OG kosong) selama
 * NEGATIVE_TTL_MS, supaya situs yang mati/memblokir bot tidak dicoba terus.
 */

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari
const NEGATIVE_TTL_MS = 60 * 60 * 1000; // 1 jam

export function createOgService(db, { fetchImpl, timeoutMs, ttlMs, lookup, now = () => Date.now() } = {}) {
  const cacheTtlMs = ttlMs ?? readTtlFromEnv();
  const fetchTimeoutMs = timeoutMs ?? readTimeoutFromEnv();

  // Satu fetch per link pada satu waktu: beberapa crawler sering datang
  // bersamaan untuk URL yang baru dibagikan.
  const inFlight = new Map();

  async function fetchAndStore(link) {
    const result = await fetchOg(link.targetUrl, {
      fetchImpl: fetchImpl ?? globalThis.fetch,
      timeoutMs: fetchTimeoutMs,
      lookup,
    });

    if (!result.ok) {
      // Simpan kegagalan supaya tidak dicoba ulang pada setiap share.
      console.warn(`[og] gagal mengambil OG untuk ${link.slug}: ${result.reason}`);
      await db.link
        .update({
          where: { id: link.id },
          data: {
            ogTitle: null,
            ogDescription: null,
            ogImage: null,
            ogSiteName: null,
            ogFetchedAt: new Date(),
          },
        })
        .catch(() => {});
      return null;
    }

    const og = result.og;
    await db.link
      .update({
        where: { id: link.id },
        data: {
          ogTitle: og.title,
          ogDescription: og.description,
          ogImage: og.image,
          ogSiteName: og.siteName,
          ogFetchedAt: new Date(),
        },
      })
      .catch((err) => {
        console.error(`[og] gagal menyimpan cache OG link ${link.id}: ${err.message}`);
      });

    return og;
  }

  function fromCache(link) {
    if (!link.ogTitle && !link.ogDescription && !link.ogImage && !link.ogSiteName) {
      // Cache kosong = tidak ada yang bisa ditampilkan. Pemanggil akan
      // memakai teks milik link sendiri atau jatuh ke redirect biasa.
      return null;
    }

    return {
      title: link.ogTitle ?? null,
      description: link.ogDescription ?? null,
      image: link.ogImage ?? null,
      siteName: link.ogSiteName ?? null,
      imageWidth: null,
      imageHeight: null,
    };
  }

  function isStale(link) {
    if (!link.ogFetchedAt) return true;
    const age = now() - new Date(link.ogFetchedAt).getTime();
    // Cache negatif (gagal) lebih singkat dari cache positif.
    const hasOg = Boolean(link.ogTitle || link.ogImage || link.ogDescription);
    return age > (hasOg ? cacheTtlMs : NEGATIVE_TTL_MS);
  }

  /**
   * Metadata untuk satu link. Tidak pernah melempar error: kalau pengambilan
   * gagal, hasilnya objek dengan nilai null dan route akan memakai teks milik
   * link itu sendiri.
   */
  async function getPreview(link) {
    if (!isStale(link)) {
      return fromCache(link);
    }

    if (inFlight.has(link.id)) {
      return inFlight.get(link.id);
    }

    const promise = fetchAndStore(link)
      .then((og) => og ?? fromCache(link))
      .catch((err) => {
        console.error(`[og] error tak terduga untuk ${link.slug}: ${err.message}`);
        return fromCache(link);
      })
      .finally(() => inFlight.delete(link.id));

    inFlight.set(link.id, promise);
    return promise;
  }

  return { getPreview };
}

function readTtlFromEnv() {
  const hours = Number.parseInt(process.env.OG_CACHE_TTL_HOURS ?? "", 10);
  return Number.isFinite(hours) && hours > 0 ? hours * 60 * 60 * 1000 : DEFAULT_TTL_MS;
}

function readTimeoutFromEnv() {
  const ms = Number.parseInt(process.env.OG_FETCH_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(ms) && ms >= 500 ? ms : DEFAULT_FETCH_TIMEOUT_MS;
}
