import crypto from "node:crypto";

export const SESSION_COOKIE = "klik_session";

const DEFAULT_TTL_DAYS = 7;

export function sessionTtlMs() {
  const days = Number(process.env.SESSION_TTL_DAYS);
  const safeDays = Number.isFinite(days) && days > 0 ? days : DEFAULT_TTL_DAYS;
  return safeDays * 24 * 60 * 60 * 1000;
}

/** Token sesi mentah: 32 byte acak, base64url (aman untuk cookie). */
export function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

/** Yang disimpan di database hanya hash-nya. */
export function hashSessionToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function parseCookies(header) {
  const out = {};
  if (typeof header !== "string" || header === "") return out;

  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }

  return out;
}

export function readSessionToken(req) {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE] ?? null;
}

export function setSessionCookie(res, token, expiresAt) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
  ];

  // Secure hanya di production: di localhost http, cookie Secure tidak akan
  // pernah dikirim browser dan login seolah-olah gagal.
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  res.append("Set-Cookie", parts.join("; "));
}

export function clearSessionCookie(res) {
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];

  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  res.append("Set-Cookie", parts.join("; "));
}
