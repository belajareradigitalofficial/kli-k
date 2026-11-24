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

  const redirectLimiter = createLimiter({
    windowMs: 60 * 1000,
    limit: 120,
    message: { error: "Terlalu banyak permintaan" },
  });

  router.get("/:slug", redirectLimiter, async (req, res, next) => {
    const link = await service.getBySlug(req.params.slug);

    // Slug tidak ada: teruskan ke middleware berikutnya. Ini yang membuat
    // halaman seperti /dashboard dan /login bisa dilayani frontend, dan
    // slug yang salah ketik tetap berakhir di 404 (bukan halaman palsu).
    if (!link) {
      return next();
    }

    const crawler = isCrawler(req.get("user-agent"));

    if (!link.isActive) {
      if (crawler) {
        return res.status(404).type("html").send(renderUnavailableHtml("Link tidak ditemukan"));
      }
      return res.status(404).json({ error: "Link tidak ditemukan" });
    }

    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
      if (crawler) {
        return res.status(410).type("html").send(renderUnavailableHtml("Link sudah kedaluwarsa"));
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

  res.set("Cache-Control", "public, max-age=300");
  res.set("X-Robots-Tag", "noindex");
  res.status(200).type("html").send(renderOgHtml({ link, og, canonicalUrl }));
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
