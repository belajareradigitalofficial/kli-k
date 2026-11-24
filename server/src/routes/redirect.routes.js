import { Router } from "express";
import { createLimiter } from "../lib/rate-limit.js";
import { isCrawler, renderOgHtml, renderUnavailableHtml } from "../lib/og.js";

const MAX_HEADER_LENGTH = 512;

/**
 * Redirect publik: GET /:slug
 *
 * Dua audiens, dua jawaban:
 * - Crawler media sosial (WhatsApp, Telegram, …) mendapat HTML tipis berisi
 *   metadata Open Graph dari halaman tujuan, supaya preview yang muncul di
 *   chat memakai judul/gambar situs tujuan.
 * - Pengunjung biasa tetap mendapat 302 langsung ke tujuan.
 *
 * Pencatatan kunjungan sengaja tidak memblokir redirect. Kalau DB lambat
 * atau gagal, pengunjung tetap harus sampai ke tujuan.
 */
export function createRedirectRouter(service, prisma, { ogService, baseUrl } = {}) {
  const router = Router();

  // Kuota dinaikkan dari 120: pengunjung seluler di Indonesia banyak yang
  // berbagi satu IP publik (CGNAT), sehingga 120/menit per IP mudah habis
  // hanya dari trafik normal.
  const redirectLimiter = createLimiter({
    windowMs: 60 * 1000,
    limit: 300,
    handler: (req, res) => {
      const resetTime = req.rateLimit?.resetTime;
      if (resetTime) {
        res.set("Retry-After", String(Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))));
      }
      res.status(429).set("Cache-Control", "no-store").json({ error: "Terlalu banyak permintaan" });
    },
  });

  /**
   * Crawler media sosial tidak dibatasi sama sekali.
   *
   * Kegagalan crawler mahal dan permanen: WhatsApp menyimpan hasil fetch yang
   * gagal, jadi satu balasan 429 membuat gambar link itu tidak pernah muncul
   * lagi walau kuota sudah pulih. Biayanya kecil — satu query database yang
   * sama seperti pengunjung biasa, dan hasil scrape sudah di-cache.
   */
  function limitByAudience(req, res, next) {
    if (isCrawler(req.get("user-agent"))) return next();
    return redirectLimiter(req, res, next);
  }

  router.get("/:slug", limitByAudience, async (req, res, next) => {
    const link = await service.getBySlug(req.params.slug);

    // Slug tidak ada: teruskan ke middleware berikutnya. Ini yang membuat
    // halaman seperti /dashboard dan /login bisa dilayani frontend, dan
    // slug yang salah ketik tetap berakhir di 404 (bukan halaman palsu).
    if (!link) {
      return next();
    }

    const userAgent = req.get("user-agent") ?? "";
    const crawler = isCrawler(userAgent);

    // Jejak diagnosis preview. Dicatat untuk SEMUA User-Agent yang membuka slug
    // yang benar-benar ada — bukan hanya yang cocok dengan daftar crawler.
    // Kalau WhatsApp ternyata memakai UA yang belum terdaftar, dia tetap muncul
    // di sini (dan mendapat 302 seperti pengunjung biasa). Tanpa baris ini kita
    // buta terhadap UA baru: request-nya tidak meninggalkan jejak apa pun.
    logRequest(`[slug] /${req.params.slug} ua="${truncate(userAgent, MAX_HEADER_LENGTH)}" crawler=${crawler}`);

    if (!link.isActive) {
      if (crawler) {
        return res
          .status(404)
          .vary("User-Agent")
          .set("Cache-Control", "no-store")
          .type("html")
          .send(renderUnavailableHtml("Link tidak ditemukan"));
      }
      return res.status(404).json({ error: "Link tidak ditemukan" });
    }

    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
      if (crawler) {
        return res
          .status(410)
          .vary("User-Agent")
          .set("Cache-Control", "no-store")
          .type("html")
          .send(renderUnavailableHtml("Link sudah kedaluwarsa"));
      }
      return res.status(410).json({ error: "Link sudah kedaluwarsa" });
    }

    if (crawler) {
      const sent = await sendPreview({ res, link, ogService, baseUrl });
      if (sent) return;
      // Metadata tidak tersedia: biarkan crawler mengambil sendiri dari
      // halaman tujuan, sama seperti pengunjung biasa.
    }

    // 302 (bukan 301) supaya browser tidak meng-cache permanen — target
    // masih bisa diubah pemilik link.
    //
    // Vary wajib: URL yang sama menghasilkan HTML untuk crawler dan 302 untuk
    // pengunjung, jadi cache bersama tidak boleh menyamakan keduanya.
    // res.vary() menambahkan, bukan menimpa Vary: Origin dari middleware CORS.
    res.vary("User-Agent");
    res.set("Cache-Control", "no-store");
    res.redirect(302, link.targetUrl);

    // HEAD tidak dihitung: hanya GET yang dicatat. Crawler juga tidak
    // dihitung: share bukan kunjungan.
    if (req.method === "GET" && !crawler) {
      recordVisit(prisma, link.id, req).catch((err) => {
        console.error(`[visit] gagal mencatat kunjungan link ${link.id}: ${err.message}`);
      });
    }
  });

  return router;
}

