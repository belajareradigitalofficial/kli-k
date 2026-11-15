# kli-k.id — Frontend

Antarmuka pemendek tautan dengan gaya brutalisme. React 19 + Vite 8 + React Router 7 + Tailwind 4.

## Menjalankan

```sh
npm install
npm run dev      # http://localhost:5173
```

Backend harus jalan di `http://localhost:3000` (`cd ../server && npm run dev`).

## Struktur

```
src/
├── App.jsx                    # routing
├── main.jsx                   # entry + BrowserRouter
├── index.css                  # token Tailwind + kelas brutalisme
├── lib/api.js                 # klien fetch ke /api
├── context/
│   ├── auth.js                # AuthContext + useAuth
│   └── AuthContext.jsx        # AuthProvider
├── components/
│   ├── Layout.jsx             # header, footer, navigasi
│   ├── ProtectedRoute.jsx     # penjaga halaman dasbor
│   ├── LinkForm.jsx           # form buat tautan
│   ├── CopyButton.jsx         # tombol salin
│   └── Alert.jsx              # pesan error/sukses
└── pages/
    ├── LandingPage.jsx
    ├── LoginPage.jsx
    ├── RegisterPage.jsx
    ├── DashboardPage.jsx
    ├── LinkDetailPage.jsx
    └── NotFoundPage.jsx
```

## Halaman

| Path | Akses | Isi |
|---|---|---|
| `/` | publik | Landing page + penjelasan |
| `/login` | tamu | Form masuk |
| `/register` | tamu | Form daftar |
| `/dashboard` | login | Ringkasan, daftar tautan, pencarian, form buat |
| `/dashboard/links/:id` | login | Detail, edit (termasuk alias), statistik kunjungan |
| `*` | publik | Halaman 404 |

Pengguna yang sudah masuk dan membuka `/login` atau `/register` otomatis diarahkan ke dasbor.

## Desain

Brutalisme: border hitam tebal, sudut kotak, shadow keras tanpa blur, dan palet kontras tinggi.

| Token | Nilai | Fungsi |
|---|---|---|
| `--color-ink` | `#111111` | Teks, border, latar gelap |
| `--color-paper` | `#F5F2E8` | Latar halaman |
| `--color-acid` | `#FFE600` | Aksen utama |

Kelas komponen yang dipakai berulang: `.brut-box`, `.brut-box-sm`, `.brut-btn`, `.brut-input`, `.brut-label`, `.brut-badge`. Tombol "tertekan" saat hover dengan menggeser posisi dan mengecilkan shadow, bukan animasi dekoratif.

Semua ukuran memakai rem, dan tabel statistik berubah menjadi area scroll horizontal di layar sempit agar tidak memaksa halaman melebar.

## Komunikasi ke API

Frontend memanggil path relatif (`/api/...`) dengan `credentials: "include"` supaya cookie sesi ikut terkirim. Vite mem-proxy `/api` ke `http://localhost:3000` saat development, sehingga browser melihat semuanya sebagai same-origin dan tidak ada masalah CORS.

## Catatan

- Tautan pendek (`shortUrl`) mengarah ke backend (`http://localhost:3000/:slug`), bukan ke port Vite, karena redirect ditangani Express.
- Field **Custom URL** menampilkan preview alamat lengkap dan mengecek ketersediaan alias dengan debounce 400 ms sebelum form dikirim.
- Alias boleh diubah lewat halaman detail. Mengganti alias membuat alamat lama tidak lagi berfungsi, jadi alamat baru langsung ditampilkan setelah tersimpan.
- Tidak ada token atau kunci rahasia di sisi klien; autentikasi sepenuhnya lewat cookie `HttpOnly` yang tidak bisa dibaca JavaScript.

## Scripts

| Script | Fungsi |
|---|---|
| `npm run dev` | Dev server + HMR |
| `npm run build` | Build produksi ke `dist/` |
| `npm run preview` | Pratinjau hasil build |
| `npm run lint` | Lint dengan oxlint |
