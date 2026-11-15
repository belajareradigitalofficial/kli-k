# kli-k.id — Backend

REST API untuk aplikasi pemendek tautan. Express 5 + Prisma 6 + MySQL.

## Stack

| Bagian | Teknologi |
|---|---|
| Runtime | Node.js 20 |
| Framework | Express 5 |
| ORM | Prisma 6.19.3 |
| Database | MySQL |
| Autentikasi | Sesi database + cookie HttpOnly |
| Hash password | bcryptjs |
| Testing | `node:test` |

## Struktur

```
server/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── index.js                 # bootstrap, listen, graceful shutdown
│   ├── app.js                   # wiring middleware + route + frontend
│   ├── lib/
│   │   ├── prisma.js            # singleton PrismaClient
│   │   ├── errors.js            # AppError
│   │   ├── frontend.js          # penyaji client/dist + SPA fallback
│   │   ├── session.js           # token sesi + cookie
│   │   ├── password.js          # hash & verifikasi bcrypt
│   │   ├── rate-limit.js        # limiter yang bisa dimatikan saat tes
│   │   ├── slug.js              # generate + validasi slug
│   │   ├── url.js               # validasi targetUrl
│   │   └── validation.js        # validasi body & query
│   ├── middleware/
│   │   ├── auth.js              # loader sesi, requireAuth, cek Origin
│   │   └── error.js             # 404 + error handler
│   ├── services/
│   │   ├── auth.service.js
│   │   └── link.service.js
│   └── routes/
│       ├── auth.routes.js
│       ├── links.routes.js
│       └── redirect.routes.js
└── test/
```

## Deployment

Panduan lengkap deploy ke Hostinger ada di **[DEPLOY.md](../DEPLOY.md)** di root repo.

Ringkasnya, aplikasi ini berjalan sebagai **satu domain**: Express melayani API sekaligus hasil build frontend dari `client/dist`. Build dan start diatur oleh `package.json` di root:

```sh
npm run build     # install + prisma generate + vite build
npm start         # node src/index.js
npm run db:deploy # prisma migrate deploy (produksi)
```

## Setup

```sh
npm install
cp .env.example .env      # isi DATABASE_URL dan BASE_URL
npm run db:deploy         # terapkan migrasi
npm run dev               # http://localhost:3000
```

## Model Data

| Model | Keterangan |
|---|---|
| `User` | Akun: email unik, nama, hash password |
| `Session` | Sesi login. Yang disimpan hanya **hash SHA-256** dari token |
| `Link` | Tautan pendek, terhubung ke pemilik (`userId`) |
| `Visit` | Catatan kunjungan: IP, user-agent, referer |

`Link.userId` nullable hanya untuk kompatibilitas data lama. Semua link baru wajib punya pemilik.

## Endpoint

### Publik

| Method | Path | Keterangan |
|---|---|---|
| `POST` | `/api/auth/register` | Daftar akun (10/15 menit per IP) |
| `POST` | `/api/auth/login` | Masuk (10/15 menit per IP) |
| `POST` | `/api/auth/logout` | Keluar, sesi dihapus dari database |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/config` | Base URL untuk preview alamat pendek |
| `GET` | `/:slug` | Redirect `302` ke tujuan |

### Perlu login (cookie sesi)

| Method | Path | Keterangan |
|---|---|---|
| `GET` | `/api/auth/me` | Profil pengguna aktif |
| `GET` | `/api/links/summary` | Total tautan, aktif, total klik |
| `GET` | `/api/links/check-slug` | Cek ketersediaan alias (`?slug=…&excludeId=…`) |
| `POST` | `/api/links` | Buat tautan (50/jam) |
| `GET` | `/api/links` | List + paginasi + pencarian |
| `GET` | `/api/links/:id` | Detail |
| `GET` | `/api/links/:id/stats` | Statistik kunjungan |
| `PATCH` | `/api/links/:id` | Ubah tautan |
| `DELETE` | `/api/links/:id` | Hapus tautan |

Semua endpoint `/api/links` otomatis dibatasi ke tautan milik pengguna yang sedang masuk. Tautan milik orang lain dibalas `404`, bukan `403`, supaya keberadaannya tidak bocor.

## Contoh

```sh
# daftar
curl -c cookie.txt -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Budi","email":"budi@example.com","password":"rahasia123"}'

