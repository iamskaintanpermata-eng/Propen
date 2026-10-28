import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT || 5000);
const jwtSecret = process.env.JWT_SECRET;
const baseDirectory = path.dirname(fileURLToPath(import.meta.url));
const uploadDirectory = path.resolve(process.cwd(), process.env.UPLOAD_DIR || '../uploads');
const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((origin) => origin.trim());

if (!jwtSecret || jwtSecret.length < 24) {
  throw new Error('JWT_SECRET harus diatur dengan nilai acak minimal 24 karakter.');
}

fs.mkdirSync(uploadDirectory, { recursive: true });
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(uploadDirectory, { dotfiles: 'deny', index: false }));

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => callback(null, uploadDirectory),
  filename: (_request, file, callback) => {
    const extensions = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'application/pdf': '.pdf',
    };
    const extension = extensions[file.mimetype] || '';
    callback(null, `${crypto.randomUUID()}${extension}`);
  },
});

const imageAndDocumentTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const uploader = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (!imageAndDocumentTypes.has(file.mimetype)) {
      callback(new Error('Format file tidak didukung. Gunakan JPG, PNG, WebP, atau PDF.'));
      return;
    }
    callback(null, true);
  },
});
const uploadImage = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (!imageTypes.has(file.mimetype)) {
      callback(new Error('Bukti foto harus berformat JPG, PNG, atau WebP.'));
      return;
    }
    callback(null, true);
  },
});

function publicUser(user) {
  return {
    id: user.id_pengguna,
    username: user.username,
    name: user.nama_lengkap,
    role: user.peran,
    phone: user.nomor_kontak,
  };
}

function requireAuth(request, response, next) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) {
    response.status(401).json({ error: 'Silakan masuk untuk melanjutkan.' });
    return;
  }
  try {
    request.user = jwt.verify(token, jwtSecret);
    next();
  } catch {
    response.status(401).json({ error: 'Sesi berakhir. Silakan masuk kembali.' });
  }
}

function allowRoles(...roles) {
  return (request, response, next) => {
    if (!roles.includes(request.user.role)) {
      response.status(403).json({ error: 'Akses tidak diizinkan untuk peran ini.' });
      return;
    }
    next();
  };
}

function validateInteger(value, label, { min = 1, max = 10000 } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw Object.assign(new Error(`${label} tidak valid.`), { status: 400 });
  }
  return number;
}

function attachmentUrl(request) {
  if (!request.file) return null;
  return `/uploads/${request.file.filename}`;
}

function discardUpload(request) {
  if (!request.file?.path) return;
  fsPromises.unlink(request.file.path).catch((error) => {
    if (error.code !== 'ENOENT') console.error('Failed to remove rejected upload:', error);
  });
}

async function validateUpload(file, allowedTypes) {
  if (!file || !allowedTypes.has(file.mimetype)) {
    throw Object.assign(new Error('Jenis file tidak didukung.'), { status: 400 });
  }
  const bytes = await fsPromises.readFile(file.path);
  const valid = file.mimetype === 'image/jpeg'
    ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : file.mimetype === 'image/png'
      ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : file.mimetype === 'image/webp'
        ? bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
        : file.mimetype === 'application/pdf'
          ? bytes.toString('ascii', 0, 5) === '%PDF-'
          : false;
  if (!valid) {
    await fsPromises.unlink(file.path);
    throw Object.assign(new Error('Isi file tidak sesuai dengan format yang dipilih.'), { status: 400 });
  }
}

function reportInclude() {
  return {
    gedung: true,
    petugas: { select: { id_pengguna: true, nama_lengkap: true } },
    detail_penugasan: {
      include: { penugasan: { include: { sopir: { select: { nama_lengkap: true } }, bentor: true } } },
    },
  };
}

app.get('/api/health', (_request, response) => response.json({ status: 'ok', service: 'SIPES UNAND API' }));

