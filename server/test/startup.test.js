import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(import.meta.dirname, "../src");

function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walk(path.join(dir, entry.name))
        : entry.name.endsWith(".js")
          ? [path.join(dir, entry.name)]
          : [],
    );
}

/**
 * LiteSpeed/Passenger memuat entry file dengan require(). require() bisa
 * memuat ESM di Node 22, TAPI gagal total kalau graf modulnya punya
 * top-level await:
 *
 *   Error [ERR_REQUIRE_ASYNC_MODULE]: require() cannot be used on an ESM
 *   graph with top-level await.
 *
 * Di produksi kegagalannya muncul sebagai 503 tanpa penjelasan, jadi kita
 * jaga di sini. Semua inisialisasi async harus berada di dalam fungsi.
 */
test("tidak ada top-level await di src (kompatibel dengan require() LiteSpeed)", () => {
  const offenders = [];

  for (const file of walk(SRC)) {
    const lines = fs.readFileSync(file, "utf8").split("\n");

    lines.forEach((line, index) => {
      // Baris top-level selalu mulai di kolom 0 pada gaya penulisan proyek ini.
      // await di dalam fungsi/objek pasti menjorok ke dalam.
      if (!/^\S/.test(line)) return;
      if (!/\bawait\b/.test(line)) return;

      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;

      offenders.push(`${path.relative(SRC, file)}:${index + 1}  ${trimmed}`);
    });
  }

  assert.deepEqual(
    offenders,
    [],
    `Top-level await ditemukan. Pindahkan ke dalam fungsi:\n${offenders.join("\n")}`,
  );
});

/**
 * PORT dari Passenger bisa berupa path unix socket, bukan angka. Signature
 * listen(path, backlog, callback) membuat argumen kedua "0.0.0.0" dibaca
 * sebagai backlog — bukan host — sehingga aplikasi gagal start.
 */
test("listen() tidak memaksa host eksplisit", () => {
  const source = fs.readFileSync(path.join(SRC, "index.js"), "utf8");

  assert.doesNotMatch(
    source,
    /listen\(\s*[^,)]+,\s*["'`](0\.0\.0\.0|localhost|127\.0\.0\.1)["'`]/,
    "Jangan hardcode host di listen(); PORT dari Passenger bisa berupa socket path.",
  );
});
