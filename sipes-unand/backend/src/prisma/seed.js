import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding SIPES UNAND database...');

  if (await prisma.pengguna.count() > 0) {
    console.log('Data SIPES sudah tersedia; seed dilewati untuk menjaga data yang ada.');
    return;
  }

  await prisma.logPembuanganAkhir.deleteMany();
  await prisma.logPenjemputan.deleteMany();
  await prisma.detailPenugasan.deleteMany();
  await prisma.penugasanPengangkutan.deleteMany();
  await prisma.laporanSampah.deleteMany();
  await prisma.armadaBentor.deleteMany();
  await prisma.gedung.deleteMany();
  await prisma.pengguna.deleteMany();

  const passwordAdmin = await bcrypt.hash('admin123', 10);
  const passwordPetugas = await bcrypt.hash('petugas123', 10);
  const passwordSopir = await bcrypt.hash('driver123', 10);

  const users = [
    {
      id_pengguna: 'USR-ADM-001',
      username: 'admin',
      password: passwordAdmin,
      nama_lengkap: 'Dr. Eng. Budi Santoso, S.T., M.T.',
      nomor_kontak: '08126789001',
      peran: 'admin',
    },
    {
      id_pengguna: 'USR-PTG-001',
      username: 'petugas',
      password: passwordPetugas,
      nama_lengkap: 'Rahmat Hidayat (Petugas FT)',
      nomor_kontak: '08137456112',
      peran: 'petugas_gedung',
    },
    {
      id_pengguna: 'USR-PTG-002',
      username: 'petugas2',
      password: passwordPetugas,
      nama_lengkap: 'Siti Rahmawati (Petugas FEB)',
      nomor_kontak: '08137456113',
      peran: 'petugas_gedung',
    },
    {
      id_pengguna: 'USR-DRV-001',
      username: 'driver',
      password: passwordSopir,
      nama_lengkap: 'Joko Susilo (Sopir Bentor 01)',
      nomor_kontak: '08526311990',
      peran: 'sopir_bentor',
    },
    {
      id_pengguna: 'USR-DRV-002',
      username: 'driver2',
      password: passwordSopir,
      nama_lengkap: 'Agus Pratama (Sopir Bentor 02)',
      nomor_kontak: '08526311991',
      peran: 'sopir_bentor',
    },
  ];

  await prisma.pengguna.createMany({ data: users });
  console.log('Akun demo berhasil dibuat.');

  const buildings = [
    {
      id_gedung: 'GD-01',
      nama_gedung: 'Gedung Rektorat Unand',
      fakultas: 'Pusat Administrasi & Rektorat',
      koordinat_lat: -0.91542,
      koordinat_long: 100.45785,
      kapasitas_tps: 50,
    },
    {
      id_gedung: 'GD-02',
      nama_gedung: 'Fakultas Teknik',
      fakultas: 'Teknik',
      koordinat_lat: -0.91375,
      koordinat_long: 100.45902,
      kapasitas_tps: 60,
    },
    {
      id_gedung: 'GD-03',
      nama_gedung: 'Fakultas Ekonomi dan Bisnis',
      fakultas: 'Ekonomi dan Bisnis',
      koordinat_lat: -0.91721,
      koordinat_long: 100.45654,
      kapasitas_tps: 60,
    },
    {
      id_gedung: 'GD-04',
      nama_gedung: 'Fakultas Pertanian',
      fakultas: 'Pertanian',
      koordinat_lat: -0.91605,
      koordinat_long: 100.46102,
      kapasitas_tps: 50,
    },
    {
      id_gedung: 'GD-05',
      nama_gedung: 'Fakultas Kedokteran',
      fakultas: 'Kedokteran',
      koordinat_lat: -0.91250,
      koordinat_long: 100.46250,
      kapasitas_tps: 45,
    },
    {
      id_gedung: 'GD-06',
      nama_gedung: 'Perpustakaan Pusat',
      fakultas: 'Pusat Sumber Belajar',
      koordinat_lat: -0.91480,
      koordinat_long: 100.45850,
      kapasitas_tps: 40,
    },
  ];

  await prisma.gedung.createMany({ data: buildings });

  await prisma.armadaBentor.createMany({
    data: [
      {
        id_bentor: 'BTR-01',
        plat_nomor: 'BA 3421 QW',
        kapasitas_maks_kantong: 50,
        status_operasional: 'tersedia',
      },
      {
        id_bentor: 'BTR-02',
        plat_nomor: 'BA 5612 QA',
        kapasitas_maks_kantong: 60,
        status_operasional: 'tersedia',
      },
    ],
  });

  console.log('Seed selesai: akun, gedung, dan armada tersedia; data operasional menunggu simulasi.');
}

main()
  .catch((error) => {
    console.error('Error saat seeding:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
