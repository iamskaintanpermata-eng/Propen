-- CreateTable
CREATE TABLE "PENGGUNA" (
    "id_pengguna" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "nama_lengkap" TEXT NOT NULL,
    "nomor_kontak" TEXT NOT NULL,
    "peran" TEXT NOT NULL,
    "status_akun" TEXT NOT NULL DEFAULT 'aktif',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PENGGUNA_pkey" PRIMARY KEY ("id_pengguna")
);

-- CreateTable
CREATE TABLE "GEDUNG" (
    "id_gedung" TEXT NOT NULL,
    "nama_gedung" TEXT NOT NULL,
    "fakultas" TEXT NOT NULL,
    "koordinat_lat" DOUBLE PRECISION NOT NULL,
    "koordinat_long" DOUBLE PRECISION NOT NULL,
    "kapasitas_tps" INTEGER NOT NULL,

    CONSTRAINT "GEDUNG_pkey" PRIMARY KEY ("id_gedung")
);

-- CreateTable
CREATE TABLE "ARMADA_BENTOR" (
    "id_bentor" TEXT NOT NULL,
    "plat_nomor" TEXT NOT NULL,
    "kapasitas_maks_kantong" INTEGER NOT NULL,
    "status_operasional" TEXT NOT NULL DEFAULT 'tersedia',

    CONSTRAINT "ARMADA_BENTOR_pkey" PRIMARY KEY ("id_bentor")
);

-- CreateTable
CREATE TABLE "LAPORAN_SAMPAH" (
    "id_laporan" TEXT NOT NULL,
    "id_gedung" TEXT NOT NULL,
    "id_petugas" TEXT NOT NULL,
    "tanggal_lapor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jumlah_kantong" INTEGER NOT NULL,
    "kondisi_sampah" TEXT NOT NULL,
    "catatan" TEXT,
    "url_foto_sampah" TEXT,
    "status_laporan" TEXT NOT NULL DEFAULT 'Menunggu Akumulasi',

    CONSTRAINT "LAPORAN_SAMPAH_pkey" PRIMARY KEY ("id_laporan")
);

-- CreateTable
CREATE TABLE "PENUGASAN_PENGANGKUTAN" (
    "id_penugasan" TEXT NOT NULL,
    "id_admin" TEXT,
    "id_sopir" TEXT,
    "id_bentor" TEXT NOT NULL,
    "tanggal_penugasan" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_rencana_kantong" INTEGER NOT NULL,
    "estimasi_jarak_km" DOUBLE PRECISION,
    "nama_lokasi_tpa_target" TEXT NOT NULL DEFAULT 'TPA Kampus Unand',
    "koordinat_lat_sopir" DOUBLE PRECISION,
    "koordinat_long_sopir" DOUBLE PRECISION,
    "waktu_lokasi_sopir" TIMESTAMP(3),
    "status_tugas" TEXT NOT NULL DEFAULT 'Menunggu Sopir',

    CONSTRAINT "PENUGASAN_PENGANGKUTAN_pkey" PRIMARY KEY ("id_penugasan")
);

-- CreateTable
CREATE TABLE "DETAIL_PENUGASAN" (
    "id_detail" TEXT NOT NULL,
    "id_penugasan" TEXT NOT NULL,
    "id_laporan" TEXT NOT NULL,
    "urutan_singgah" INTEGER NOT NULL,
    "status_singgah" TEXT NOT NULL DEFAULT 'Menunggu',

    CONSTRAINT "DETAIL_PENUGASAN_pkey" PRIMARY KEY ("id_detail")
);

-- CreateTable
CREATE TABLE "LOG_PENJEMPUTAN" (
    "id_log_jemput" TEXT NOT NULL,
    "id_detail" TEXT NOT NULL,
    "waktu_jemput" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jumlah_kantong_aktual" INTEGER NOT NULL,
    "url_foto_jemput" TEXT NOT NULL,
    "catatan" TEXT,

    CONSTRAINT "LOG_PENJEMPUTAN_pkey" PRIMARY KEY ("id_log_jemput")
);

-- CreateTable
CREATE TABLE "LOG_PEMBUANGAN_AKHIR" (
    "id_log_buang" TEXT NOT NULL,
    "id_penugasan" TEXT NOT NULL,
    "id_admin_verifikator" TEXT,
    "waktu_buang" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nama_lokasi_tpa" TEXT NOT NULL,
    "koordinat_lat_tpa" DOUBLE PRECISION NOT NULL,
    "koordinat_long_tpa" DOUBLE PRECISION NOT NULL,
    "jumlah_kantong_dibuang" INTEGER NOT NULL,
    "url_foto_bukti_tpa" TEXT NOT NULL,
    "status_verifikasi" TEXT NOT NULL DEFAULT 'Menunggu Verifikasi',
    "catatan_verifikasi" TEXT,

    CONSTRAINT "LOG_PEMBUANGAN_AKHIR_pkey" PRIMARY KEY ("id_log_buang")
);

