import "dotenv/config";
import { createApp } from "./app.js";
import { prisma } from "./lib/prisma.js";

const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL belum di-set. Isi server/.env lalu jalankan ulang.");
  process.exit(1);
}

const app = createApp();

// Pastikan koneksi DB hidup sebelum menerima trafik, supaya error konfigurasi
// terlihat saat startup, bukan saat request pertama.
try {
  await prisma.$connect();
} catch (err) {
  console.error(`Gagal terhubung ke database: ${err.message}`);
  process.exit(1);
}

const server = app.listen(PORT, () => {
  console.log(`SERVER BERJALAN di http://localhost:${PORT}`);
});

async function shutdown(signal) {
  console.log(`\n${signal} diterima, mematikan server...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  // Jangan menggantung selamanya kalau ada koneksi yang tidak menutup.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
