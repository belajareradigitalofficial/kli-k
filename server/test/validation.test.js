import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTargetUrl } from "../src/lib/url.js";
import { normalizeSlug, generateSlug } from "../src/lib/slug.js";
import { validateRegister, validateLogin } from "../src/lib/validation.js";
import { hashSessionToken, createSessionToken, parseCookies } from "../src/lib/session.js";
import { hashPassword, verifyPassword } from "../src/lib/password.js";

// ------------------------------------------------------------ URL

test("validateTargetUrl menerima http dan https", () => {
  assert.equal(validateTargetUrl("https://example.com/a?b=1"), "https://example.com/a?b=1");
  assert.equal(validateTargetUrl("http://example.com"), "http://example.com/");
});

test("validateTargetUrl menolak skema berbahaya", () => {
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd"]) {
    assert.throws(() => validateTargetUrl(bad), /http atau https/);
  }
});

test("validateTargetUrl menolak embedded credentials", () => {
  assert.throws(() => validateTargetUrl("https://user:pass@example.com"), /kredensial/);
});

test("validateTargetUrl menolak URL tidak valid, kosong, dan terlalu panjang", () => {
  assert.throws(() => validateTargetUrl("bukan-url"), /bukan URL yang valid/);
  assert.throws(() => validateTargetUrl(""), /wajib diisi/);
  assert.throws(() => validateTargetUrl(123), /wajib diisi/);
  assert.throws(() => validateTargetUrl(`https://example.com/${"a".repeat(9000)}`), /maksimal/);
});

// ------------------------------------------------------------ slug

test("normalizeSlug lowercase dan validasi format", () => {
  assert.equal(normalizeSlug("Promo2024"), "promo2024");
  assert.equal(normalizeSlug(""), null);
  assert.equal(normalizeSlug(null), null);
});

test("normalizeSlug menolak reserved dan format salah", () => {
  assert.throws(() => normalizeSlug("api"), /dipakai sistem/);
  assert.throws(() => normalizeSlug("ab"), /3-32/);
  assert.throws(() => normalizeSlug("spasi ada"), /huruf kecil/);
  assert.throws(() => normalizeSlug("a".repeat(33)), /3-32/);
});

test("generateSlug menghasilkan slug valid dan bervariasi", () => {
  const slugs = new Set();
  for (let i = 0; i < 50; i += 1) {
    const slug = generateSlug();
    assert.match(slug, /^[a-z0-9]{7}$/);
    slugs.add(slug);
  }
  assert.ok(slugs.size > 45);
});

// ------------------------------------------------------------ akun

test("validateRegister menormalkan email dan nama", () => {
  const out = validateRegister({
    name: "  Budi   Santoso ",
    email: "  BUDI@Example.COM ",
    password: "rahasia123",
  });
  assert.equal(out.name, "Budi Santoso");
  assert.equal(out.email, "budi@example.com");
});

test("validateRegister menolak input tidak valid", () => {
  assert.throws(() => validateRegister({ name: "", email: "a@b.com", password: "rahasia123" }), /nama/);
  assert.throws(() => validateRegister({ name: "A", email: "x", password: "rahasia123" }), /email/);
  assert.throws(() => validateRegister({ name: "A", email: "a@b.com", password: "pendek" }), /minimal/);
  assert.throws(() => validateRegister(null), /objek JSON/);
});

test("validateLogin menolak password kosong", () => {
  assert.throws(() => validateLogin({ email: "a@b.com", password: "" }), /password/);
});

// ------------------------------------------------------------ password

test("hashPassword dan verifyPassword konsisten", async () => {
  const hash = await hashPassword("rahasia123");
  assert.notEqual(hash, "rahasia123");
  assert.equal(await verifyPassword("rahasia123", hash), true);
  assert.equal(await verifyPassword("salah", hash), false);
});

test("password sangat panjang dipotong pada 72 byte tanpa error", async () => {
  const long = "a".repeat(200);
  const hash = await hashPassword(long);
  assert.equal(await verifyPassword(long, hash), true);
});

// ------------------------------------------------------------ sesi

test("hashSessionToken deterministik dan tidak mengembalikan token asli", () => {
  const token = createSessionToken();
  assert.notEqual(hashSessionToken(token), token);
  assert.equal(hashSessionToken(token), hashSessionToken(token));
  assert.equal(hashSessionToken(token).length, 64);
});

test("createSessionToken menghasilkan token berbeda", () => {
  assert.notEqual(createSessionToken(), createSessionToken());
});

test("parseCookies membaca pasangan dengan benar", () => {
  const out = parseCookies("a=1; klik_session=abc%3D; b=2");
  assert.equal(out.a, "1");
  assert.equal(out.klik_session, "abc=");
  assert.equal(out.b, "2");
  assert.deepEqual(parseCookies(""), {});
  assert.deepEqual(parseCookies(undefined), {});
});