-- CreateTable
CREATE TABLE "LANGGANAN_PUSH" (
    "id_langganan" TEXT NOT NULL,
    "id_pengguna" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LANGGANAN_PUSH_pkey" PRIMARY KEY ("id_langganan")
);

-- CreateIndex
CREATE UNIQUE INDEX "PENGGUNA_username_key" ON "PENGGUNA"("username");

-- CreateIndex
CREATE UNIQUE INDEX "ARMADA_BENTOR_plat_nomor_key" ON "ARMADA_BENTOR"("plat_nomor");

-- CreateIndex
CREATE UNIQUE INDEX "LOG_PENJEMPUTAN_id_detail_key" ON "LOG_PENJEMPUTAN"("id_detail");

-- CreateIndex
CREATE UNIQUE INDEX "LOG_PEMBUANGAN_AKHIR_id_penugasan_key" ON "LOG_PEMBUANGAN_AKHIR"("id_penugasan");

-- CreateIndex
CREATE UNIQUE INDEX "LANGGANAN_PUSH_endpoint_key" ON "LANGGANAN_PUSH"("endpoint");

-- CreateIndex
CREATE INDEX "LANGGANAN_PUSH_id_pengguna_idx" ON "LANGGANAN_PUSH"("id_pengguna");

-- AddForeignKey
ALTER TABLE "LAPORAN_SAMPAH" ADD CONSTRAINT "LAPORAN_SAMPAH_id_gedung_fkey" FOREIGN KEY ("id_gedung") REFERENCES "GEDUNG"("id_gedung") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LAPORAN_SAMPAH" ADD CONSTRAINT "LAPORAN_SAMPAH_id_petugas_fkey" FOREIGN KEY ("id_petugas") REFERENCES "PENGGUNA"("id_pengguna") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PENUGASAN_PENGANGKUTAN" ADD CONSTRAINT "PENUGASAN_PENGANGKUTAN_id_admin_fkey" FOREIGN KEY ("id_admin") REFERENCES "PENGGUNA"("id_pengguna") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PENUGASAN_PENGANGKUTAN" ADD CONSTRAINT "PENUGASAN_PENGANGKUTAN_id_sopir_fkey" FOREIGN KEY ("id_sopir") REFERENCES "PENGGUNA"("id_pengguna") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PENUGASAN_PENGANGKUTAN" ADD CONSTRAINT "PENUGASAN_PENGANGKUTAN_id_bentor_fkey" FOREIGN KEY ("id_bentor") REFERENCES "ARMADA_BENTOR"("id_bentor") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DETAIL_PENUGASAN" ADD CONSTRAINT "DETAIL_PENUGASAN_id_penugasan_fkey" FOREIGN KEY ("id_penugasan") REFERENCES "PENUGASAN_PENGANGKUTAN"("id_penugasan") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DETAIL_PENUGASAN" ADD CONSTRAINT "DETAIL_PENUGASAN_id_laporan_fkey" FOREIGN KEY ("id_laporan") REFERENCES "LAPORAN_SAMPAH"("id_laporan") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LOG_PENJEMPUTAN" ADD CONSTRAINT "LOG_PENJEMPUTAN_id_detail_fkey" FOREIGN KEY ("id_detail") REFERENCES "DETAIL_PENUGASAN"("id_detail") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LOG_PEMBUANGAN_AKHIR" ADD CONSTRAINT "LOG_PEMBUANGAN_AKHIR_id_penugasan_fkey" FOREIGN KEY ("id_penugasan") REFERENCES "PENUGASAN_PENGANGKUTAN"("id_penugasan") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LOG_PEMBUANGAN_AKHIR" ADD CONSTRAINT "LOG_PEMBUANGAN_AKHIR_id_admin_verifikator_fkey" FOREIGN KEY ("id_admin_verifikator") REFERENCES "PENGGUNA"("id_pengguna") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LANGGANAN_PUSH" ADD CONSTRAINT "LANGGANAN_PUSH_id_pengguna_fkey" FOREIGN KEY ("id_pengguna") REFERENCES "PENGGUNA"("id_pengguna") ON DELETE CASCADE ON UPDATE CASCADE;
