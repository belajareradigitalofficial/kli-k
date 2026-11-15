/**
 * Hilangkan protokol http:// atau https:// di depan URL.
 *
 * Dipakai untuk tombol salin: menempel "localhost:3000/abc" atau
 * "kli-k.id/promo" ke address bar tetap berfungsi karena browser
 * menambahkan protokolnya sendiri.
 *
 * Hanya menghapus di awal string (jangkar ^). URL yang tidak punya
 * protokol — misalnya saat BASE_URL kosong sehingga shortUrl = "/abc" —
 * dibiarkan apa adanya.
 */
export function stripProtocol(url) {
  return String(url ?? "").replace(/^https?:\/\//i, "");
}