/**
 * HTML preview untuk crawler. Mengembalikan `true` kalau response sudah
 * dikirim, `false` kalau metadata tidak tersedia dan pemanggil harus
 * melanjutkan dengan redirect biasa.
 *
 * Kunjungan crawler tidak dicatat sebagai klik — share bukan kunjungan.
 */
async function sendPreview({ res, link, ogService, baseUrl }) {
  const og = ogService ? await ogService.getPreview(link) : null;

  // Tanpa metadata OG dan tanpa teks manual, tidak ada yang bisa ditampilkan:
  // serahkan ke crawler untuk mengambil sendiri dari halaman tujuan.
  if (!og && !link.title && !link.description) {
    return false;
  }
  const origin = (baseUrl ?? process.env.BASE_URL ?? "").replace(/\/+$/, "");
  const canonicalUrl = origin ? `${origin}/${link.slug}` : `/${link.slug}`;

  // Gambar disajikan lewat domain sendiri kalau sumbernya diketahui. Dengan
  // begitu crawler WhatsApp hanya perlu menjangkau kli-k.id; sebagian situs
  // memblokir alamat IP crawler Meta sehingga gambar tidak pernah sampai.
  const imageUrl = og?.image && origin ? `${origin}/og-image/${link.slug}` : null;

  // HTML ini hanya untuk crawler. `private` mencegah CDN/reverse proxy
  // menyimpannya — kalau ikut ter-cache, pengunjung biasa akan menerima
  // halaman ini alih-alih 302 (pernah terjadi di Hostinger: CDN meng-cache
  // response lalu menyajikannya ke semua User-Agent). `Vary` jadi lapis
  // kedua untuk proxy yang mengabaikan `private`.
  //
  // Tidak masalah kalau crawler selalu menembak origin: metadata OG sudah
  // di-cache di database (og.service.js), jadi tidak ada fetch ulang ke
  // situs tujuan.
  res.set("Cache-Control", "private, no-store, max-age=0");
  res.vary("User-Agent");
  res.status(200).type("html").send(renderOgHtml({ link, og, canonicalUrl, imageUrl }));
  return true;
}

async function recordVisit(prisma, linkId, req) {
  const ip = req.ip ? truncate(req.ip, 45) : null;
  const userAgent = truncate(req.get("user-agent"), MAX_HEADER_LENGTH);
  const referer = truncate(req.get("referer"), MAX_HEADER_LENGTH);

  // Atomik: increment counter + catat detail dalam satu transaksi supaya
  // angka klik dan jumlah baris Visit tidak pernah berbeda.
  await prisma.$transaction([
    prisma.link.update({
      where: { id: linkId },
      data: { clicks: { increment: 1 } },
    }),
    prisma.visit.create({
      data: { linkId, ip, userAgent, referer },
    }),
  ]);
}

function truncate(value, max) {
  if (typeof value !== "string") return null;
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * Log diagnostik request publik. Dimatikan saat tes supaya keluaran tes tetap
 * bersih; di produksi tiap kunjungan ke slug yang ada menghasilkan satu baris.
 */
function logRequest(message) {
  if (process.env.NODE_ENV === "test") return;
  console.log(message);
}
