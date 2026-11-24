import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isCrawler,
  isPrivateAddress,
  assertPublicUrl,
  fetchOg,
  parseOg,
  renderOgHtml,
  decodeEntities,
} from "../src/lib/og.js";

// ---------------------------------------------------------------- isCrawler

test("isCrawler: bot media sosial dikenali", () => {
  const uas = [
    "WhatsApp/2.23.20.0 A",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Facebot",
    "Twitterbot/1.0",
    "TelegramBot (like TwitterBot)",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "Discordbot/2.0",
    "LinkedInBot/1.0",
    "Pinterest/0.2",
    "Mozilla/5.0 (compatible; SkypeUriPreview)",
  ];

  for (const ua of uas) {
    assert.equal(isCrawler(ua), true, `${ua} seharusnya crawler`);
  }
});

test("isCrawler: browser dan Googlebot bukan crawler preview", () => {
  const uas = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "curl/8.4.0",
    "",
    undefined,
  ];

  for (const ua of uas) {
    assert.equal(isCrawler(ua), false, `${ua} seharusnya bukan crawler`);
  }
});

// ---------------------------------------------------------------- SSRF

test("isPrivateAddress: alamat internal dikenali", () => {
  const blocked = [
    "127.0.0.1",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
  ];

  for (const ip of blocked) {
    assert.equal(isPrivateAddress(ip), true, `${ip} seharusnya ditolak`);
  }
});

test("isPrivateAddress: alamat publik diterima", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "203.0.113.10", "2606:4700::1111"]) {
    assert.equal(isPrivateAddress(ip), false, `${ip} seharusnya diterima`);
  }
});

test("assertPublicUrl: host privat dan port aneh ditolak", async () => {
  const lookup = async () => [{ address: "8.8.8.8", family: 4 }];

  await assert.rejects(() => assertPublicUrl("http://127.0.0.1/admin", { lookup }), /privat/);
  await assert.rejects(() => assertPublicUrl("http://169.254.169.254/latest", { lookup }), /privat/);
  await assert.rejects(() => assertPublicUrl("http://localhost/", { lookup: async () => [{ address: "127.0.0.1" }] }), /privat/);
  await assert.rejects(() => assertPublicUrl("ftp://example.com/file", { lookup }), /protokol/);
  await assert.rejects(() => assertPublicUrl("https://example.com:8080/", { lookup }), /port/);
  await assert.rejects(() => assertPublicUrl("https://user:pass@example.com/", { lookup }), /kredensial/);

  const ok = await assertPublicUrl("https://example.com/halaman", { lookup });
  assert.equal(ok.hostname, "example.com");
});

test("assertPublicUrl: host yang resolve ke alamat privat ditolak", async () => {
  const lookup = async () => [
    { address: "8.8.8.8", family: 4 },
    { address: "10.1.2.3", family: 4 },
  ];

  await assert.rejects(() => assertPublicUrl("https://evil.example.com/", { lookup }), /privat/);
});

// ---------------------------------------------------------------- parser

test("parseOg: OG lengkap dengan gambar absolut", () => {
  const html = `<html><head>
    <meta property="og:title" content="Judul &amp; Tes">
    <meta property="og:description" content="Deskripsi halaman">
    <meta property="og:image" content="https://cdn.tujuan.com/gambar.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:site_name" content="Tujuan">
  </head><body></body></html>`;

  const og = parseOg(html, "https://tujuan.com/artikel");
  assert.equal(og.title, "Judul & Tes");
  assert.equal(og.description, "Deskripsi halaman");
  assert.equal(og.image, "https://cdn.tujuan.com/gambar.png");
  assert.equal(og.siteName, "Tujuan");
  assert.equal(og.imageWidth, 1200);
  assert.equal(og.imageHeight, 630);
});

test("parseOg: gambar relatif dijadikan absolut terhadap URL halaman", () => {
  const html = `<head><meta property="og:image" content="/img/hero.jpg"></head>`;
  const og = parseOg(html, "https://tujuan.com/artikel/123?x=1");
  assert.equal(og.image, "https://tujuan.com/img/hero.jpg");
});

test("parseOg: fallback ke twitter card lalu tag HTML biasa", () => {
  const html = `<head>
    <title>Judul Dokumen</title>
    <meta name="description" content="Deskripsi meta biasa">
    <meta name="twitter:image" content="https://cdn.tujuan.com/tw.png">
  </head>`;

  const og = parseOg(html, "https://tujuan.com/");
  assert.equal(og.title, "Judul Dokumen");
  assert.equal(og.description, "Deskripsi meta biasa");
  assert.equal(og.image, "https://cdn.tujuan.com/tw.png");
});

