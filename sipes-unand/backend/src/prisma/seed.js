import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding SIPES UNAND database...');

  const buildings = [
    {
      id_gedung: 'GD-01',
      nama_gedung: 'Gedung A',
      fakultas: 'Gedung Perkuliahan',
      koordinat_lat: -0.913766,
      koordinat_long: 100.459563,
      kapasitas_tps: 50,
    },
    {
      id_gedung: 'GD-02',
      nama_gedung: 'Gedung B',
      fakultas: 'Gedung Perkuliahan',
      koordinat_lat: -0.912766,
      koordinat_long: 100.461388,
      kapasitas_tps: 60,
    },
    {
      id_gedung: 'GD-03',
      nama_gedung: 'Gedung C',
      fakultas: 'Gedung Perkuliahan',
      koordinat_lat: -0.912891,
      koordinat_long: 100.461863,
      kapasitas_tps: 60,
    },
    {
      id_gedung: 'GD-04',
      nama_gedung: 'Gedung D',
      fakultas: 'Gedung Perkuliahan',
      koordinat_lat: -0.913891,
      koordinat_long: 100.461263,
      kapasitas_tps: 50,
    },
    {
      id_gedung: 'GD-05',
      nama_gedung: 'Gedung E',
      fakultas: 'Gedung Perkuliahan',
      koordinat_lat: -0.915578,
      koordinat_long: 100.460838,
      kapasitas_tps: 50,
    },
    {
      id_gedung: 'GD-06',
      nama_gedung: 'Gedung F',
      fakultas: 'Gedung Perkuliahan',
      koordinat_lat: -0.914172,
      koordinat_long: 100.460663,
      kapasitas_tps: 50,
    },
    {
      id_gedung: 'GD-07',
      nama_gedung: 'Gedung G',
      fakultas: 'Gedung Perkuliahan',
      koordinat_lat: -0.913100,
      koordinat_long: 100.461300,
      kapasitas_tps: 50,
    },
    {
      id_gedung: 'GD-08',
      nama_gedung: 'Gedung H',
      fakultas: 'Gedung Perkuliahan',
      koordinat_lat: -0.912766,
      koordinat_long: 100.461388,
      kapasitas_tps: 50,
    },
    {
      id_gedung: 'GD-09',
      nama_gedung: 'Gedung I',
      fakultas: 'Gedung Perkuliahan',
      koordinat_lat: -0.912766,
      koordinat_long: 100.462063,
      kapasitas_tps: 50,
    },
    {
      id_gedung: 'GD-10',
      nama_gedung: 'Gedung J',
      fakultas: 'Gedung Perkuliahan',
      koordinat_lat: -0.912672,
      koordinat_long: 100.461588,
      kapasitas_tps: 50,
    },
  ];

  for (const building of buildings) {
    const { id_gedung, ...data } = building;
    await prisma.gedung.upsert({
      where: { id_gedung },
      create: building,
      update: data,
    });
  }

  const vehicles = [
    { id_bentor: 'BTR-01', plat_nomor: 'BA 3421 QW', kapasitas_maks_kantong: 50, status_operasional: 'tersedia' },
    { id_bentor: 'BTR-02', plat_nomor: 'BA 5612 QA', kapasitas_maks_kantong: 60, status_operasional: 'tersedia' },
  ];
  for (const vehicle of vehicles) {
    await prisma.armadaBentor.upsert({
      where: { id_bentor: vehicle.id_bentor },
      create: vehicle,
      update: {
        plat_nomor: vehicle.plat_nomor,
        kapasitas_maks_kantong: vehicle.kapasitas_maks_kantong,
      },
    });
  }

  if (await prisma.pengguna.count() > 0) {
    console.log('Data referensi gedung dan armada diperbarui tanpa mengubah pengguna atau data operasional.');
    return;
  }

  const passwordAdmin = await bcrypt.hash('admin123', 10);
  const passwordPetugas = await bcrypt.hash('petugas123', 10);
  const passwordSopir = await bcrypt.hash('driver123', 10);
  const users = [
    { id_pengguna: 'USR-ADM-001', username: 'admin', password: passwordAdmin, nama_lengkap: 'Dr. Eng. Budi Santoso, S.T., M.T.', nomor_kontak: '08126789001', peran: 'admin' },
    { id_pengguna: 'USR-PTG-001', username: 'petugas', password: passwordPetugas, nama_lengkap: 'Rahmat Hidayat (Petugas FT)', nomor_kontak: '08137456112', peran: 'petugas_gedung' },
    { id_pengguna: 'USR-PTG-002', username: 'petugas2', password: passwordPetugas, nama_lengkap: 'Siti Rahmawati (Petugas FEB)', nomor_kontak: '08137456113', peran: 'petugas_gedung' },
    { id_pengguna: 'USR-DRV-001', username: 'driver', password: passwordSopir, nama_lengkap: 'Joko Susilo (Sopir Bentor 01)', nomor_kontak: '08526311990', peran: 'sopir_bentor' },
    { id_pengguna: 'USR-DRV-002', username: 'driver2', password: passwordSopir, nama_lengkap: 'Agus Pratama (Sopir Bentor 02)', nomor_kontak: '08526311991', peran: 'sopir_bentor' },
  ];
  await prisma.pengguna.createMany({ data: users });

  console.log('Seed selesai: akun, gedung A-J, dan armada tersedia; data operasional tetap dipertahankan.');
}

main()
  .catch((error) => {
    console.error('Error saat seeding:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
