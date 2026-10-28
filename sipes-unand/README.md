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

   Database baru berisi akun dan data referensi gedung/armada. Seed dilewati jika basis data sudah memiliki pengguna, sehingga data yang sudah ada tidak dihapus.
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

- **Petugas gedung:** buat laporan dengan gedung, jumlah kantong, kondisi, dan catatan. Foto laporan opsional; laporan baru masuk status **Menunggu Akumulasi**.
- **Akumulasi otomatis:** laporan FIFO digabungkan hingga mencapai 80% kapasitas bentor yang tersedia, tanpa melebihi kapasitas. Sistem memilih urutan titik jemput terdekat dan membuat satu penugasan untuk beberapa gedung.
- **Sopir bentor:** ambil satu penugasan yang tersedia, jalankan perjalanan, konfirmasi jumlah aktual dan foto di setiap gedung, lalu menuju PPST UNAND untuk mengirim bukti pembuangan.
- **Admin:** pantau laporan, armada, rute, posisi GPS sopir, bukti pengambilan, dan bukti pembuangan; admin memverifikasi pembuangan dan tidak membuat penugasan manual.

Izinkan akses kamera dan lokasi pada peramban saat diminta. Kamera tersedia melalui `localhost` atau HTTPS. Foto dibatasi 8 MB dan disimpan di folder `uploads`. Peta satelit memakai Esri World Imagery, peta jalan memakai OpenStreetMap, dan rute jalan memakai layanan OSRM; semuanya membutuhkan koneksi internet. Gunakan pemilih layer di pojok kanan atas peta untuk beralih antara tampilan satelit dan peta jalan.

Pilihan gedung dan titik peta diambil dari tabel gedung. Database lokal saat ini berisi enam titik seed; masukkan nama dan koordinat resmi Gedung Perkuliahan A–J sebelum operasional agar laporan dan rute memakai lokasi yang benar.

Sebelum sopir dapat menyelesaikan perjalanan, isi koordinat PPST UNAND yang benar pada `backend\.env`:

```dotenv
AUTO_ASSIGNMENT_LOAD_PERCENT=80
OFFICIAL_DISPOSAL_NAME="PPST UNAND"
OFFICIAL_DISPOSAL_LATITUDE=-0.915703
OFFICIAL_DISPOSAL_LONGITUDE=100.463788
OFFICIAL_DISPOSAL_RADIUS_METERS=100
```

Gedung A–J dan PPST UNAND menggunakan koordinat yang telah dikonfirmasi untuk SIPES.

## Teknologi

- React, TypeScript, Vite, Leaflet / Esri World Imagery / OpenStreetMap
- Express, Prisma, SQLite, JWT
