import { Router } from "express";
import { createLimiter } from "../lib/rate-limit.js";
import { requireAuth } from "../middleware/auth.js";
import {
  validateCreateLink,
  validatePagination,
  validateUpdateLink,
} from "../lib/validation.js";

/**
 * Semua route di sini wajib login dan otomatis dibatasi ke link milik
 * pengguna yang sedang masuk.
 */
export function createLinksRouter(service) {
  const router = Router();

  router.use(requireAuth);

  const createLinkLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    limit: 50,
    message: { error: "Batas pembuatan link tercapai, coba lagi nanti" },
  });

  router.get("/summary", async (req, res) => {
    res.json(await service.summary(req.user.id));
  });

  // Dicek saat pengguna mengetik alias di form.
  router.get("/check-slug", async (req, res) => {
    const excludeId = typeof req.query.excludeId === "string" ? req.query.excludeId : undefined;
    res.json(await service.checkSlug(req.query.slug ?? "", { excludeId }));
  });

  router.post("/", createLinkLimiter, async (req, res) => {
    const input = validateCreateLink(req.body);
    const link = await service.create(req.user.id, input);
    res.status(201).json(serializeLink(link));
  });

  router.get("/", async (req, res) => {
    const { skip, limit, search, page } = validatePagination(req.query);
    const { total, items } = await service.list(req.user.id, { skip, limit, search });

    res.json({
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      items: items.map(serializeLink),
    });
  });

  router.get("/:id", async (req, res) => {
    res.json(serializeLink(await service.getOwned(req.user.id, req.params.id)));
  });

  router.get("/:id/stats", async (req, res) => {
    res.json(await service.stats(req.user.id, req.params.id));
  });

  router.patch("/:id", async (req, res) => {
    const data = validateUpdateLink(req.body);
    res.json(serializeLink(await service.update(req.user.id, req.params.id, data)));
  });

  router.delete("/:id", async (req, res) => {
    await service.remove(req.user.id, req.params.id);
    res.status(204).end();
  });

  return router;
}

export function serializeLink(link) {
  return {
    id: link.id,
    slug: link.slug,
    shortUrl: `${process.env.BASE_URL || ""}/${link.slug}`,
    targetUrl: link.targetUrl,
    title: link.title,
    description: link.description,
    isActive: link.isActive,
    expiresAt: link.expiresAt,
    clicks: link.clicks,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };
}
