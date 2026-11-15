import path from "node:path";
import fs from "node:fs";
import express from "express";

/**
 * Rute aplikasi React yang boleh dilayani index.html.
 *
 * Sengaja berupa daftar eksplisit, bukan catch-all. Kalau semua path
 * dilayani index.html, slug pendek yang salah ketik akan tampil sebagai
 * halaman aplikasi (status 200) dan menutupi fakta bahwa tautannya tidak ada.
 *
 * Rute baru di React Router HARUS ditambahkan di sini agar bisa dibuka
 * langsung atau di-refresh.
 */
const SPA_PATHS = new Set(["/", "/login", "/register", "/dashboard"]);
const SPA_PREFIXES = ["/dashboard/"];

export function isSpaPath(pathname) {
  if (SPA_PATHS.has(pathname)) return true;
  return SPA_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** Lokasi hasil build Vite: <root>/client/dist */
export function resolveDistDir() {
  return path.resolve(import.meta.dirname, "../../../client/dist");
}

/**
 * Menyajikan hasil build frontend: aset statis, lalu index.html untuk
 * rute aplikasi yang dikenal.
 */
export function createFrontendMiddleware({ distDir }) {
  const indexHtml = path.join(distDir, "index.html");
  const router = express.Router();

  // index:false supaya "/" juga lewat handler SPA di bawah, bukan otomatis
  // dilayani express.static.
  router.use(express.static(distDir, { index: false }));

  router.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (!isSpaPath(req.path)) return next();
    res.sendFile(indexHtml);
  });

  return router;
}

export function hasFrontendBuild(distDir = resolveDistDir()) {
  return fs.existsSync(path.join(distDir, "index.html"));
}
