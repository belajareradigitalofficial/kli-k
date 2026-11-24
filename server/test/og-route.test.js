import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { createFakePrisma } from "./fake-prisma.js";
import { createLinkService } from "../src/services/link.service.js";

process.env.RATE_LIMIT_DISABLED = "true";
process.env.NODE_ENV = "test";
process.env.BASE_URL = "https://kli-k.id";

const WA_UA = "WhatsApp/2.23.20.0 A";
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120 Safari/537.36";

const lookup = async () => [{ address: "8.8.8.8", family: 4 }];

/** fetch tiruan: hanya mengenal halaman tujuan di tujuan.com. */
function targetFetch({ html, calls }) {
  return async (url, init) => {
    calls.push({ url, init });
    if (!html || !url.startsWith("https://tujuan.com/")) {
      throw new Error("koneksi ditolak");
    }
    return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  };
}

const TARGET_HTML = `<html><head>
  <meta property="og:title" content="Promo Akhir Tahun">
  <meta property="og:description" content="Diskon sampai 70%">
  <meta property="og:image" content="https://cdn.tujuan.com/promo.png">
  <meta property="og:site_name" content="Toko Tujuan">
</head><body></body></html>`;

let server;
let baseUrl;
let db;

before(async () => {
  db = createFakePrisma();
  await db.link.create({
    data: { slug: "promo", targetUrl: "https://tujuan.com/promo", userId: "user_1" },
  });
  await db.link.create({
    data: {
      slug: "manual",
      targetUrl: "https://tujuan.com/manual",
      title: "Judul Manual",
      description: "Deskripsi manual",
      userId: "user_1",
    },
  });
  await db.link.create({
    data: { slug: "mati", targetUrl: "https://mati.example.com/", userId: "user_1" },
  });
  await db.link.create({
    data: { slug: "nonaktif", targetUrl: "https://tujuan.com/", isActive: false, userId: "user_1" },
  });

  const calls = [];
  const app = createApp({
    db,
    serveFrontend: false,
    ogFetch: { fetchImpl: targetFetch({ html: TARGET_HTML, calls }), lookup },
  });
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

function get(path, userAgent) {
  return fetch(`${baseUrl}${path}`, { redirect: "manual", headers: { "user-agent": userAgent } });
}

test("crawler WhatsApp mendapat HTML OG dari halaman tujuan", async () => {
  const res = await get("/promo", WA_UA);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);

  const html = await res.text();
  assert.match(html, /<meta property="og:title" content="Promo Akhir Tahun">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/cdn\.tujuan\.com\/promo\.png">/);
  assert.match(html, /<meta property="og:description" content="Diskon sampai 70%">/);
  assert.match(html, /<meta property="og:site_name" content="Toko Tujuan">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/kli-k\.id\/promo">/);
});

test("HTML preview tidak boleh di-cache bersama (CDN/proxy)", async () => {
  // Regresi: directive `public` membuat CDN Hostinger menyimpan HTML crawler
  // lalu menyajikannya ke pengunjung biasa (yang seharusnya dapat 302).
  const res = await get("/promo", WA_UA);
  const cacheControl = res.headers.get("cache-control") ?? "";

  assert.match(cacheControl, /no-store/);
  assert.doesNotMatch(cacheControl, /public/);

  // Vary: Origin dari CORS tidak boleh hilang saat menambah User-Agent.
  const vary = res.headers.get("vary") ?? "";
  assert.match(vary, /User-Agent/i);
  assert.match(vary, /Origin/i);
});

test("redirect 302 juga menyatakan Vary: User-Agent", async () => {
  // URL yang sama punya dua bentuk response; cache bersama harus dibedakan
  // per User-Agent, bukan hanya per URL. Memakai /manual supaya penghitung
  // klik /promo di tes berikutnya tidak terpengaruh.
  const res = await get("/manual", BROWSER_UA);
  assert.equal(res.status, 302);
  assert.match(res.headers.get("vary") ?? "", /User-Agent/i);
});

test("berkas statis yang tidak ada tidak menembak database", async () => {
  // /favicon.ico pernah masuk route /:slug sehingga menghasilkan 500 di log
  // setiap kali database bermasalah.
  const db2 = createFakePrisma();
  let lookups = 0;
  const original = db2.link.findUnique;
  db2.link.findUnique = async (args) => {
    lookups += 1;
    return original(args);
  };

  const app = createApp({ db: db2, serveFrontend: false });
  const srv = app.listen(0);
  await new Promise((r) => srv.once("listening", r));
  const url = `http://127.0.0.1:${srv.address().port}`;

  try {
    for (const p of ["/favicon.ico", "/robots.txt", "/sitemap.xml"]) {
      const res = await fetch(`${url}${p}`);
      assert.equal(res.status, 404, `${p} harus 404`);
    }
    assert.equal(lookups, 0, "berkas statis tidak boleh menembak database");
  } finally {
    srv.close();
  }
});

test("crawler tidak dihitung sebagai klik", async () => {
  await get("/promo", WA_UA);
  const link = await db.link.findUnique({ where: { slug: "promo" } });
  assert.equal(link.clicks, 0, "share bukan kunjungan");
});

test("crawler kedua memakai cache, tidak fetch ulang", async () => {
  const beforeFetch = await db.link.findUnique({ where: { slug: "promo" } });
  const res = await get("/promo", "TelegramBot (like TwitterBot)");
  assert.equal(res.status, 200);

  const afterFetch = await db.link.findUnique({ where: { slug: "promo" } });
  assert.equal(afterFetch.ogFetchedAt.getTime(), beforeFetch.ogFetchedAt.getTime(), "ogFetchedAt tidak berubah");
});

test("pengunjung biasa tetap 302 dan klik tercatat", async () => {
  const res = await get("/promo", BROWSER_UA);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "https://tujuan.com/promo");

  // recordVisit berjalan di latar belakang; beri kesempatan satu tick.
  await new Promise((r) => setTimeout(r, 50));
  const link = await db.link.findUnique({ where: { slug: "promo" } });
  assert.equal(link.clicks, 1);
});

test("judul/deskripsi manual menang atas hasil scrape", async () => {
  const res = await get("/manual", WA_UA);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<meta property="og:title" content="Judul Manual">/);
  assert.match(html, /<meta property="og:description" content="Deskripsi manual">/);
});

test("tujuan yang tidak bisa diambil jatuh ke 302", async () => {
  const res = await get("/mati", WA_UA);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "https://mati.example.com/");
});

