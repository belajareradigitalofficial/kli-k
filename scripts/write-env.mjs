/**
 * Menulis .env untuk runtime dari environment variable saat build.
 *
 * Beberapa hosting (Hostinger/LiteSpeed) menyuntikkan variabel environment
 * hanya pada tahap build, lalu menjalankan aplikasi tanpa variabel tersebut.
 * Akibatnya dotenv tidak menemukan apa pun dan aplikasi berhenti dengan
 * "DATABASE_URL belum di-set".
 *
 * Skrip ini menyalin variabel yang tersedia saat build ke .env di root repo,
 * yang menjadi direktori kerja proses di produksi. Aman diulang: nilai yang
 * sudah ada di process.env saat runtime tetap menang, karena dotenv tidak
 * menimpa variabel yang sudah ter-set.
 *
 * PORT sengaja TIDAK disalin: Passenger memberi PORT sendiri (bisa berupa
 * path unix socket), dan nilai dari panel akan merusaknya.
 */
import fs from "node:fs";
import path from "node:path";

const ALLOWED = [
  "NODE_ENV",
  "BASE_URL",
  "CORS_ORIGIN",
  "DATABASE_URL",
  "SESSION_TTL_DAYS",
  "TRUST_PROXY",
  "RATE_LIMIT_DISABLED",
];

const target = path.resolve(import.meta.dirname, "../.env");

const lines = [];
for (const key of ALLOWED) {
  const value = process.env[key];
  if (value === undefined || value === "") continue;
  if (/[\r\n]/.test(value)) {
    console.warn(`[env] ${key} mengandung baris baru, dilewati`);
    continue;
  }
  // Tanpa kutip: dotenv membaca sampai akhir baris. Nilai di panel tidak
  // boleh mengandung spasi di awal/akhir.
  lines.push(`${key}=${value}`);
}

if (lines.length === 0) {
  console.warn(
    "[env] Tidak ada variabel environment yang terlihat saat build. " +
      "Lewati pembuatan .env — pastikan variabel diisi di panel hosting.",
  );
  process.exit(0);
}

fs.writeFileSync(target, lines.join("\n") + "\n", { mode: 0o600 });
console.log(`[env] .env dibuat di ${target} (${lines.length} variabel)`);

if (!process.env.DATABASE_URL) {
  console.warn(
    "[env] PERINGATAN: DATABASE_URL tidak ada saat build. " +
      "Aplikasi akan berhenti saat start sampai variabel itu diisi di panel.",
  );
}
