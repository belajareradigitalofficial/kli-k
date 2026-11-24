import dns from "node:dns/promises";
import net from "node:net";

/**
 * Pengambilan metadata Open Graph dari halaman tujuan.
 *
 * Dipakai saat crawler media sosial (WhatsApp, Telegram, …) meminta preview
 * short link. Tujuannya: preview yang muncul memakai judul/gambar milik situs
 * tujuan, bukan halaman kli-k.id sendiri.
 *
 * Catatan keamanan: URL tujuan diisi pengguna, jadi server ini bisa dipaksa
 * melakukan request ke alamat internal (SSRF). Karena itu setiap URL — termasuk
 * setiap lompatan redirect — diperiksa dulu terhadap alamat privat.
 */

const CRAWLER_PATTERNS = [
  /whatsapp/i,
  /facebookexternalhit/i,
  /facebot/i,
  /twitterbot/i,
  /telegrambot/i,
  /slackbot/i,
  /discordbot/i,
  /linkedinbot/i,
  /pinterest(bot)?/i,
  /skypeuripreview/i,
  /embedly/i,
  /redditbot/i,
  /mastodon/i,
];

export const DEFAULT_FETCH_TIMEOUT_MS = 5000;
export const DEFAULT_MAX_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 5;

/**
 * Hanya bot pengambil preview yang dilayani HTML OG.
 *
 * Googlebot sengaja TIDAK termasuk: menyajikan konten berbeda untuk Googlebot
 * dan pengunjung biasa adalah cloaking, dan tidak ada gunanya di sini.
 */
export function isCrawler(userAgent) {
  if (typeof userAgent !== "string" || userAgent === "") return false;
  return CRAWLER_PATTERNS.some((pattern) => pattern.test(userAgent));
}

/**
 * Pastikan host menuju alamat publik. Mengembalikan URL yang sudah dinormalkan.
 * Melempar Error ber-kode `UNSAFE_URL` kalau ditolak.
 */
export async function assertPublicUrl(rawUrl, { lookup = dns.lookup } = {}) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw unsafe("URL tidak valid");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw unsafe("protokol harus http atau https");
  }

  if (url.username || url.password) {
    throw unsafe("URL tidak boleh berisi kredensial");
  }

  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (port !== 80 && port !== 443) {
    throw unsafe("port tidak diizinkan");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");

  // Host berupa IP literal: tidak perlu DNS.
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw unsafe("alamat privat tidak diizinkan");
    return url;
  }

  let records;
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw unsafe("host tidak bisa di-resolve");
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw unsafe("host tidak bisa di-resolve");
  }

  for (const record of records) {
    if (isPrivateAddress(record.address)) throw unsafe("alamat privat tidak diizinkan");
  }

  return url;
}

function unsafe(message) {
  return Object.assign(new Error(message), { code: "UNSAFE_URL" });
}

/**
 * Rentang alamat yang tidak boleh dijangkau server: loopback, jaringan privat,
 * link-local (termasuk metadata cloud 169.254.169.254), CGNAT, multicast.
 */
export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 192 && b === 0) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true; // multicast + reserved
    return false;
  }

  if (net.isIPv6(ip)) {
    const value = ip.toLowerCase();
    if (value === "::" || value === "::1") return true;
    if (value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb")) {
      return true; // fe80::/10
    }
    if (value.startsWith("fc") || value.startsWith("fd")) return true; // fc00::/7
    if (value.startsWith("ff")) return true; // multicast

    // IPv4-mapped (::ffff:127.0.0.1) — periksa alamat IPv4 di dalamnya.
    const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);

    return false;
  }

  // Bukan IP yang dikenali: anggap tidak aman.
  return true;
}

/**
 * Ambil HTML halaman tujuan lalu ekstrak metadata OG.
 *
 * Tidak pernah melempar error: kegagalan apa pun menghasilkan objek dengan
 * `ok: false`, karena preview yang jelek lebih baik daripada halaman error.
 */
