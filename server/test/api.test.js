import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { createFakePrisma } from "./fake-prisma.js";

// Banyak request dari satu IP di tes ini akan menabrak rate limiter, yang
// tidak relevan untuk menguji logika. Limiternya dimatikan khusus di sini.
process.env.RATE_LIMIT_DISABLED = "true";

let server;
let baseUrl;

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.BASE_URL = "http://localhost:3000";
  process.env.CORS_ORIGIN = "http://localhost:5173";

  const app = createApp({ db: createFakePrisma() });
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

/** Helper: request JSON + simpan cookie sesi. */
function client() {
  let cookie = "";
  return {
    get cookie() {
      return cookie;
    },
    async req(path, { method = "GET", body, headers = {}, origin = true } = {}) {
      const finalHeaders = { ...headers };
      if (body !== undefined) finalHeaders["Content-Type"] = "application/json";
      if (cookie) finalHeaders["Cookie"] = cookie;
      if (origin && method !== "GET" && method !== "HEAD") {
        finalHeaders["Origin"] = "http://localhost:5173";
      }
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: finalHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "manual",
      });
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0];
      return res;
    },
  };
}

async function register(c, email = `user${Math.random().toString(36).slice(2)}@test.com`) {
  const res = await c.req("/api/auth/register", {
    method: "POST",
    body: { name: "Pengguna Uji", email, password: "rahasia123" },
  });
  assert.equal(res.status, 201);
  return res.json();
}

// ------------------------------------------------------------ auth

test("register membuat akun dan mengirim cookie sesi", async () => {
  const c = client();
  const res = await c.req("/api/auth/register", {
    method: "POST",
    body: { name: "Budi", email: "budi@test.com", password: "rahasia123" },
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.user.email, "budi@test.com");
  assert.equal(body.user.passwordHash, undefined, "hash tidak boleh dikirim ke klien");
  assert.match(res.headers.get("set-cookie"), /HttpOnly/);
});

test("register menolak email duplikat", async () => {
  const c = client();
  await c.req("/api/auth/register", {
    method: "POST",
    body: { name: "A", email: "sama@test.com", password: "rahasia123" },
  });
  const res = await c.req("/api/auth/register", {
    method: "POST",
    body: { name: "B", email: "sama@test.com", password: "rahasia123" },
  });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, "EMAIL_TAKEN");
});

test("register memvalidasi email dan password", async () => {
  const c = client();
  const badEmail = await c.req("/api/auth/register", {
    method: "POST",
    body: { name: "X", email: "bukan-email", password: "rahasia123" },
  });
  assert.equal(badEmail.status, 400);

  const shortPw = await c.req("/api/auth/register", {
    method: "POST",
    body: { name: "X", email: "x@test.com", password: "123" },
  });
  assert.equal(shortPw.status, 400);
});

test("login berhasil dengan kredensial benar", async () => {
  const reg = client();
  await reg.req("/api/auth/register", {
    method: "POST",
    body: { name: "Sari", email: "sari@test.com", password: "rahasia123" },
  });

  const c = client();
  const res = await c.req("/api/auth/login", {
    method: "POST",
    body: { email: "sari@test.com", password: "rahasia123" },
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).user.email, "sari@test.com");
});

test("login gagal dengan password salah, pesan generik", async () => {
  const c = client();
  const res = await c.req("/api/auth/login", {
    method: "POST",
    body: { email: "sari@test.com", password: "salahsekali" },
  });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, "INVALID_CREDENTIALS");
});

test("login gagal untuk email yang tidak terdaftar, pesan sama", async () => {
  const c = client();
  const res = await c.req("/api/auth/login", {
    method: "POST",
    body: { email: "tidakada@test.com", password: "rahasia123" },
  });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, "INVALID_CREDENTIALS");
});

test("GET /api/auth/me butuh login", async () => {
  const anon = client();
  assert.equal((await anon.req("/api/auth/me")).status, 401);

  const c = client();
  await register(c);
  const res = await c.req("/api/auth/me");
  assert.equal(res.status, 200);
  assert.ok((await res.json()).user.email);
});

