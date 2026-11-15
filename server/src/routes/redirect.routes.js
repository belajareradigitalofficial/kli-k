import { Router } from "express";
import { createLimiter } from "../lib/rate-limit.js";

const MAX_HEADER_LENGTH = 512;

/**
 * Redirect publik: GET /:slug
 *
 * Pencatatan kunjungan sengaja tidak memblokir redirect. Kalau DB lambat
 * atau gagal, pengunjung tetap harus sampai ke tujuan.
 */
export function createRedirectRouter(service, prisma) {
  const router = Router();

  const redirectLimiter = createLimiter({
    windowMs: 60 * 1000,
    limit: 120,
    message: { error: "Terlalu banyak permintaan" },
  });

  router.get("/:slug", redirectLimiter, async (req, res) => {
    const link = await service.getBySlug(req.params.slug);

    if (!link || !link.isActive) {
      return res.status(404).json({ error: "Link tidak ditemukan" });
    }

    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
      return res.status(410).json({ error: "Link sudah kedaluwarsa" });
    }

    // 302 (bukan 301) supaya browser tidak meng-cache permanen — target
    // masih bisa diubah pemilik link.
    res.set("Cache-Control", "no-store");
    res.redirect(302, link.targetUrl);

    // HEAD tidak dihitung: hanya GET yang dicatat.
    if (req.method === "GET") {
      recordVisit(prisma, link.id, req).catch((err) => {
        console.error(`[visit] gagal mencatat kunjungan link ${link.id}: ${err.message}`);
      });
    }
  });

  return router;
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
