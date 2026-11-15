import bcrypt from "bcryptjs";

const ROUNDS = 12;
// bcrypt hanya memakai 72 byte pertama; batasi supaya tidak ada karakter
// yang diam-diam diabaikan pada password sangat panjang.
const MAX_PASSWORD_BYTES = 72;

export async function hashPassword(password) {
  const truncated = truncateToBytes(password, MAX_PASSWORD_BYTES);
  return bcrypt.hash(truncated, ROUNDS);
}

export async function verifyPassword(password, hash) {
  const truncated = truncateToBytes(password, MAX_PASSWORD_BYTES);
  return bcrypt.compare(truncated, hash);
}

function truncateToBytes(value, maxBytes) {
  const buffer = Buffer.from(value, "utf8");
  if (buffer.length <= maxBytes) return value;
  return buffer.subarray(0, maxBytes).toString("utf8");
}
