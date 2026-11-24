# Deploy ke Hostinger (Managed Node.js + MySQL)

Panduan ini mengasumsikan **satu domain** melayani aplikasi, API, dan short link:

```
https://DOMAIN/                  → halaman depan
https://DOMAIN/login             → masuk
https://DOMAIN/dashboard         → dasbor
https://DOMAIN/api/...           → API
https://DOMAIN/<slug>            → redirect short link
```

Frontend dilayani Express dari hasil build `client/dist`, jadi tidak ada CORS dan cookie sesi bersifat same-origin.

---

## 1. Prasyarat

| Kebutuhan | Keterangan |
|---|---|
| Plan Hostinger | Web/Cloud hosting yang mendukung **Node.js** |
| Node.js | Minimal **20.19** (Vite 8 dan Prisma 6 mensyaratkannya) |
| Database | MySQL dari hPanel |
| Domain | Diarahkan ke hosting ini, SSL aktif (HTTPS) |

Cek versi Node yang tersedia di hPanel. Kalau hanya tersedia Node 18, aplikasi ini **tidak akan jalan** — Vite 8 butuh ≥ 20.19.

---

## 2. Siapkan database

Di hPanel → **Databases → MySQL Databases**:

1. Buat database, misal `u123456_klik`.
2. Buat user database dengan password kuat.
3. Beri user itu **ALL PRIVILEGES** pada database tersebut.
4. Catat empat nilai ini:

```
Host     : (dari hPanel, sering berupa nama host, bukan selalu "localhost")
Port     : 3306
Database : u123456_klik
User     : u123456_klikuser
Password : (password yang kamu buat)
```

> **Penting:** jangan menganggap host-nya `localhost`. Di sebagian plan Hostinger,
> MySQL berada di host terpisah. Pakai nilai persis dari hPanel.

---

## 3. Hubungkan repository

Di hPanel → **Website → Manage → Node.js**:

| Pengaturan | Nilai |
|---|---|
| Repository | `https://github.com/belajareradigitalofficial/kli-k` |
| Branch | `main` |
| Root directory | `/` (root repo — ada `package.json` di sana) |
| Node version | 20.19 atau lebih baru |

Nama field bisa sedikit berbeda tergantung panel. Yang penting: **root directory harus di root repo**, karena `package.json` di root yang mengatur build & start.

---

## 4. Perintah build & start

Repo ini sudah menyiapkan semuanya lewat `package.json` di root:

**Build command**

```
npm run build
```

Perintah ini menjalankan:
1. `npm ci --include=dev` di `server/` dan `client/` (dev dependency dibutuhkan untuk Prisma CLI dan Vite)
2. `prisma generate`
3. `vite build` → menghasilkan `client/dist`

**Start command**

```
npm start
```

Menjalankan `node src/index.js` di direktori `server`.

**Port:** ikuti variabel `PORT` yang disediakan Hostinger. Aplikasi sudah membaca `process.env.PORT`. Jangan hardcode `3000`.

---

## 5. Environment variables

Isi di hPanel → **Environment Variables** (jangan mengandalkan file `.env`, yang tidak ikut ter-commit):

```env
NODE_ENV=production
BASE_URL=https://DOMAIN
CORS_ORIGIN=https://DOMAIN
DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DATABASE
SESSION_TTL_DAYS=7
TRUST_PROXY=1
```

Penjelasan tiap variabel:

| Variabel | Wajib | Fungsi |
|---|---|---|
| `NODE_ENV` | ✅ | `production` mengaktifkan cookie `Secure`, mematikan morgan, dan menyembunyikan detail error |
| `BASE_URL` | ✅ | Membentuk `shortUrl`. **Harus** `https://DOMAIN`, bukan localhost |
| `CORS_ORIGIN` | ✅ | Origin yang diizinkan untuk request bermutasi (cek CSRF). Isi `https://DOMAIN` |
| `DATABASE_URL` | ✅ | Koneksi MySQL |
| `SESSION_TTL_DAYS` | — | Masa berlaku login, default 7 hari |
| `TRUST_PROXY` | — | Lihat bagian di bawah. **Wajib diisi `1` di Hostinger** |
| `OG_FETCH_TIMEOUT_MS` | — | Batas waktu mengambil preview OG dari situs tujuan, default `5000` |
| `OG_CACHE_TTL_HOURS` | — | Umur cache preview OG, default `168` (7 hari) |

### `TRUST_PROXY` — wajib diisi di Hostinger

Hostinger menaruh aplikasi di belakang CDN + reverse proxy LiteSpeed, dan selalu mengirim header `X-Forwarded-For`. Tanpa `TRUST_PROXY`:

