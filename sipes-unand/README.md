# SIPES UNAND

## Menjalankan aplikasi lokal

1. Pastikan Node.js sudah terpasang.
2. Pasang dependensi jika ini pertama kali dijalankan:

   ```powershell
   npm --prefix frontend install
   npm --prefix backend install
   ```
3. Jika `backend\.env` belum ada, salin konfigurasi lokal:

   ```powershell
   Copy-Item .env.example backend\.env
   ```
4. Inisialisasi database, akun demo, data gedung, dan armada dari folder proyek:

   ```powershell
   npm run setup:db
   ```

   Database baru berisi akun dan data referensi gedung/armada. Laporan, penugasan, serta riwayat tetap kosong sampai Anda menjalankan simulasi. Seed dilewati jika basis data sudah memiliki pengguna, sehingga data yang sudah ada tidak dihapus.
5. Jalankan frontend dan backend bersama-sama:

   ```powershell
   npm run dev
   ```
6. Buka `http://localhost:5173`. API tersedia di `http://localhost:5000/api/health`.
7. Hentikan kedua layanan dengan `Ctrl+C`.

Untuk menjalankan frontend atau backend secara terpisah gunakan `npm run dev:frontend` atau `npm run dev:backend`.

## Akun demo lokal

| Peran | Username | Password |
| --- | --- | --- |
| Admin | `admin` | `admin123` |
| Petugas gedung | `petugas` | `petugas123` |
| Sopir bentor | `driver` | `driver123` |

## Alur operasional

- **Petugas gedung:** masuk, buat laporan untuk gedung, isi kondisi/jumlah kantong, dan ambil foto bukti langsung dengan kamera.
- **Admin:** pantau laporan dan peta, pilih laporan tertunda, lalu tugaskan ke sopir dan armada yang tersedia; verifikasi bukti pembuangan. Admin tidak membuat laporan sampah.
- **Sopir bentor:** lihat tugas yang diberikan, mulai perjalanan, ambil foto bukti pembuangan akhir langsung dengan kamera, dan kirim koordinat GPS.

Izinkan akses kamera dan lokasi pada peramban saat diminta. Kamera tersedia melalui `localhost` atau HTTPS. Foto JPG dibatasi 8 MB dan disimpan di folder `uploads`. Peta memakai tile OpenStreetMap dan membutuhkan koneksi internet; koordinat gedung bersumber dari basis data SIPES.

## Teknologi

- React, TypeScript, Vite, Leaflet / OpenStreetMap
- Express, Prisma, SQLite, JWT