test("logout mencabut sesi", async () => {
  const c = client();
  await register(c);
  assert.equal((await c.req("/api/auth/me")).status, 200);

  const out = await c.req("/api/auth/logout", { method: "POST" });
  assert.equal(out.status, 204);

  // cookie lama masih dikirim, tapi sesi sudah tidak ada di DB
  assert.equal((await c.req("/api/auth/me")).status, 401);
});

// ------------------------------------------------------------ csrf

test("mutasi dengan Origin asing ditolak 403", async () => {
  const c = client();
  await register(c);
  const res = await c.req("/api/links", {
    method: "POST",
    body: { targetUrl: "https://example.com" },
    origin: false,
    headers: { Origin: "https://jahat.example" },
  });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, "CSRF_ORIGIN_REJECTED");
});

// ------------------------------------------------------------ links

test("POST /api/links wajib login", async () => {
  const anon = client();
  const res = await anon.req("/api/links", {
    method: "POST",
    body: { targetUrl: "https://example.com" },
  });
  assert.equal(res.status, 401);
});

test("membuat link dengan slug acak dan custom", async () => {
  const c = client();
  await register(c);

  const auto = await c.req("/api/links", {
    method: "POST",
    body: { targetUrl: "https://example.com/tujuan", title: "Contoh" },
  });
  assert.equal(auto.status, 201);
  const autoBody = await auto.json();
  assert.match(autoBody.slug, /^[a-z0-9]{7}$/);
  assert.equal(autoBody.title, "Contoh");
  assert.equal(autoBody.shortUrl, `http://localhost:3000/${autoBody.slug}`);

  const custom = await c.req("/api/links", {
    method: "POST",
    body: { targetUrl: "https://example.com", slug: "PromoHebat" },
  });
  assert.equal(custom.status, 201);
  assert.equal((await custom.json()).slug, "promohebat");
});

test("membuat link menolak URL berbahaya", async () => {
  const c = client();
  await register(c);
  const res = await c.req("/api/links", {
    method: "POST",
    body: { targetUrl: "javascript:alert(1)" },
  });
  assert.equal(res.status, 400);
});

test("slug duplikat ditolak 409", async () => {
  const c = client();
  await register(c);
  await c.req("/api/links", {
    method: "POST",
    body: { targetUrl: "https://a.com", slug: "duplikat" },
  });
  const res = await c.req("/api/links", {
    method: "POST",
    body: { targetUrl: "https://b.com", slug: "duplikat" },
  });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, "SLUG_TAKEN");
});

test("list hanya menampilkan link milik sendiri", async () => {
  const a = client();
  await register(a);
  await a.req("/api/links", {
    method: "POST",
    body: { targetUrl: "https://milik-a.com", slug: "punya-a" },
  });

  const b = client();
  await register(b);

  const listB = await (await b.req("/api/links")).json();
  assert.equal(listB.total, 0, "user B tidak boleh melihat link user A");

  const listA = await (await a.req("/api/links")).json();
  assert.equal(listA.total, 1);
  assert.equal(listA.items[0].slug, "punya-a");
});

test("user lain tidak bisa membaca, mengubah, atau menghapus link", async () => {
  const a = client();
  await register(a);
  const link = await (
    await a.req("/api/links", {
      method: "POST",
      body: { targetUrl: "https://rahasia.com", slug: "milik-a-saja" },
    })
  ).json();

  const b = client();
  await register(b);

  assert.equal((await b.req(`/api/links/${link.id}`)).status, 404);
  assert.equal(
    (await b.req(`/api/links/${link.id}`, {
      method: "PATCH",
      body: { targetUrl: "https://diubah.com" },
    })).status,
    404,
  );
  assert.equal((await b.req(`/api/links/${link.id}`, { method: "DELETE" })).status, 404);
  assert.equal((await b.req(`/api/links/${link.id}/stats`)).status, 404);
});