- `req.ip` berisi IP proxy, sehingga **semua pengunjung terlihat dari satu IP** → rate limit 120/menit dibagi seluruh pengunjung situs, dan statistik kunjungan tidak berguna.
- `express-rate-limit` mencetak `ValidationError: The 'X-Forwarded-For' header is set but the Express 'trust proxy' setting is false` di log pada setiap request.
- Kalau limiter sampai menolak, crawler WhatsApp yang mengambil preview bisa menerima `429` — preview gagal muncul.

**Set `TRUST_PROXY=1`.** Itu artinya "percaya satu lapis proxy di depan" (CDN Hostinger), sehingga Express membaca IP asli dari header. Kalau ternyata IP di tabel `Visit` masih IP proxy, naikkan jadi `TRUST_PROXY=2`.

Dengan `TRUST_PROXY` yang salah (mis. `true` tanpa batas):

- Klien bisa memalsukan header `X-Forwarded-For` dan **melewati rate limit**.

Verifikasi setelah deploy:

```sh
# request dari IP berbeda harus menghasilkan baris Visit dengan IP berbeda
cd server && npm run db:studio
```

atau bandingkan IP di tabel `Visit` dengan IP publikmu.

### Karakter khusus di `DATABASE_URL`

Kalau password mengandung `@ : / ? # % &`, harus di-URL-encode:

| Karakter | Encode |
|---|---|
| `@` | `%40` |
| `:` | `%3A` |
| `/` | `%2F` |
| `?` | `%3F` |
| `#` | `%23` |
| `%` | `%25` |
| `&` | `%26` |

Contoh password `P@ss:w0rd` → `P%40ss%3Aw0rd`.

Alternatif: pakai password alfanumerik saja agar tidak perlu encoding.

### `.env` dibuat otomatis saat build

Beberapa plan Hostinger hanya menyuntikkan environment variable pada tahap **build**, bukan saat aplikasi dijalankan. Gejalanya: build sukses, tapi aplikasi langsung mati dengan `DATABASE_URL belum di-set`.

Karena itu langkah terakhir `npm run build` menjalankan `scripts/write-env.mjs`, yang menyalin variabel dari panel ke `.env` di root repo. File itu menjadi direktori kerja proses di produksi, jadi `dotenv` bisa membacanya.

Yang perlu diketahui:

- `PORT` **tidak** disalin. Passenger memberi `PORT` sendiri (bisa berupa path unix socket); nilai dari panel akan merusaknya.
- Kalau variabel tidak terlihat saat build, skrip hanya memberi peringatan dan tidak membuat file — build tetap sukses.
- Nilai yang sudah ada di environment runtime tetap menang, karena `dotenv` tidak menimpa variabel yang sudah ter-set.
- File dibuat dengan permission `600` dan tidak pernah masuk git (`.gitignore`).

---

## 6. Jalankan migrasi database

Setelah aplikasi pertama kali ter-deploy, tabel belum ada. Jalankan lewat SSH/terminal hPanel:

```sh
cd ~/domains/DOMAIN/public_html   # sesuaikan dengan path aplikasi di hPanel
npm run db:deploy
```

Perintah itu menjalankan `prisma migrate deploy` — **bukan** `migrate dev`. Perbedaannya penting:

| Perintah | Untuk | Aman di produksi? |
|---|---|---|
| `prisma migrate deploy` | Menerapkan migrasi yang sudah ada | ✅ ya |
| `prisma migrate dev` | Membuat migrasi baru, bisa reset DB | ❌ **jangan** |

Verifikasi tabel sudah ada:

```sh
cd server && npx prisma db execute --stdin <<< "SHOW TABLES;"
```

Atau buka **Prisma Studio** (butuh tunnel SSH):

```sh
cd server && npm run db:studio
```

---

## 7. Checklist verifikasi

Setelah deploy, uji berurutan:

```sh
# 1. API hidup
curl -i https://DOMAIN/api/health
# harapan: 200 {"status":"ok"}

# 2. Konfigurasi benar
curl -s https://DOMAIN/api/config
# harapan: {"baseUrl":"https://DOMAIN"}  ← bukan localhost

# 3. Halaman aplikasi
curl -s -o /dev/null -w "%{http_code}\n" https://DOMAIN/login
# harapan: 200

# 4. Slug tidak dikenal
curl -s -o /dev/null -w "%{http_code}\n" https://DOMAIN/slug-ngawur
# harapan: 404 (bukan 200)

# 5. Preview OG untuk crawler media sosial (pakai slug yang benar-benar ada)
curl -s -A "WhatsApp/2.23.20.0 A" https://DOMAIN/SLUG | grep -E "og:(title|image)"
# harapan: 200 + tag og:title/og:image milik situs tujuan
# og:image harus menunjuk ke https://DOMAIN/og-image/SLUG

# 6. Proxy gambar OG
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://DOMAIN/og-image/SLUG
# harapan: 200 image/jpeg (atau 302 ke gambar asli kalau gagal mengambil)
```

