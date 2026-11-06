# SIPES UNAND

## Menjalankan aplikasi lokal

Persyaratan: Node.js/npm dan Docker Desktop dengan Docker Compose aktif.

1. Jika `backend\.env` belum ada, salin template:

   ```powershell
   Copy-Item .env.example backend\.env
   ```
2. Buat skema PostgreSQL dan data demo. Data yang sudah ada tidak dihapus:

   ```powershell
   npm run setup:db
   ```
3. Jalankan aplikasi dalam Docker:

   ```powershell
   npm run dev
   ```
   Buka `http://localhost:8080`; API tersedia di `http://localhost:8080/api/health`. Image aplikasi dibangun dari kode terkini. Setelah mengubah kode, hentikan (`Ctrl+C`) dan jalankan ulang `npm run dev` untuk membangun image baru.
4. Hentikan layanan dengan `Ctrl+C`. Data PostgreSQL dan foto tetap tersimpan di volume Docker. `npm run db:down` hanya menghentikan PostgreSQL.

Untuk memindahkan database SQLite lain yang sudah berisi data, mulai PostgreSQL dan terapkan migrasi dahulu:

```powershell
npm run db:up
npm run deploy:local
docker compose --env-file backend/.env run --rm --no-deps -v "D:\path\ke\dev.db:/data/dev.db:ro" app node src/prisma/migrate-sqlite.js --source /data/dev.db
```

Ganti path dengan lokasi file SQLite sumber. Importer menyalin seluruh record dalam satu transaksi hanya jika PostgreSQL masih kosong; file SQLite sumber tidak diubah. Jangan jalankan seed sebelum impor.

## Menguji image deployment lokal

Untuk menjalankan image produksi di latar belakang:

```powershell
npm run deploy:local
```

Buka `http://localhost:8080`. Image otomatis menerapkan migrasi Prisma saat startup. Docker Compose menyimpan database dan foto di volume persisten. Perintah `docker compose --env-file backend/.env down` tidak menghapus volume; **jangan gunakan `down -v` kecuali memang ingin menghapus semua data**.

## Deployment publik di VPS

Konfigurasi sudah menyiapkan PostgreSQL, backend, frontend hasil build, volume foto persisten, dan Caddy untuk HTTPS otomatis. Untuk dipublikasikan, gunakan VPS dengan Docker Compose, arahkan DNS domain ke IP VPS, dan izinkan koneksi masuk pada port 80/443.

Di server, buat `backend/.env` dari `.env.example`, lalu ganti `POSTGRES_PASSWORD` dengan kata sandi acak yang kuat (gunakan karakter huruf/angka agar URL koneksi tidak perlu encoding), buat `JWT_SECRET` acak minimal 32 karakter, serta isi `APP_DOMAIN=domain-anda` dan `BASE_URL=https://domain-anda`. Jangan gunakan kredensial demo atau database lokal untuk server publik. Arahkan DNS domain ke IP server dan izinkan port 80/443. Jalankan dahulu hanya database dan aplikasi; aplikasi hanya terikat ke localhost:

```sh
docker compose --env-file backend/.env up -d --build db app
```

Untuk database baru, isi sementara `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_PASSWORD` (minimal 16 karakter), `INITIAL_ADMIN_NAME`, dan `INITIAL_ADMIN_PHONE` di `backend/.env`, lalu buat akun admin sebelum membuka akses publik:

```sh
docker compose --env-file backend/.env run --rm --no-deps app node src/prisma/seed.js
```

Seed production hanya membuat akun admin tersebut; akun demo lokal tidak dibuat. Hapus nilai bootstrap dari file setelah akun berhasil dibuat, lalu aktifkan Caddy:

```sh
docker compose --env-file backend/.env --profile public up -d caddy
```

Caddy akan meminta dan memperbarui sertifikat HTTPS. Jika memakai database yang sudah berisi data, pastikan tidak ada akun demo atau kata sandi bawaan sebelum mengaktifkan akses publik.

Pastikan backup PostgreSQL dan volume foto dilakukan terpisah dan diuji sebelum operasional. Jangan deploy database SQLite pengembangan beserta akun demo ke server publik.

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

Izinkan akses kamera dan lokasi pada peramban saat diminta. Kamera tersedia melalui `localhost` atau HTTPS. Foto dibatasi 8 MB, dikelompokkan menurut jenis dan bulan, dan disimpan di volume persisten Docker. Peta satelit memakai Esri World Imagery, peta jalan memakai OpenStreetMap, dan rute jalan memakai layanan OSRM; semuanya membutuhkan koneksi internet. Gunakan pemilih layer di pojok kanan atas peta untuk beralih antara tampilan satelit dan peta jalan.

Pilihan gedung dan titik peta diambil dari tabel gedung. Data seed memuat Gedung Perkuliahan A–J; pastikan nama dan koordinat resmi sudah benar sebelum operasional agar laporan dan rute memakai lokasi yang sesuai.

## Notifikasi penugasan untuk sopir bentor

Sopir dapat mengaktifkan **Notifikasi tugas** dari aplikasi pada ponsel. Saat laporan yang terkumpul membentuk penugasan baru, SIPES mengirim notifikasi ke perangkat sopir yang sudah berlangganan; notifikasi dapat diterima ketika aplikasi tidak sedang terbuka. Notifikasi hanya dikirim setelah pengguna mengizinkan notifikasi pada browser.

Untuk mengaktifkannya di server:

1. Jalankan `npx web-push generate-vapid-keys` dari folder `backend`, lalu simpan nilai public dan private key ke `VAPID_PUBLIC_KEY` dan `VAPID_PRIVATE_KEY` di `backend\.env`. Simpan private key sebagai rahasia dan gunakan pasangan kunci yang sama selama aplikasi berjalan.
2. Pastikan `VAPID_SUBJECT` berisi alamat kontak yang dapat dihubungi, misalnya `mailto:admin@unand.ac.id`.
3. Jalankan `npm run setup:db` untuk menerapkan migrasi database.
4. Jalankan kembali aplikasi dan buka melalui HTTPS. `localhost` juga diizinkan untuk uji lokal.
5. Login sebagai sopir bentor di ponsel, tekan **Aktifkan notifikasi tugas**, lalu izinkan notifikasi pada browser.

Di iPhone/iPad, web push tersedia pada iOS/iPadOS 16.4 atau lebih baru untuk aplikasi web yang sudah ditambahkan ke Layar Utama. Notifikasi push memerlukan koneksi internet dan dapat ditahan oleh pengaturan hemat baterai atau izin browser.

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
- Express, Prisma, PostgreSQL, Docker Compose, Caddy, JWT