test("kegagalan di-cache sebagai cache negatif", async () => {
  const link = await db.link.findUnique({ where: { slug: "mati" } });
  assert.ok(link.ogFetchedAt instanceof Date, "ogFetchedAt terisi agar tidak dicoba terus");
  assert.equal(link.ogImage, null);
});

test("crawler membuka link nonaktif: 404 HTML, bukan JSON", async () => {
  const res = await get("/nonaktif", WA_UA);
  assert.equal(res.status, 404);
  assert.match(res.headers.get("content-type"), /text\/html/);
});

test("browser membuka link nonaktif: 404 JSON", async () => {
  const res = await get("/nonaktif", BROWSER_UA);
  assert.equal(res.status, 404);
  assert.match(res.headers.get("content-type"), /application\/json/);
});

// ------------------------------------------------------------ invalidasi cache

test("mengubah targetUrl mengosongkan cache OG", async () => {
  const link = await db.link.findUnique({ where: { slug: "promo" } });
  assert.ok(link.ogImage, "prasyarat: cache terisi dari tes sebelumnya");

  const service = createLinkService(db);
  await service.update("user_1", link.id, { targetUrl: "https://tujuan.com/baru" });

  const updated = await db.link.findUnique({ where: { slug: "promo" } });
  assert.equal(updated.ogImage, null);
  assert.equal(updated.ogFetchedAt, null);
});

test("mengubah judul saja tidak mengosongkan cache OG", async () => {
  const service = createLinkService(db);
  const link = await db.link.findUnique({ where: { slug: "promo" } });

  await db.link.update({
    where: { id: link.id },
    data: { ogImage: "https://cdn.tujuan.com/lama.png", ogFetchedAt: new Date() },
  });

  await service.update("user_1", link.id, { title: "Judul baru" });

  const updated = await db.link.findUnique({ where: { slug: "promo" } });
  assert.equal(updated.ogImage, "https://cdn.tujuan.com/lama.png");
});