Lalu di browser:

1. Daftar akun baru.
2. **Refresh halaman** — kalau langsung terlempar ke login, cookie bermasalah (biasanya `NODE_ENV` belum `production` atau SSL belum aktif).
3. Buat tautan, salin, buka di tab lain → harus redirect.
4. Cek statistik bertambah.
5. Logout, pastikan tidak bisa akses `/dashboard`.

### Preview link di WhatsApp / Telegram

Saat short link dibagikan, crawler WhatsApp meminta `https://DOMAIN/SLUG`. Server
mendeteksi bot tersebut lalu **mengambil halaman tujuan** dan menyajikan HTML
tipis berisi `og:title`, `og:description`, dan `og:image` milik situs tujuan.
Pengunjung biasa tidak terpengaruh: mereka tetap mendapat `302` langsung ke
tujuan, dan HTML preview tidak pernah terlihat.

Yang perlu diketahui:

1. **Hosting harus bisa melakukan outbound HTTPS.** Kalau diblokir, preview jatuh
   ke perilaku lama (crawler mengambil sendiri dari situs tujuan).
2. **Hasil disimpan 7 hari** di kolom `og*` tabel `Link` (atur lewat
   `OG_CACHE_TTL_HOURS`). Kegagalan disimpan 1 jam supaya situs yang mati tidak
   dihantam terus.
3. **Ganti `targetUrl` otomatis mengosongkan cache.** Ganti judul/deskripsi tidak.
4. **`BASE_URL` wajib benar**, karena dipakai sebagai `og:url`.
5. **Judul/deskripsi manual di form menang** atas hasil scrape — pakai itu kalau
   ingin teks preview berbeda dari halaman tujuan.
6. Gambar mengikuti situs tujuan; kalau tujuan tidak punya `og:image`, preview
   tampil tanpa gambar (tidak ada gambar pengganti).
7. **Gambar disajikan lewat `https://DOMAIN/og-image/SLUG`.** Server mengambil
   gambar asli sekali, menyimpannya di memori (1 jam), lalu meneruskannya.
   Tujuannya agar crawler WhatsApp hanya perlu menjangkau `DOMAIN`; sebagian
   situs memblokir alamat IP crawler Meta sehingga gambar tidak pernah sampai.
   Kalau pengambilan gagal, endpoint membalas `302` ke URL gambar asli sebagai
   jalan mundur.
7. WhatsApp meng-cache preview per URL. Untuk memaksa refresh, pakai slug baru
   atau tambahkan `?v=2` saat membagikan.
8. Crawler **tidak** dihitung sebagai klik.
9. **HTML preview tidak boleh di-cache CDN.** Response-nya memakai
   `Cache-Control: private, no-store` + `Vary: User-Agent`, karena URL yang sama
   menghasilkan HTML untuk crawler dan `302` untuk pengunjung. Kalau CDN
   menyimpan versi crawler, pengunjung biasa akan melihat halaman
   "Mengalihkan ke …" alih-alih langsung dialihkan.
10. **Crawler dibebaskan dari rate limit.** WhatsApp menyimpan hasil fetch yang
    gagal, jadi satu balasan `429` membuat gambar link tersebut tidak muncul
    lagi meski kuota sudah pulih. Setiap permintaan ke slug yang ada dicatat
    sebagai `[slug] /<slug> ua="<user-agent>" crawler=<true|false>` — berguna
    untuk memastikan apakah WhatsApp benar-benar menghubungi server dan UA apa
    yang dipakainya.
11. **Konfigurasi dicetak saat startup.** Baris
    `[config] trust proxy=1 | NODE_ENV=production BASE_URL=set ...` adalah bukti
    positif bahwa environment variable terbaca. Hanya status `set`/`-` yang
    dicetak, tidak pernah nilainya. Di produksi request pengunjung biasa tidak
    dicatat, jadi log yang diam bukan berarti ada yang rusak.

---

## 8. Masalah yang sering muncul