test("PATCH memperbarui target dan status", async () => {
  const c = client();
  await register(c);
  const link = await (
    await c.req("/api/links", {
      method: "POST",
      body: { targetUrl: "https://lama.com", slug: "patchtest" },
    })
  ).json();

  const res = await c.req(`/api/links/${link.id}`, {
    method: "PATCH",
    body: { targetUrl: "https://baru.com", isActive: false },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.targetUrl, "https://baru.com/");
  assert.equal(body.isActive, false);
});

test("summary menghitung total link dan klik", async () => {
  const c = client();
  await register(c);
  await c.req("/api/links", {
    method: "POST",
    body: { targetUrl: "https://s1.com", slug: "sum1" },
  });
  await c.req("/api/links", {
    method: "POST",
    body: { targetUrl: "https://s2.com", slug: "sum2" },
  });

  const res = await c.req("/api/links/summary");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.totalLinks, 2);
  assert.equal(body.totalClicks, 0);
  assert.equal(body.activeLinks, 2);
});

// ------------------------------------------------------------ redirect

test("redirect 302 menambah clicks, HEAD tidak dihitung", async () => {
  const c = client();
  await register(c);
  const link = await (
    await c.req("/api/links", {
      method: "POST",
      body: { targetUrl: "https://tujuan.com", slug: "redirect1" },
    })
  ).json();

  const res = await fetch(`${baseUrl}/redirect1`, { redirect: "manual" });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "https://tujuan.com/");
  assert.equal(res.headers.get("cache-control"), "no-store");

  await new Promise((r) => setTimeout(r, 50));

  const head = await fetch(`${baseUrl}/redirect1`, { method: "HEAD", redirect: "manual" });
  assert.equal(head.status, 302);
  await new Promise((r) => setTimeout(r, 50));

  const stats = await (await c.req(`/api/links/${link.id}/stats`)).json();
  assert.equal(stats.clicks, 1, "HEAD tidak boleh dihitung");
  assert.ok(stats.recentVisits.length >= 1);
});

test("redirect 404 untuk slug tak dikenal, 404 nonaktif, 410 kedaluwarsa", async () => {
  const c = client();
  await register(c);

  assert.equal((await fetch(`${baseUrl}/tidakada`, { redirect: "manual" })).status, 404);

  await c.req("/api/links", {
    method: "POST",
    body: { targetUrl: "https://x.com", slug: "nonaktif", isActive: false },
  });
  assert.equal((await fetch(`${baseUrl}/nonaktif`, { redirect: "manual" })).status, 404);

  await c.req("/api/links", {
    method: "POST",
    body: {
      targetUrl: "https://y.com",
      slug: "kadaluarsa",
      expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
    },
  });
  assert.equal((await fetch(`${baseUrl}/kadaluarsa`, { redirect: "manual" })).status, 410);
});

test("DELETE menghapus link", async () => {
  const c = client();
  await register(c);
  const link = await (
    await c.req("/api/links", {
      method: "POST",
      body: { targetUrl: "https://del.com", slug: "deltest" },
    })
  ).json();

  assert.equal((await c.req(`/api/links/${link.id}`, { method: "DELETE" })).status, 204);
  assert.equal((await fetch(`${baseUrl}/deltest`, { redirect: "manual" })).status, 404);
});

// ------------------------------------------------------------ custom alias

test("check-slug: alias tersedia dan sudah dipakai", async () => {
  const c = client();
  await register(c);
  await c.req("/api/links", {
    method: "POST",
    body: { targetUrl: "https://x.com", slug: "sudah-dipakai" },
  });

  const free = await (await c.req("/api/links/check-slug?slug=masih-kosong")).json();
  assert.equal(free.available, true);
  assert.equal(free.slug, "masih-kosong");

  const taken = await (await c.req("/api/links/check-slug?slug=sudah-dipakai")).json();
  assert.equal(taken.available, false);
  assert.equal(taken.reason, "SLUG_TAKEN");
  assert.match(taken.message, /sudah digunakan/i);
});

