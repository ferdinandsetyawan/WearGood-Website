# WearGoods — Platform Digital Wardrobe & Rekomendasi Outfit Berbasis Computer Vision & AI

Implementasi **Versi 1.1 (Revisi MVP)** berdasarkan dokumen [SRS WearGoods — Spesifikasi Kebutuhan Perangkat Lunak.pdf](file:///c:/Users/Ferdinand/Downloads/Tugas%20Kuliah/WearGood-Website/SRS%20WearGoods%20—%20Spesifikasi%20Kebutuhan%20Perangkat%20Lunak.pdf) dan seluruh referensi antarmuka pada folder [UIUX/](file:///c:/Users/Ferdinand/Downloads/Tugas%20Kuliah/WearGood-Website/UIUX).

---

## 1. Cara Menjalankan Aplikasi

```bash
# Menjalankan server aplikasi (Frontend + REST API /api/v1)
npm start

# Menjalankan seluruh 31 Test Case SRS (TC-01 s.d. TC-31)
npm test
```

Buka di browser: **`http://localhost:3000`**

- **Akun Demo (Otomatis Masuk / Pre-seeded sesuai UIUX):**
  - **Email:** `nadia.putri@email.com`
  - **Kata Sandi:** `Password123`
  - **Halaman Masuk / Registrasi:** Klik tombol **Keluar** di sidebar kiri bawah atau buka `http://localhost:3000/#masuk`.

---

## 2. Struktur Proyek

- [package.json](file:///c:/Users/Ferdinand/Downloads/Tugas%20Kuliah/WearGood-Website/package.json) — Konfigurasi script `npm start` dan `npm test`.
- [database/schema.sql](file:///c:/Users/Ferdinand/Downloads/Tugas%20Kuliah/WearGood-Website/database/schema.sql) — Skema DDL PostgreSQL 15+ sesuai Bagian 6 SRS (`users`, `user_tokens`, `wardrobe_items`, `occasions`, `styles`, `outfits`, `outfit_items`, `mockup_requests`, `ai_usage`).
- [src/db.js](file:///c:/Users/Ferdinand/Downloads/Tugas%20Kuliah/WearGood-Website/src/db.js) — Inisialisasi database SQLite lokal (`database/weargoods.sqlite`), fungsi hashing (`scrypt`), daftar warna baku, dan seeding data awal **Nadia Putri**.
- [src/server.js](file:///c:/Users/Ferdinand/Downloads/Tugas%20Kuliah/WearGood-Website/src/server.js) — Backend REST API (`/api/v1/*`), validasi magic-byte file gambar, penghapusan metadata EXIF/GPS, signed URL (`<= 15 menit`), rate limiting/cooldown login, kuota harian AI (`00:00 WIB`), dan pipeline AI.
- [public/index.html](file:///c:/Users/Ferdinand/Downloads/Tugas%20Kuliah/WearGood-Website/public/index.html) — Antarmuka responsif (`Masuk`, `Registrasi`, `Profil Gaya`, `Beranda`, `Cari Outfit / Rekomendasi`, `Detail Outfit & Kustomisasi`, `Lemari Saya`, `Tambah Pakaian Batch`, `Koleksi Tersimpan`, `Preferensi Gaya & Akun`).
- [public/styles.css](file:///c:/Users/Ferdinand/Downloads/Tugas%20Kuliah/WearGood-Website/public/styles.css) — Sistem desain editorial `laras.` (Desktop, Tablet, Mobile 360px+).
- [public/app.js](file:///c:/Users/Ferdinand/Downloads/Tugas%20Kuliah/WearGood-Website/public/app.js) — Logika SPA frontend, kompresi gambar sisi klien, antrean batch (maks. 10 foto, 3 paralel), kustomisasi outfit (`lock`, `replace_manual`, `suggest_alternative`, `reprompt`), dan `Need New Item?`.
- [tests/run-tests.js](file:///c:/Users/Ferdinand/Downloads/Tugas%20Kuliah/WearGood-Website/tests/run-tests.js) — Pengujian otomatis seluruh 31 Test Case (`TC-01` s.d. `TC-31`).