app.post('/api/auth/login', async (request, response, next) => {
  try {
    const username = String(request.body?.username || '').trim();
    const password = String(request.body?.password || '');
    if (!username || !password || username.length > 80 || password.length > 200) {
      response.status(400).json({ error: 'Nama pengguna dan kata sandi wajib diisi.' });
      return;
    }
    const user = await prisma.pengguna.findUnique({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      response.status(401).json({ error: 'Nama pengguna atau kata sandi salah.' });
      return;
    }
    const token = jwt.sign({ id: user.id_pengguna, role: user.peran }, jwtSecret, { expiresIn: '8h' });
    response.json({ token, user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/me', requireAuth, async (request, response, next) => {
  try {
    const user = await prisma.pengguna.findUnique({ where: { id_pengguna: request.user.id } });
    if (!user) {
      response.status(401).json({ error: 'Akun tidak lagi tersedia.' });
      return;
    }
    response.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/gedung', requireAuth, async (_request, response, next) => {
  try {
    const buildings = await prisma.gedung.findMany({
      include: {
        laporan_sampah: {
          orderBy: { tanggal_lapor: 'desc' },
          take: 1,
          select: { jumlah_kantong: true, kondisi_sampah: true, status_laporan: true },
        },
      },
      orderBy: { nama_gedung: 'asc' },
    });
    response.json({ buildings });
  } catch (error) {
    next(error);
  }
});

app.get('/api/dashboard', requireAuth, async (request, response, next) => {
  try {
    const where = request.user.role === 'petugas_gedung'
      ? { id_petugas: request.user.id }
      : request.user.role === 'sopir_bentor'
        ? { detail_penugasan: { some: { penugasan: { id_sopir: request.user.id } } } }
        : {};
    const [reports, activeTasks, fleet, recentDisposals] = await Promise.all([
      prisma.laporanSampah.findMany({ where, include: { gedung: true }, orderBy: { tanggal_lapor: 'desc' }, take: 100 }),
      prisma.penugasanPengangkutan.count({
        where: request.user.role === 'sopir_bentor'
          ? { id_sopir: request.user.id, status_tugas: { in: ['Ditugaskan', 'Dalam Proses'] } }
          : { status_tugas: { in: ['Ditugaskan', 'Dalam Proses'] } },
      }),
      request.user.role === 'admin' ? prisma.armadaBentor.findMany({ orderBy: { plat_nomor: 'asc' } }) : [],
      request.user.role === 'admin' ? prisma.logPembuanganAkhir.count({ where: { status_verifikasi: 'Terverifikasi' } }) : 0,
    ]);
    response.json({
      totalReports: reports.length,
      waiting: reports.filter((report) => report.status_laporan === 'Menunggu Penugasan').length,
      assigned: reports.filter((report) => report.status_laporan === 'Ditugaskan').length,
      completed: reports.filter((report) => report.status_laporan === 'Selesai').length,
      activeTasks,
      fleet,
      verifiedDisposals: recentDisposals,
      reports: reports.slice(0, 10),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/laporan', requireAuth, async (request, response, next) => {
  try {
    const where = request.user.role === 'petugas_gedung'
      ? { id_petugas: request.user.id }
      : request.user.role === 'sopir_bentor'
        ? { detail_penugasan: { some: { penugasan: { id_sopir: request.user.id } } } }
        : {};
    const reports = await prisma.laporanSampah.findMany({
      where,
      include: reportInclude(),
      orderBy: { tanggal_lapor: 'desc' },
    });
    response.json({ reports });
  } catch (error) {
    next(error);
  }
});

app.post(
  '/api/laporan',
  requireAuth,
  allowRoles('petugas_gedung'),
  uploader.single('lampiran'),
  async (request, response, next) => {
    try {
      if (!request.file) {
        response.status(400).json({ error: 'Lampirkan foto kondisi atau dokumen laporan.' });
        return;
      }
      await validateUpload(request.file, imageAndDocumentTypes);
      const buildingId = String(request.body.id_gedung || '');
      const bags = validateInteger(request.body.jumlah_kantong, 'Jumlah kantong', { max: 500 });
      const condition = String(request.body.kondisi_sampah || '');
      if (!['Normal', 'Hampir Penuh', 'Penuh', 'Mendesak'].includes(condition)) {
        discardUpload(request);
        response.status(400).json({ error: 'Kondisi sampah tidak valid.' });
        return;
      }
      const building = await prisma.gedung.findUnique({ where: { id_gedung: buildingId } });
      if (!building) {
        discardUpload(request);
        response.status(400).json({ error: 'Gedung tidak ditemukan.' });
        return;
      }
      const report = await prisma.laporanSampah.create({
        data: {
          id_laporan: `LAP-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
          id_gedung: buildingId,
          id_petugas: request.user.id,
          jumlah_kantong: bags,
          kondisi_sampah: condition,
          catatan: String(request.body.catatan || '').trim() || null,
          url_foto_sampah: attachmentUrl(request),
        },
        include: reportInclude(),
      });
      response.status(201).json({ report });
    } catch (error) {
      next(error);
    }
  },
);

app.patch('/api/laporan/:id/assign', requireAuth, allowRoles('admin'), async (request, response, next) => {
  try {
    const report = await prisma.laporanSampah.findUnique({ where: { id_laporan: request.params.id } });
    if (!report) {
      response.status(404).json({ error: 'Laporan tidak ditemukan.' });
      return;
    }
    if (report.status_laporan !== 'Menunggu Penugasan') {
      response.status(409).json({ error: 'Laporan ini sudah memiliki penugasan.' });
      return;
    }
    const updated = await prisma.laporanSampah.update({
      where: { id_laporan: report.id_laporan },
      data: { status_laporan: 'Ditugaskan' },
      include: reportInclude(),
    });
    response.json({ report: updated });
  } catch (error) {
    next(error);
  }
});

app.get('/api/penugasan', requireAuth, async (request, response, next) => {
  try {
    const where = request.user.role === 'sopir_bentor' ? { id_sopir: request.user.id } : {};
    const assignments = await prisma.penugasanPengangkutan.findMany({
      where,
      include: {
        sopir: { select: { id_pengguna: true, nama_lengkap: true } },
        bentor: true,
        detail_penugasan: { include: { laporan: { include: { gedung: true } }, log_penjemputan: true }, orderBy: { urutan_singgah: 'asc' } },
        log_pembuangan_akhir: true,
      },
      orderBy: { tanggal_penugasan: 'desc' },
    });
    response.json({ assignments });
  } catch (error) {
    next(error);
  }
});

app.get('/api/sopir', requireAuth, allowRoles('admin'), async (_request, response, next) => {
  try {
    const drivers = await prisma.pengguna.findMany({
      where: { peran: 'sopir_bentor' },
      select: { id_pengguna: true, username: true, nama_lengkap: true, nomor_kontak: true, peran: true },
      orderBy: { nama_lengkap: 'asc' },
    });
    response.json({ drivers: drivers.map(publicUser) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/penugasan', requireAuth, allowRoles('admin'), async (request, response, next) => {
  try {
    const { id_sopir: driverId, id_bentor: vehicleId } = request.body || {};
    const reportIds = [...new Set(Array.isArray(request.body?.id_laporan) ? request.body.id_laporan.map(String) : [])];
    if (!driverId || !vehicleId || reportIds.length === 0) {
      response.status(400).json({ error: 'Pilih sopir, armada, dan setidaknya satu laporan.' });
      return;
    }
    const result = await prisma.$transaction(async (transaction) => {
      const [driver, vehicle, reports] = await Promise.all([
        transaction.pengguna.findFirst({ where: { id_pengguna: String(driverId), peran: 'sopir_bentor' } }),
        transaction.armadaBentor.findUnique({ where: { id_bentor: String(vehicleId) } }),
        transaction.laporanSampah.findMany({ where: { id_laporan: { in: reportIds }, status_laporan: 'Menunggu Penugasan' } }),
      ]);
      if (!driver) throw Object.assign(new Error('Sopir tidak ditemukan.'), { status: 400 });
      if (!vehicle || vehicle.status_operasional !== 'tersedia') throw Object.assign(new Error('Armada tidak tersedia.'), { status: 409 });
      if (reports.length !== reportIds.length) throw Object.assign(new Error('Salah satu laporan sudah ditugaskan atau tidak ditemukan.'), { status: 409 });
      const totalBags = reports.reduce((total, report) => total + report.jumlah_kantong, 0);
      if (totalBags > vehicle.kapasitas_maks_kantong) throw Object.assign(new Error('Jumlah kantong melebihi kapasitas armada.'), { status: 400 });
      const taskId = `TRX-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const task = await transaction.penugasanPengangkutan.create({
        data: {
          id_penugasan: taskId,
          id_admin: request.user.id,
          id_sopir: driver.id_pengguna,
          id_bentor: vehicle.id_bentor,
          total_rencana_kantong: totalBags,
          detail_penugasan: {
            create: reportIds.map((id_laporan, index) => ({
              id_detail: `${taskId}-D${index + 1}`,
              id_laporan,
              urutan_singgah: index + 1,
            })),
          },
        },
        include: {
          sopir: { select: { id_pengguna: true, nama_lengkap: true } },
          bentor: true,
          detail_penugasan: { include: { laporan: { include: { gedung: true } } } },
        },
      });
      await Promise.all([
        transaction.laporanSampah.updateMany({ where: { id_laporan: { in: reportIds } }, data: { status_laporan: 'Ditugaskan' } }),
        transaction.armadaBentor.update({ where: { id_bentor: vehicle.id_bentor }, data: { status_operasional: 'beroperasi' } }),
      ]);
      return task;
    }, { maxWait: 10000, timeout: 20000 });
    response.status(201).json({ assignment: result });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/penugasan/:id/status', requireAuth, allowRoles('sopir_bentor'), async (request, response, next) => {
  try {
    const status = String(request.body?.status || '');
    if (!['Dalam Proses', 'Selesai'].includes(status)) {
      response.status(400).json({ error: 'Status penugasan tidak valid.' });
      return;
    }
    const task = await prisma.penugasanPengangkutan.findFirst({
      where: { id_penugasan: request.params.id, id_sopir: request.user.id },
    });
    if (!task) {
      response.status(404).json({ error: 'Penugasan tidak ditemukan.' });
      return;
    }
    if (!['Ditugaskan', 'Dalam Proses'].includes(task.status_tugas)) {
      response.status(409).json({ error: 'Penugasan ini sudah tidak aktif.' });
      return;
    }
    if (status === 'Selesai') {
      response.status(400).json({ error: 'Unggah bukti pembuangan untuk menyelesaikan penugasan.' });
      return;
    }
    const updated = await prisma.penugasanPengangkutan.update({
      where: { id_penugasan: task.id_penugasan },
      data: { status_tugas: status },
    });
    response.json({ assignment: updated });
  } catch (error) {
    next(error);
  }
});

app.post(
  '/api/penugasan/:id/bukti',
  requireAuth,
  allowRoles('sopir_bentor'),
  uploadImage.single('foto'),
  async (request, response, next) => {
    try {
      if (!request.file) {
        response.status(400).json({ error: 'Foto bukti pembuangan wajib dilampirkan.' });
        return;
      }
      await validateUpload(request.file, imageTypes);
      const task = await prisma.penugasanPengangkutan.findFirst({
        where: { id_penugasan: request.params.id, id_sopir: request.user.id },
        include: { detail_penugasan: true },
      });
      if (!task) {
        discardUpload(request);
        response.status(404).json({ error: 'Penugasan tidak ditemukan.' });
        return;
      }
      if (task.status_tugas === 'Selesai' || task.status_tugas === 'Terverifikasi') {
        discardUpload(request);
        response.status(409).json({ error: 'Penugasan ini sudah diselesaikan.' });
        return;
      }
      if (task.status_tugas !== 'Dalam Proses') {
        discardUpload(request);
        response.status(409).json({ error: 'Mulai perjalanan sebelum mengirim bukti pembuangan.' });
        return;
      }
      const latitude = Number(request.body.latitude);
      const longitude = Number(request.body.longitude);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        discardUpload(request);
        response.status(400).json({ error: 'Lokasi GPS tidak valid. Izinkan akses lokasi lalu coba lagi.' });
        return;
      }
      const actualBags = validateInteger(request.body.jumlah_kantong, 'Jumlah kantong aktual', { max: 10000 });
      const result = await prisma.$transaction(async (transaction) => {
        const disposal = await transaction.logPembuanganAkhir.create({
          data: {
            id_log_buang: `DIS-${crypto.randomUUID()}`,
            id_penugasan: task.id_penugasan,
            waktu_buang: new Date(),
            nama_lokasi_tpa: String(request.body.nama_lokasi_tpa || task.nama_lokasi_tpa_target),
            koordinat_lat_tpa: latitude,
            koordinat_long_tpa: longitude,
            jumlah_kantong_dibuang: actualBags,
            url_foto_bukti_tpa: attachmentUrl(request),
          },
        });
        await transaction.penugasanPengangkutan.update({
          where: { id_penugasan: task.id_penugasan },
          data: { status_tugas: 'Selesai' },
        });
        await transaction.detailPenugasan.updateMany({
          where: { id_penugasan: task.id_penugasan },
          data: { status_singgah: 'Selesai' },
        });
        await transaction.laporanSampah.updateMany({
          where: { detail_penugasan: { some: { id_penugasan: task.id_penugasan } } },
          data: { status_laporan: 'Selesai' },
        });
        await transaction.armadaBentor.update({
          where: { id_bentor: task.id_bentor },
          data: { status_operasional: 'tersedia' },
        });
        return disposal;
      }, { maxWait: 10000, timeout: 20000 });
      response.status(201).json({ disposal: result });
    } catch (error) {
      next(error);
    }
  },
);

app.patch('/api/pembuangan/:id/verifikasi', requireAuth, allowRoles('admin'), async (request, response, next) => {
  try {
    const status = String(request.body?.status || '');
    if (!['Terverifikasi', 'Ditolak'].includes(status)) {
      response.status(400).json({ error: 'Status verifikasi tidak valid.' });
      return;
    }
    const disposal = await prisma.logPembuanganAkhir.findUnique({ where: { id_log_buang: request.params.id } });
    if (!disposal) {
      response.status(404).json({ error: 'Bukti pembuangan tidak ditemukan.' });
      return;
    }
    const updated = await prisma.logPembuanganAkhir.update({
      where: { id_log_buang: disposal.id_log_buang },
      data: {
        status_verifikasi: status,
        id_admin_verifikator: request.user.id,
        catatan_verifikasi: String(request.body?.catatan || '').trim() || null,
      },
    });
    if (status === 'Terverifikasi') {
      await prisma.penugasanPengangkutan.update({
        where: { id_penugasan: disposal.id_penugasan },
        data: { status_tugas: 'Terverifikasi' },
      });
    }
    response.json({ disposal: updated });
  } catch (error) {
    next(error);
  }
});

app.get('/api/armada', requireAuth, allowRoles('admin'), async (_request, response, next) => {
  try {
    const vehicles = await prisma.armadaBentor.findMany({
      include: { penugasan: { where: { status_tugas: { in: ['Ditugaskan', 'Dalam Proses'] } }, include: { sopir: { select: { nama_lengkap: true } } } } },
      orderBy: { plat_nomor: 'asc' },
    });
    response.json({ vehicles });
  } catch (error) {
    next(error);
  }
});

app.get('/api/riwayat', requireAuth, async (request, response, next) => {
  try {
    const where = request.user.role === 'sopir_bentor'
      ? { penugasan: { id_sopir: request.user.id } }
      : request.user.role === 'petugas_gedung'
        ? { penugasan: { detail_penugasan: { some: { laporan: { id_petugas: request.user.id } } } } }
        : {};
    const disposals = await prisma.logPembuanganAkhir.findMany({
      where,
      include: { penugasan: { include: { sopir: { select: { nama_lengkap: true } }, bentor: true, detail_penugasan: { include: { laporan: { include: { gedung: true } } } } } } },
      orderBy: { waktu_buang: 'desc' },
    });
    response.json({ disposals });
  } catch (error) {
    next(error);
  }
});

app.use((error, request, response, _next) => {
  discardUpload(request);
  if (error instanceof multer.MulterError) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    response.status(status).json({ error: status === 413 ? 'Ukuran file maksimal 8 MB.' : 'File tidak dapat diproses.' });
    return;
  }
  if (error.message?.startsWith('Format file') || error.message?.startsWith('Bukti foto')) {
    response.status(400).json({ error: error.message });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
    response.status(404).json({ error: 'Data yang diminta tidak ditemukan.' });
    return;
  }
  if (error.status && error.status < 500) {
    response.status(error.status).json({ error: error.message });
    return;
  }
  console.error('API request failed:', error);
  response.status(500).json({ error: 'Terjadi kesalahan pada server. Silakan coba kembali.' });
});

const server = app.listen(port, () => {
  console.log(`SIPES UNAND API berjalan di http://localhost:${port}`);
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