test("parseOg: tanpa metadata sama sekali menghasilkan nilai null", () => {
  const og = parseOg("<html><head></head><body>kosong</body></html>", "https://tujuan.com/");
  assert.equal(og.title, null);
  assert.equal(og.description, null);
  assert.equal(og.image, null);
});

test("parseOg: gambar non-http (data:) diabaikan", () => {
  const html = `<head><meta property="og:image" content="data:image/png;base64,AAAA"></head>`;
  assert.equal(parseOg(html, "https://tujuan.com/").image, null);
});

test("decodeEntities: numerik dan named entity", () => {
  assert.equal(decodeEntities("a &amp; b &#39;c&#39; &#x2014; d"), "a & b 'c' — d");
});

// ---------------------------------------------------------------- fetchOg

function htmlResponse(body, { url = "https://tujuan.com/", status = 200, contentType = "text/html; charset=utf-8" } = {}) {
  return new Response(body, {
    status,
    headers: { "content-type": contentType, "content-location": url },
  });
}

test("fetchOg: mengambil dan mem-parse HTML tujuan", async () => {
  const html = `<head>
    <meta property="og:title" content="Promo Akhir Tahun">
    <meta property="og:image" content="https://cdn.tujuan.com/promo.png">
  </head>`;

  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const res = htmlResponse(html);
    Object.defineProperty(res, "url", { value: url });
    return res;
  };

  const lookup = async () => [{ address: "8.8.8.8", family: 4 }];
  const result = await fetchOg("https://tujuan.com/promo", { fetchImpl, lookup });

  assert.equal(result.ok, true);
  assert.equal(result.og.title, "Promo Akhir Tahun");
  assert.equal(result.og.image, "https://cdn.tujuan.com/promo.png");
  assert.equal(calls.length, 1);
  assert.match(calls[0].init.headers["user-agent"], /facebookexternalhit/);
});

test("fetchOg: mengikuti redirect selama masih alamat publik", async () => {
  const lookup = async () => [{ address: "8.8.8.8", family: 4 }];
  const seen = [];

  const fetchImpl = async (url) => {
    seen.push(url);
    if (url === "https://tujuan.com/pendek") {
      return new Response(null, { status: 302, headers: { location: "/final" } });
    }
    const res = htmlResponse('<head><meta property="og:title" content="Final"></head>');
    Object.defineProperty(res, "url", { value: url });
    return res;
  };

  const result = await fetchOg("https://tujuan.com/pendek", { fetchImpl, lookup });
  assert.equal(result.ok, true);
  assert.equal(result.og.title, "Final");
  assert.deepEqual(seen, ["https://tujuan.com/pendek", "https://tujuan.com/final"]);
});

test("fetchOg: redirect ke alamat privat ditolak", async () => {
  const lookup = async () => [{ address: "8.8.8.8", family: 4 }];

  const fetchImpl = async (url) => {
    if (url === "https://tujuan.com/pendek") {
      return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } });
    }
    throw new Error("tidak boleh sampai ke sini");
  };

  const result = await fetchOg("https://tujuan.com/pendek", { fetchImpl, lookup });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "UNSAFE_URL");
});

test("fetchOg: respons bukan HTML dilewati", async () => {
  const lookup = async () => [{ address: "8.8.8.8", family: 4 }];
  const fetchImpl = async () => htmlResponse("{}", { contentType: "application/json" });

  const result = await fetchOg("https://tujuan.com/api", { fetchImpl, lookup });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "NOT_HTML");
});

test("fetchOg: berhenti membaca setelah </head>, tidak menunggu seluruh body", async () => {
  const lookup = async () => [{ address: "8.8.8.8", family: 4 }];

  const head = '<head><meta property="og:title" content="Ringkas"></head>';
  const tail = "y".repeat(500_000);
  let sent = 0;
  let offset = 0;

  // Stream pull-based: chunk baru dibuat saat pembaca memintanya, sehingga
  // `sent` benar-benar mencerminkan berapa banyak body yang dikonsumsi.
  const stream = new ReadableStream(
    {
      pull(controller) {
        if (offset >= head.length + tail.length) {
          controller.close();
          return;
        }
        const chunk = offset < head.length ? head.slice(offset, offset + 100) : tail.slice(offset - head.length, offset - head.length + 100);
        offset += chunk.length;
        sent += chunk.length;
        controller.enqueue(new TextEncoder().encode(chunk));
      },
    },
    { highWaterMark: 1 },
  );

  const fetchImpl = async () => new Response(stream, { status: 200, headers: { "content-type": "text/html" } });
  const result = await fetchOg("https://tujuan.com/panjang", { fetchImpl, lookup });

  assert.equal(result.ok, true);
  assert.equal(result.og.title, "Ringkas");
  assert.ok(sent < head.length + tail.length, `hanya ${sent} byte dibaca, bukan seluruh dokumen`);
});

