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
 * Aset hasil build (js, css, favicon, …).
 *
 * Dipasang SEBELUM route redirect `/:slug`. Tanpa itu setiap permintaan aset
 * menembak database lebih dulu: lambat, dan membuat seluruh situs ikut rusak
 * ketika database bermasalah — termasuk halaman yang tidak butuh database.
 *
 * Aman karena slug dibatasi huruf/angka/tanda hubung, sehingga tidak mungkin
 * bertabrakan dengan nama file.
 */
export function createStaticMiddleware({ distDir }) {
  // index:false supaya "/" tetap ditangani handler SPA, bukan otomatis
  // dilayani express.static.
  return express.static(distDir, { index: false });
}

/**
 * Fallback SPA: kirim index.html untuk rute aplikasi yang dikenal.
 *
 * Dipasang SETELAH route redirect, supaya slug yang benar-benar ada tetap
 * diarahkan ke tujuan, dan slug yang tidak ada tetap berakhir 404.
 */
export function createSpaFallback({ distDir }) {
  const indexHtml = path.join(distDir, "index.html");

  return function spaFallback(req, res, next) {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (!isSpaPath(req.path)) return next();
    res.sendFile(indexHtml);
  };
}

export function hasFrontendBuild(distDir = resolveDistDir()) {
  return fs.existsSync(path.join(distDir, "index.html"));
}
