import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";
import { createFakePrisma } from "./fake-prisma.js";
import { isSpaPath } from "../src/lib/frontend.js";

process.env.RATE_LIMIT_DISABLED = "true";

const INDEX_HTML =
  "<!doctype html><html><body><div id=\"root\">SPA</div></body></html>";

let server;
let baseUrl;
let distDir;

before(async () => {
  // dist tiruan di direktori sementara — tidak menyentuh hasil build asli.
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), "klik-dist-"));
  fs.writeFileSync(path.join(distDir, "index.html"), INDEX_HTML);
  fs.mkdirSync(path.join(distDir, "assets"));
  fs.writeFileSync(path.join(distDir, "assets", "app.js"), "console.log('app')");

  process.env.NODE_ENV = "test";
  process.env.BASE_URL = "http://localhost:3000";

  const db = createFakePrisma();
  await db.link.create({
    data: { slug: "ada", targetUrl: "https://tujuan.com/", userId: "user_1" },
  });

  const app = createApp({ db, serveFrontend: true, distDir });
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(distDir, { recursive: true, force: true });
});

test("isSpaPath: rute aplikasi dikenal, slug tidak", () => {
  for (const p of ["/", "/login", "/register", "/dashboard", "/dashboard/links/x"]) {
    assert.equal(isSpaPath(p), true, `${p} seharusnya SPA`);
  }
  for (const p of ["/ada", "/promo", "/api/health", "/tidak-ada"]) {
    assert.equal(isSpaPath(p), false, `${p} seharusnya bukan SPA`);
  }
});

test("rute aplikasi dilayani index.html", async () => {
  for (const p of ["/", "/login", "/register", "/dashboard", "/dashboard/links/abc"]) {
    const res = await fetch(`${baseUrl}${p}`);
    assert.equal(res.status, 200, `${p} harus 200`);
    assert.match(res.headers.get("content-type"), /text\/html/);
    assert.match(await res.text(), /SPA/);
  }
});

test("aset statis dilayani apa adanya", async () => {
  const res = await fetch(`${baseUrl}/assets/app.js`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /console\.log/);
});

test("API tidak tertelan frontend", async () => {
  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, "ok");
});

test("API 404 tetap JSON, bukan index.html", async () => {
  const res = await fetch(`${baseUrl}/api/tidak-ada`);
  assert.equal(res.status, 404);
  assert.match(res.headers.get("content-type"), /application\/json/);
});

test("slug yang ada tetap redirect 302", async () => {
  const res = await fetch(`${baseUrl}/ada`, { redirect: "manual" });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "https://tujuan.com/");
});

test("slug tidak dikenal 404, bukan halaman aplikasi", async () => {
  const res = await fetch(`${baseUrl}/slug-tidak-ada`);
  assert.equal(res.status, 404);
  assert.doesNotMatch(res.headers.get("content-type") ?? "", /text\/html/);
});

// ------------------------------------------------------------ urutan route

test("aset statis tidak menyentuh database", async () => {
  // Sebelumnya /favicon.svg masuk ke route /:slug dan memicu findUnique,
  // sehingga satu file statis bisa membuat situs 500 saat DB bermasalah.
  const db = createFakePrisma();
  let lookups = 0;
  const original = db.link.findUnique;
  db.link.findUnique = async (args) => {
    lookups += 1;
    return original(args);
  };

  const app = createApp({ db, serveFrontend: true, distDir });
  const srv = app.listen(0);
  await new Promise((r) => srv.once("listening", r));
  const url = `http://127.0.0.1:${srv.address().port}`;

  try {
    const res = await fetch(`${url}/assets/app.js`);
    assert.equal(res.status, 200);
    assert.equal(lookups, 0, "aset statis tidak boleh menembak database");

    // Slug yang benar-benar ada tetap harus redirect.
    await fetch(`${url}/ada`, { redirect: "manual" });
    assert.equal(lookups, 1, "route /:slug tetap memeriksa database");
  } finally {
    srv.close();
  }
});