export async function fetchOg(
  rawUrl,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES,
    lookup = dns.lookup,
  } = {},
) {
  const signal = AbortSignal.timeout(timeoutMs);
  let currentUrl = rawUrl;

  try {
    let response;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      // Validasi setiap hop: redirect bisa menunjuk ke alamat internal.
      await assertPublicUrl(currentUrl, { lookup });

      response = await fetchImpl(currentUrl, {
        redirect: "manual",
        signal,
        headers: {
          // UA ini paling sering di-whitelist situs yang memblokir bot lain.
          "user-agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
          accept: "text/html,application/xhtml+xml",
          "accept-language": "id,en;q=0.8",
        },
      });

      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        if (hop === MAX_REDIRECTS) {
          return { ok: false, reason: "TOO_MANY_REDIRECTS" };
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      break;
    }

    if (!response.ok) {
      return { ok: false, reason: `HTTP_${response.status}` };
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return { ok: false, reason: "NOT_HTML" };
    }

    const html = await readHead(response, maxBytes);
    const og = parseOg(html, response.url || currentUrl);
    if (!og.title && !og.image && !og.description) {
      return { ok: false, reason: "NO_OG" };
    }

    return { ok: true, og };
  } catch (err) {
    const reason = err?.code === "UNSAFE_URL" ? "UNSAFE_URL" : err?.name === "TimeoutError" ? "TIMEOUT" : "FETCH_FAILED";
    return { ok: false, reason };
  }
}

/**
 * Baca bagian awal body dan berhenti begitu `</head>` ditemukan.
 *
 * Metadata OG hampir selalu ada di <head>, sementara banyak halaman modern
 * berukuran ratusan kilobyte sampai megabyte. Membaca seluruh body hanya
 * membuang bandwidth dan waktu, jadi pembacaan dipotong di dua titik: akhir
 * <head>, atau batas `maxBytes`.
 */
async function readHead(response, maxBytes) {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let text = "";
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      total += value.byteLength;
      const appended = decoder.decode(value, { stream: true });
      text += appended;

      // Berhenti di akhir <head>: sisa dokumen tidak dibutuhkan. Yang diperiksa
      // hanya potongan terakhir (plus sedikit tumpang tindih) agar tidak
      // memindai ulang seluruh dokumen pada setiap chunk.
      const window = text.slice(Math.max(0, text.length - appended.length - 16));
      if (/<\/head\s*>/i.test(window)) break;
      if (total >= maxBytes) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  return text + decoder.decode();
}

/**
 * Ekstrak metadata dari HTML. Prioritas: OG → Twitter Card → tag HTML biasa.
 *
 * Sengaja regex, bukan parser DOM penuh: HTML yang diambil bisa rusak/terpotong,
 * dan kita hanya butuh beberapa tag di <head>.
 */
