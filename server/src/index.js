import "dotenv/config";
import { createApp } from "./app.js";
import { prisma } from "./lib/prisma.js";

// Catatan penting: LiteSpeed/Passenger memuat entry file dengan require(),
// dan require() tidak bisa memuat modul ESM yang punya top-level await
// (ERR_REQUIRE_ASYNC_MODULE). Karena itu seluruh inisialisasi async
// dijalankan di dalam fungsi, bukan di level modul.
const PORT = process.env.PORT || 3000;

/**
 * Menyambung ke database di latar belakang, dengan percobaan ulang.
 *
 * Sengaja tidak memblokir listen(): kalau database lambat atau sedang mati,
 * aplikasi tetap hidup sehingga penyebabnya terbaca dari log — bukan berakhir
 * sebagai 503 tanpa jejak.
 */
function connectDatabase(attempt = 1, maxAttempts = 5) {
  prisma
    .$connect()
    .then(() => console.log("[startup] Database terhubung"))
    .catch((err) => {
      console.error(
        `[startup] Gagal terhubung ke database (percobaan ${attempt}/${maxAttempts}): ${err.message}`,
      );
      if (attempt < maxAttempts) {
        setTimeout(() => connectDatabase(attempt + 1, maxAttempts), 2000);
      } else {
        console.error(
          "[startup] Menyerah menyambung database. Periksa DATABASE_URL dan akses jaringan ke host MySQL.",
        );
      }
    });
}

async function shutdown(server, signal) {
  console.log(`[shutdown] ${signal} diterima, mematikan server...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  // Jangan menggantung selamanya kalau ada koneksi yang tidak menutup.
  setTimeout(() => process.exit(1), 10_000).unref();
}

function main() {
  if (!process.env.DATABASE_URL) {
    console.error(
      "[startup] DATABASE_URL belum di-set. Isi Environment Variables di panel " +
        "hosting, atau letakkan .env di direktori kerja proses " +
        `(${process.cwd()}).`,
    );
    process.exit(1);
  }

  const app = createApp();

  const server = app.listen(PORT, () => {
    console.log(`[startup] Mendengarkan PORT=${PORT}`);
  });

  connectDatabase();

  process.on("SIGINT", () => shutdown(server, "SIGINT"));
  process.on("SIGTERM", () => shutdown(server, "SIGTERM"));
}

main();