test("check-slug: alias tidak valid dan reserved", async () => {
  const c = client();
  await register(c);

  const invalid = await (await c.req("/api/links/check-slug?slug=ab")).json();
  assert.equal(invalid.available, false);
  assert.equal(invalid.reason, "INVALID_SLUG");

  const reserved = await (await c.req("/api/links/check-slug?slug=api")).json();
  assert.equal(reserved.available, false);
  assert.equal(reserved.reason, "RESERVED_SLUG");
});

test("check-slug: alias sendiri tidak dianggap bentrok (excludeId)", async () => {
  const c = client();
  await register(c);
  const link = await (
    await c.req("/api/links", {
      method: "POST",
      body: { targetUrl: "https://x.com", slug: "punyaku" },
    })
  ).json();

  const tanpaExclude = await (await c.req("/api/links/check-slug?slug=punyaku")).json();
  assert.equal(tanpaExclude.available, false);

  const denganExclude = await (
    await c.req(`/api/links/check-slug?slug=punyaku&excludeId=${link.id}`)
  ).json();
  assert.equal(denganExclude.available, true);
});

test("check-slug wajib login", async () => {
  const anon = client();
  assert.equal((await anon.req("/api/links/check-slug?slug=apa")).status, 401);
});

test("PATCH bisa mengubah alias", async () => {
  const c = client();
  await register(c);
  const link = await (
    await c.req("/api/links", {
      method: "POST",
      body: { targetUrl: "https://x.com", slug: "alias-lama" },
    })
  ).json();

  const res = await c.req(`/api/links/${link.id}`, {
    method: "PATCH",
    body: { slug: "Alias-Baru" },
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).slug, "alias-baru", "alias dinormalisasi huruf kecil");

  // alamat baru berfungsi, alamat lama mati
  assert.equal((await fetch(`${baseUrl}/alias-baru`, { redirect: "manual" })).status, 302);
  assert.equal((await fetch(`${baseUrl}/alias-lama`, { redirect: "manual" })).status, 404);
});

test("PATCH alias bentrok ditolak 409", async () => {
  const c = client();
  await register(c);
  await c.req("/api/links", {
    method: "POST",
    body: { targetUrl: "https://a.com", slug: "sudah-ada" },
  });
  const link = await (
    await c.req("/api/links", {
      method: "POST",
      body: { targetUrl: "https://b.com", slug: "akan-diganti" },
    })
  ).json();

  const res = await c.req(`/api/links/${link.id}`, {
    method: "PATCH",
    body: { slug: "sudah-ada" },
  });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, "SLUG_TAKEN");
});

test("PATCH alias kosong ditolak", async () => {
  const c = client();
  await register(c);
  const link = await (
    await c.req("/api/links", {
      method: "POST",
      body: { targetUrl: "https://x.com", slug: "tetap-ada" },
    })
  ).json();

  const res = await c.req(`/api/links/${link.id}`, {
    method: "PATCH",
    body: { slug: "" },
  });
  assert.equal(res.status, 400);
});

test("PATCH alias sama dengan sebelumnya tidak error", async () => {
  const c = client();
  await register(c);
  const link = await (
    await c.req("/api/links", {
      method: "POST",
      body: { targetUrl: "https://x.com", slug: "sama-saja" },
    })
  ).json();

  const res = await c.req(`/api/links/${link.id}`, {
    method: "PATCH",
    body: { slug: "sama-saja", title: "Judul baru" },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.slug, "sama-saja");
  assert.equal(body.title, "Judul baru");
});

test("GET /api/config mengembalikan baseUrl", async () => {
  const res = await fetch(`${baseUrl}/api/config`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).baseUrl, "http://localhost:3000");
});

test("GET /api/health tetap berfungsi tanpa login", async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok" });
});