export function parseOg(html, pageUrl) {
  const head = sliceHead(html);
  const meta = collectMeta(head);

  const title =
    meta["og:title"] ?? meta["twitter:title"] ?? firstMatch(head, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description =
    meta["og:description"] ?? meta["twitter:description"] ?? meta["description"];

  const image = meta["og:image"] ?? meta["og:image:url"] ?? meta["og:image:secure_url"] ?? meta["twitter:image"];

  return {
    title: clean(title, 255),
    description: clean(description, 500),
    image: resolveUrl(image, pageUrl),
    siteName: clean(meta["og:site_name"], 100),
    imageWidth: toInt(meta["og:image:width"]),
    imageHeight: toInt(meta["og:image:height"]),
  };
}

/** Ambil <head> saja kalau ada; kalau tidak, seluruh dokumen (dipotong wajar). */
function sliceHead(html) {
  const match = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  return match ? match[1] : html.slice(0, 200_000);
}

function collectMeta(head) {
  const out = {};
  const metaTag = /<meta\b[^>]*>/gi;

  for (const tag of head.match(metaTag) ?? []) {
    const attrs = parseAttributes(tag);
    const key = (attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
    const content = attrs.content ?? attrs.value;
    if (!key || content === undefined) continue;
    // Tag pertama menang: banyak situs menaruh OG asli lebih dulu, lalu
    // duplikat dari plugin SEO yang isinya lebih buruk.
    if (out[key] === undefined) out[key] = content;
  }

  return out;
}

function parseAttributes(tag) {
  const attrs = {};
  const attrPattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

  let match;
  while ((match = attrPattern.exec(tag)) !== null) {
    attrs[match[1].toLowerCase()] = match[3] ?? match[4] ?? match[5] ?? "";
  }

  return attrs;
}

function firstMatch(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1] : undefined;
}

function toInt(value) {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Buang tag, rapikan spasi, decode entity, potong ke panjang kolom. */
function clean(value, max) {
  if (typeof value !== "string") return null;
  const text = decodeEntities(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  if (text === "") return null;
  return text.length > max ? text.slice(0, max) : text;
}

/** og:image boleh relatif; simpan sebagai URL absolut supaya bisa dipakai WhatsApp. */
function resolveUrl(value, base) {
  if (typeof value !== "string") return null;
  const trimmed = decodeEntities(value).trim();
  if (trimmed === "") return null;

  try {
    const url = new URL(trimmed, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
};

export function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? whole;
  });
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * HTML tipis untuk crawler. Pengunjung biasa tidak pernah melihat ini karena
 * mereka tetap mendapat 302; `<meta refresh>` hanya jaring pengaman kalau
 * ternyata ada manusia yang sampai ke sini.
 */
export function renderOgHtml({ link, og, canonicalUrl }) {
  const title = link.title || og?.title || link.targetUrl;
  const description = link.description || og?.description || null;
  const image = og?.image || null;

  const tags = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="robots" content="noindex, nofollow">`,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
  ];

  if (description) {
    tags.push(`<meta property="og:description" content="${escapeHtml(description)}">`);
    tags.push(`<meta name="description" content="${escapeHtml(description)}">`);
  }

  if (og?.siteName) {
    tags.push(`<meta property="og:site_name" content="${escapeHtml(og.siteName)}">`);
  }

  if (image) {
    tags.push(`<meta property="og:image" content="${escapeHtml(image)}">`);
    tags.push(`<meta property="og:image:alt" content="${escapeHtml(title)}">`);
    if (og.imageWidth && og.imageHeight) {
      tags.push(`<meta property="og:image:width" content="${og.imageWidth}">`);
      tags.push(`<meta property="og:image:height" content="${og.imageHeight}">`);
    }
    tags.push(`<meta name="twitter:card" content="summary_large_image">`);
    tags.push(`<meta name="twitter:image" content="${escapeHtml(image)}">`);
  } else {
    tags.push(`<meta name="twitter:card" content="summary">`);
  }

  tags.push(`<meta name="twitter:title" content="${escapeHtml(title)}">`);
  if (description) tags.push(`<meta name="twitter:description" content="${escapeHtml(description)}">`);

  // Jaring pengaman: kalau ada manusia yang membuka HTML ini, dia tetap
  // dibawa ke tujuan. Crawler mengabaikan meta refresh.
  const target = escapeHtml(link.targetUrl);
  tags.push(`<meta http-equiv="refresh" content="0;url=${target}">`);

  return `<!doctype html>
<html lang="id">
<head>
${tags.join("\n")}
</head>
<body>
<p>Mengalihkan ke <a href="${target}">${escapeHtml(link.targetUrl)}</a>…</p>
</body>
</html>`;
}

/** HTML minimal untuk slug nonaktif/kedaluwarsa yang dibuka crawler. */
export function renderUnavailableHtml(message) {
  return `<!doctype html>
<html lang="id">
<head><meta charset="utf-8"><meta name="robots" content="noindex"><title>${escapeHtml(message)}</title></head>
<body><p>${escapeHtml(message)}</p></body>
</html>`;
}
