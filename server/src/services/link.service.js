import { AppError } from "../lib/errors.js";
import { normalizeSlug, generateSlug } from "../lib/slug.js";
import { validateTargetUrl } from "../lib/url.js";

const MAX_SLUG_ATTEMPTS = 5;

/**
 * Service short link. Semua operasi manajemen dibatasi ke pemilik link
 * (`userId`), sehingga link milik orang lain tidak bisa dibaca maupun diubah.
 */
export function createLinkService(db) {
  async function create(userId, { targetUrl, title, description, slug, expiresAt, isActive }) {
    const safeUrl = validateTargetUrl(targetUrl);
    const customSlug = normalizeSlug(slug);

    const base = {
      targetUrl: safeUrl,
      title,
      description,
      expiresAt,
      isActive,
      userId,
    };

    if (customSlug) {
      try {
        return await db.link.create({ data: { ...base, slug: customSlug } });
      } catch (err) {
        throw translatePrismaError(err);
      }
    }

    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      try {
        return await db.link.create({ data: { ...base, slug: generateSlug() } });
      } catch (err) {
        if (isUniqueViolation(err) && attempt < MAX_SLUG_ATTEMPTS - 1) continue;
        throw translatePrismaError(err);
      }
    }

    throw new AppError(500, "Gagal membuat slug unik", "SLUG_GENERATION_FAILED");
  }

  async function list(userId, { skip, limit, search }) {
    const where = {
      userId,
      ...(search
        ? {
            OR: [
              { slug: { contains: search } },
              { targetUrl: { contains: search } },
              { title: { contains: search } },
            ],
          }
        : {}),
    };

    const [total, items] = await db.$transaction([
      db.link.count({ where }),
      db.link.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    return { total, items };
  }

  async function summary(userId) {
    const [totalLinks, aggregate, activeLinks] = await db.$transaction([
      db.link.count({ where: { userId } }),
      db.link.aggregate({ where: { userId }, _sum: { clicks: true } }),
      db.link.count({ where: { userId, isActive: true } }),
    ]);

    return {
      totalLinks,
      totalClicks: aggregate?._sum?.clicks ?? 0,
      activeLinks,
    };
  }

  /** Ambil link milik user; milik orang lain diperlakukan sebagai tidak ada. */
  async function getOwned(userId, id) {
    const link = await db.link.findFirst({ where: { id, userId } });
    if (!link) {
      throw new AppError(404, "Link tidak ditemukan", "LINK_NOT_FOUND");
    }
    return link;
  }

  async function update(userId, id, data) {
    const current = await getOwned(userId, id);

    const payload = { ...data };
    if (payload.targetUrl) {
      payload.targetUrl = validateTargetUrl(payload.targetUrl);
    }

    if ("slug" in payload) {
      const nextSlug = normalizeSlug(payload.slug);

      // Untuk update, alias tidak boleh dikosongkan: link wajib punya alamat.
      if (!nextSlug) {
        throw new AppError(400, "alias tidak boleh kosong", "INVALID_SLUG");
      }

      // Kalau tidak berubah, jangan sentuh slug sama sekali.
      if (nextSlug === current.slug) {
        delete payload.slug;
      } else {
        payload.slug = nextSlug;
      }
    }

    if (Object.keys(payload).length === 0) {
      throw new AppError(400, "tidak ada field yang bisa diperbarui", "EMPTY_UPDATE");
    }

    try {
      return await db.link.update({ where: { id }, data: payload });
    } catch (err) {
      throw translatePrismaError(err);
    }
  }

  /**
   * Cek ketersediaan alias untuk preview di form. Mengembalikan alasan
   * supaya frontend bisa menampilkan pesan yang tepat, bukan sekadar
   * "tidak tersedia".
   */
  async function checkSlug(rawSlug, { excludeId } = {}) {
    let slug;
    try {
      slug = normalizeSlug(rawSlug);
    } catch (err) {
      return {
        slug: typeof rawSlug === "string" ? rawSlug : "",
        available: false,
        reason: err.code || "INVALID_SLUG",
        message: err.message,
      };
    }

    if (!slug) {
      return {
        slug: "",
        available: false,
        reason: "EMPTY_SLUG",
        message: "alias tidak boleh kosong",
      };
    }

    const existing = await db.link.findUnique({ where: { slug } });

    if (existing && existing.id !== excludeId) {
      return {
        slug,
        available: false,
        reason: "SLUG_TAKEN",
        message: "Alias sudah digunakan. Silakan pilih nama lain.",
      };
    }

    return { slug, available: true, reason: null, message: "Alias tersedia." };
  }

  async function remove(userId, id) {
    await getOwned(userId, id);
    await db.link.delete({ where: { id } });
  }

  async function stats(userId, id) {
    const link = await getOwned(userId, id);

    const [recentVisits, uniqueIps] = await db.$transaction([
      db.visit.findMany({
        where: { linkId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      db.visit.groupBy({ by: ["ip"], where: { linkId: id } }),
    ]);

    return {
      id: link.id,
      slug: link.slug,
      clicks: link.clicks,
      uniqueVisitors: uniqueIps.length,
      recentVisits: recentVisits.map((v) => ({
        id: v.id.toString(),
        // IP lengkap tidak ditampilkan; cukup asal jaringan agar tidak
        // menjadi data pribadi yang tersimpan di layar pengguna.
        ip: maskIp(v.ip),
        userAgent: v.userAgent,
        referer: v.referer,
        createdAt: v.createdAt,
      })),
    };
  }

  /** Dipakai route redirect publik: tanpa cek kepemilikan. */
  async function getBySlug(slug) {
    if (typeof slug !== "string" || slug === "") return null;
    return db.link.findUnique({ where: { slug } });
  }

  return { create, list, summary, getOwned, update, remove, stats, getBySlug, checkSlug };
}

function maskIp(ip) {
  if (typeof ip !== "string" || ip === "") return null;
  if (ip.includes(":")) {
    // IPv6: sisakan 2 grup pertama.
    return `${ip.split(":").slice(0, 2).join(":")}:…`;
  }
  const parts = ip.split(".");
  if (parts.length !== 4) return ip;
  return `${parts[0]}.${parts[1]}.x.x`;
}

function isUniqueViolation(err) {
  return err?.code === "P2002";
}

function translatePrismaError(err) {
  if (isUniqueViolation(err)) {
    return new AppError(409, "Alias sudah digunakan. Silakan pilih nama lain.", "SLUG_TAKEN");
  }
  if (err?.code === "P2025") {
    return new AppError(404, "Link tidak ditemukan", "LINK_NOT_FOUND");
  }
  return err;
}