| Gejala | Penyebab | Solusi |
|---|---|---|
| Blank page saat buka `/login` | `client/dist` tidak ada | Cek build command berjalan; pastikan `client/dist/index.html` ada |
| Halaman tampil tapi API 404 | Root directory salah | Pastikan root = root repo |
| Login berhasil tapi langsung logout saat refresh | Cookie `Secure` di HTTP, atau `NODE_ENV` bukan production | Aktifkan SSL, set `NODE_ENV=production` |
| `Can't reach database server` | `DATABASE_URL` salah host/port | Ambil ulang dari hPanel, cek encoding password |
| `P1000 Authentication failed` | User/password DB salah, atau privilege kurang | Beri ALL PRIVILEGES pada database |
| Semua orang kena rate limit | `TRUST_PROXY` belum di-set | Lihat bagian `TRUST_PROXY` |
| `prisma: command not found` | Build memakai `--omit=dev` | Pastikan `npm ci --include=dev` (sudah diatur di root `package.json`) |
| `Vite requires Node 20.19+` | Versi Node di panel terlalu lama | Ganti versi Node di hPanel |
| Short link berbentuk `http://localhost:3000/abc` | `BASE_URL` belum diubah | Set `BASE_URL=https://DOMAIN`, restart |
| `503` + `ERR_REQUIRE_ASYNC_MODULE` di log | Passenger memuat entry file dengan `require()`; ada top-level `await` di graf ESM | Pindahkan inisialisasi async ke dalam fungsi (sudah dilakukan di `src/index.js`) |
| `503` + `DATABASE_URL belum di-set` | Environment variable tidak sampai ke proses | Isi Environment Variables di panel, atau taruh `.env` di direktori kerja proses |
| `ERR_TOO_MANY_REDIRECTS` | Aturan `www`/HTTPS ganda | Pilih satu bentuk kanonik domain, hapus aturan redirect yang bertentangan |
| Preview WhatsApp kosong, padahal link jalan | Server tidak bisa menjangkau situs tujuan (outbound diblokir), situs memblokir bot, atau tidak punya `og:image` | Cek `curl -A "WhatsApp/..." https://DOMAIN/SLUG`; lihat log `[og] gagal mengambil OG ...`; pastikan hosting mengizinkan outbound HTTPS |
| Preview tetap kosong walau `curl` menunjukkan `og:image` | Crawler tidak pernah sampai ke server (WhatsApp memakai cache preview lama), atau crawler memakai UA yang belum dikenali | Lihat log: baris `[slug] /SLUG ua="..." crawler=true` harus muncul saat link dibagikan. Kalau `crawler=false` → tambahkan UA itu ke `CRAWLER_PATTERNS` di `lib/og.js`. Kalau tidak ada baris sama sekali → cache WhatsApp, pakai slug baru. Pastikan juga `TRUST_PROXY=1` |
| `503` padahal build sukses | Proses Node mati saat start | Jalankan `node server/src/index.js` manual; baca `stderr.log` di folder aplikasi |

### Karakteristik hosting LiteSpeed/Passenger

Beberapa hal di atas hanya berlaku untuk Hostinger (LiteSpeed Passenger), bukan VPS dengan PM2:

- **Entry file dimuat dengan `require()`**, bukan `import()`. Karena itu `server/src/index.js` tidak boleh punya top-level `await`. Tes `test/startup.test.js` menjaga aturan ini.
- **`PORT` bisa berupa path unix socket**, bukan angka. Jangan menulis `app.listen(PORT, "0.0.0.0")` — argumen kedua akan dibaca sebagai *backlog*, bukan host.
- **Log runtime ada di folder aplikasi**, bukan di panel: `stderr.log` dan `console.log` (ditulis LiteSpeed). Lokasi aplikasi: `~/domains/DOMAIN/hbuilds/current/nodejs/`.
- **`current` adalah symlink ke folder versi** yang dibuat ulang setiap deploy. Jangan menaruh file konfigurasi manual di dalamnya.

---

## 9. Update aplikasi

Setelah `git push` ke `main`, deploy ulang dari hPanel. Karena migrasi dijalankan terpisah, urutannya:

```sh
# 1. build ulang (biasanya otomatis oleh panel)
npm run build

# 2. terapkan migrasi baru kalau ada
npm run db:deploy

# 3. restart aplikasi dari hPanel
```

Selalu jalankan `db:deploy` **sebelum** restart kalau ada perubahan schema.

---

## 10. Yang tidak boleh dilakukan

- **Jangan** commit `server/.env` — sudah masuk `.gitignore`, tapi jangan dipaksa dengan `git add -f`.
- **Jangan** menjalankan `prisma migrate reset` di produksi — itu menghapus semua data.
- **Jangan** set `CORS_ORIGIN=*` selama `credentials: true` — browser akan menolak, dan login tidak akan berfungsi.
- **Jangan** biarkan `NODE_ENV=development` di produksi — cookie tidak akan `Secure` dan stack trace bisa bocor ke pengguna.