test("fetchOg: <head> tidak pernah ditutup dipotong di batas ukuran", async () => {
  const lookup = async () => [{ address: "8.8.8.8", family: 4 }];
  const html = '<head><meta property="og:title" content="Awal">' + "z".repeat(5000);
  const fetchImpl = async () => htmlResponse(html);

  const result = await fetchOg("https://tujuan.com/besar", { fetchImpl, lookup, maxBytes: 1024 });
  // Metadata di awal tetap terbaca walau dokumennya dipotong.
  assert.equal(result.ok, true);
  assert.equal(result.og.title, "Awal");
});

test("fetchOg: tanpa metadata dianggap gagal", async () => {
  const lookup = async () => [{ address: "8.8.8.8", family: 4 }];
  const fetchImpl = async () => htmlResponse("<head></head><body>x</body>");

  const result = await fetchOg("https://tujuan.com/kosong", { fetchImpl, lookup });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "NO_OG");
});

// ---------------------------------------------------------------- render

test("renderOgHtml: meta OG memakai data tujuan dan teks link menang", () => {
  const html = renderOgHtml({
    link: { slug: "promo", targetUrl: "https://tujuan.com/promo", title: "Judul Manual", description: null },
    og: { title: "Judul Tujuan", description: "Deskripsi tujuan", image: "https://cdn.tujuan.com/a.png", siteName: "Tujuan" },
    canonicalUrl: "https://kli-k.id/promo",
  });

  assert.match(html, /<meta property="og:title" content="Judul Manual">/);
  assert.match(html, /<meta property="og:description" content="Deskripsi tujuan">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/cdn\.tujuan\.com\/a\.png">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/kli-k\.id\/promo">/);
  assert.match(html, /<meta property="og:site_name" content="Tujuan">/);
  assert.match(html, /twitter:card" content="summary_large_image"/);
});

test("renderOgHtml: imageUrl menimpa gambar asal (proxy same-origin)", () => {
  const html = renderOgHtml({
    link: { slug: "promo", targetUrl: "https://tujuan.com/promo", title: null, description: null },
    og: { title: "Tujuan", description: null, image: "https://cdn.tujuan.com/a.png", siteName: null },
    canonicalUrl: "https://kli-k.id/promo",
    imageUrl: "https://kli-k.id/og-image/promo",
  });

  assert.match(html, /og:image" content="https:\/\/kli-k\.id\/og-image\/promo"/);
  assert.doesNotMatch(html, /cdn\.tujuan\.com/);
});

test("renderOgHtml: tanpa meta refresh dan tanpa noindex", () => {
  const html = renderOgHtml({
    link: { slug: "promo", targetUrl: "https://tujuan.com/promo", title: null, description: null },
    og: { title: "Tujuan", description: null, image: null, siteName: null },
    canonicalUrl: "https://kli-k.id/promo",
  });

  assert.doesNotMatch(html, /http-equiv="refresh"/i);
  assert.doesNotMatch(html, /name="robots"/i);
});

test("renderOgHtml: tanpa gambar tetap valid dan tanpa tag og:image", () => {
  const html = renderOgHtml({
    link: { slug: "promo", targetUrl: "https://tujuan.com/promo", title: null, description: null },
    og: { title: "Judul Tujuan", description: null, image: null, siteName: null },
    canonicalUrl: "https://kli-k.id/promo",
  });

  assert.doesNotMatch(html, /og:image"/);
  assert.match(html, /twitter:card" content="summary"/);
});

test("renderOgHtml: nilai berbahaya di-escape", () => {
  const html = renderOgHtml({
    link: { slug: "x", targetUrl: "https://tujuan.com/?a=1&b=2", title: '<script>alert("x")</script>', description: null },
    og: null,
    canonicalUrl: "https://kli-k.id/x",
  });

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /a=1&amp;b=2/);
});