# buat tautan
curl -b cookie.txt -X POST http://localhost:3000/api/links \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:5173" \
  -d '{"targetUrl":"https://example.com/halaman-panjang","slug":"promo"}'

# redirect
curl -i http://localhost:3000/promo
```

## Keputusan Desain

**Wajib login untuk membuat tautan.** Tidak ada pembuatan tautan anonim, sehingga setiap tautan punya pemilik yang bisa mengelolanya.

**Sesi disimpan di database, token di-hash.** Cookie berisi token acak 32 byte. Database hanya menyimpan SHA-256-nya, jadi kebocoran isi database tidak langsung memberi akses ke sesi aktif. Logout benar-benar menghapus sesi.

**Cookie `HttpOnly` + `SameSite=Lax`.** Tidak bisa dibaca JavaScript, sehingga XSS tidak bisa mencuri sesi. `Secure` hanya aktif di production agar localhost http tetap berfungsi.

**Cek Origin untuk mutasi.** Cookie terkirim otomatis oleh browser, jadi tanpa pengecekan ini situs lain bisa memicu aksi atas nama pengguna (CSRF). Request tanpa header `Origin` (curl) tetap diizinkan.

**Redirect `302`, bukan `301`.** `301` di-cache permanen oleh browser, sehingga perubahan tujuan tidak akan terlihat oleh pengunjung lama.

**Pencatatan kunjungan tidak memblokir redirect.** Increment `clicks` dan baris `Visit` dijalankan dalam satu transaksi, tapi tidak di-`await` oleh handler redirect. Kalau DB lambat, pengunjung tetap sampai ke tujuan.

**`HEAD` tidak dihitung sebagai klik.** Mencegah pengecekan tautan otomatis menggelembungkan statistik.

**IP dimasking di statistik.** Hanya `192.168.x.x` atau dua grup pertama IPv6 yang ditampilkan, supaya data pribadi pengunjung tidak terekspos penuh di layar.

**Pesan login generik.** Email tidak terdaftar dan password salah sama-sama dibalas `401` dengan pesan identik, sehingga tidak bisa dipakai menebak akun mana yang ada.

**Target URL divalidasi ketat.** Hanya `http`/`https`, tanpa embedded credentials, maksimal 8192 karakter — mencegah `javascript:` menjadi vektor XSS.

**Alias custom bisa diubah.** Alias diatur saat membuat tautan dan masih bisa diganti lewat halaman detail. Kalau alias sudah dipakai tautan lain, perubahan ditolak dengan pesan "Alias sudah digunakan. Silakan pilih nama lain." Mengganti alias membuat alamat lama tidak lagi berfungsi.

**Slug dipaksa huruf kecil.** Collation MySQL default case-insensitive (`Abc` = `abc`), jadi normalisasi mencegah konflik membingungkan.

**`targetUrl` bertipe `TEXT`.** Default Prisma `String` di MySQL adalah `VARCHAR(191)`, yang akan memotong URL panjang diam-diam.

## Testing

```sh
npm test
```

53 tes mencakup validasi URL/slug/akun, hashing password, sesi, autentikasi, CSRF, kepemilikan tautan, alias custom (buat/ubah/cek ketersediaan), redirect, penyajian frontend, dan statistik — memakai Prisma palsu sehingga tidak butuh database.

## Scripts

| Script | Fungsi |
|---|---|
| `npm run dev` | Watch mode |
| `npm start` | Produksi |
| `npm test` | Jalankan tes |
| `npm run db:migrate` | Migrasi (development) |
| `npm run db:deploy` | Migrasi (produksi) |
| `npm run db:generate` | Regenerate Prisma Client |
| `npm run db:studio` | Buka Prisma Studio |
