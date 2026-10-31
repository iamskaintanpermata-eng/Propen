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
import webPush from 'web-push';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT || 5000);
const jwtSecret = process.env.JWT_SECRET;
const baseDirectory = path.dirname(fileURLToPath(import.meta.url));
const uploadDirectory = path.resolve(process.cwd(), process.env.UPLOAD_DIR || '../uploads');
const assignmentLoadPercent = Number(process.env.AUTO_ASSIGNMENT_LOAD_PERCENT || 80);
const disposalName = process.env.OFFICIAL_DISPOSAL_NAME || 'PPST UNAND';
const disposalLatitude = process.env.OFFICIAL_DISPOSAL_LATITUDE === undefined || process.env.OFFICIAL_DISPOSAL_LATITUDE === ''
  ? null
  : Number(process.env.OFFICIAL_DISPOSAL_LATITUDE);
const disposalLongitude = process.env.OFFICIAL_DISPOSAL_LONGITUDE === undefined || process.env.OFFICIAL_DISPOSAL_LONGITUDE === ''
  ? null
  : Number(process.env.OFFICIAL_DISPOSAL_LONGITUDE);
const disposalRadiusMeters = Number(process.env.OFFICIAL_DISPOSAL_RADIUS_METERS || 100);
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@sipes-unand.local';
if (Boolean(vapidPublicKey) !== Boolean(vapidPrivateKey)) {
  throw new Error('VAPID_PUBLIC_KEY dan VAPID_PRIVATE_KEY harus diatur bersamaan.');
}
const pushNotificationsEnabled = Boolean(vapidPublicKey && vapidPrivateKey);
if (pushNotificationsEnabled) {
  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}
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
    status: user.status_akun,
  };
}

async function requireAuth(request, response, next) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) {
    response.status(401).json({ error: 'Silakan masuk untuk melanjutkan.' });
    return;
  }
  let claims;
  try {
    claims = jwt.verify(token, jwtSecret);
  } catch {
    response.status(401).json({ error: 'Sesi berakhir. Silakan masuk kembali.' });
    return;
  }
  try {
    const user = await prisma.pengguna.findUnique({ where: { id_pengguna: claims.id } });
    if (!user || user.status_akun !== 'aktif') {
      response.status(401).json({ error: 'Akun tidak aktif. Silakan hubungi administrator.' });
      return;
    }
    request.user = { id: user.id_pengguna, role: user.peran };
    next();
  } catch (error) {
    next(error);
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

function distanceMeters(first, second) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function orderByNearestBuilding(reports) {
  const remaining = [...reports];
  const ordered = [];
  let current = { latitude: -0.91542, longitude: 100.45785 };
  while (remaining.length) {
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    remaining.forEach((report, index) => {
      const location = { latitude: report.gedung.koordinat_lat, longitude: report.gedung.koordinat_long };
      const distance = distanceMeters(current, location);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    const [nearest] = remaining.splice(nearestIndex, 1);
    ordered.push(nearest);
    current = { latitude: nearest.gedung.koordinat_lat, longitude: nearest.gedung.koordinat_long };
  }
  return ordered;
}

async function createAutomaticAssignmentsNow() {
  if (!Number.isInteger(assignmentLoadPercent) || assignmentLoadPercent < 1 || assignmentLoadPercent > 100) {
    throw new Error('AUTO_ASSIGNMENT_LOAD_PERCENT harus berupa bilangan bulat antara 1 dan 100.');
  }

  const [pendingReports, availableVehicles] = await Promise.all([
    prisma.laporanSampah.findMany({
      where: { status_laporan: { in: ['Menunggu Akumulasi', 'Menunggu Penugasan'] } },
      include: { gedung: true },
      orderBy: { tanggal_lapor: 'asc' },
    }),
    prisma.armadaBentor.findMany({
      where: { status_operasional: 'tersedia' },
      orderBy: { kapasitas_maks_kantong: 'asc' },
    }),
  ]);
  const remainingReports = [...pendingReports];
  const createdAssignments = [];

  for (const vehicle of availableVehicles) {
    let totalBags = 0;
    const selectedReports = [];
    for (const report of remainingReports) {
      if (totalBags + report.jumlah_kantong <= vehicle.kapasitas_maks_kantong) {
        selectedReports.push(report);
        totalBags += report.jumlah_kantong;
      }
    }
    const minimumLoad = Math.ceil(vehicle.kapasitas_maks_kantong * assignmentLoadPercent / 100);
    if (totalBags < minimumLoad || selectedReports.length === 0) continue;

    const orderedReports = orderByNearestBuilding(selectedReports);
    const taskId = `TRX-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    const assignment = await prisma.$transaction(async (transaction) => {
      const task = await transaction.penugasanPengangkutan.create({
        data: {
          id_penugasan: taskId,
          id_bentor: vehicle.id_bentor,
          total_rencana_kantong: totalBags,
          nama_lokasi_tpa_target: disposalName,
          status_tugas: 'Menunggu Sopir',
          detail_penugasan: {
            create: orderedReports.map((report, index) => ({
              id_detail: `DET-${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
              id_laporan: report.id_laporan,
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
      await transaction.laporanSampah.updateMany({
        where: { id_laporan: { in: orderedReports.map((report) => report.id_laporan) } },
        data: { status_laporan: 'Masuk Penugasan' },
      });
      await transaction.armadaBentor.update({
        where: { id_bentor: vehicle.id_bentor },
        data: { status_operasional: 'beroperasi' },
      });
      return task;
    }, { maxWait: 10000, timeout: 20000 });

    createdAssignments.push(assignment);
    const selectedIds = new Set(selectedReports.map((report) => report.id_laporan));
    for (let index = remainingReports.length - 1; index >= 0; index -= 1) {
      if (selectedIds.has(remainingReports[index].id_laporan)) remainingReports.splice(index, 1);
    }
  }

  return createdAssignments;
}

async function notifyDriversAboutAssignments(assignments) {
  if (!pushNotificationsEnabled || assignments.length === 0) return;
  let subscriptions;
  try {
    subscriptions = await prisma.langgananPush.findMany();
  } catch (error) {
    console.error('Gagal membaca langganan notifikasi push:', error);
    return;
  }
  await Promise.all(subscriptions.map(async (subscription) => {
    for (const assignment of assignments) {
      try {
        const buildings = [...new Set(assignment.detail_penugasan.map((detail) => detail.laporan.gedung.nama_gedung))];
        await webPush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, JSON.stringify({
          title: 'Penugasan pengangkutan baru',
          body: `${assignment.total_rencana_kantong} kantong sampah di ${buildings.join(', ')}. Buka SIPES untuk mengambil tugas.`,
          url: '/?page=Penugasan',
          tag: `assignment-${assignment.id_penugasan}`,
        }));
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await prisma.langgananPush.deleteMany({ where: { id_langganan: subscription.id_langganan } }).catch((deleteError) => {
            console.error(`Gagal menghapus langganan push yang kedaluwarsa ${subscription.id_langganan}:`, deleteError);
          });
          return;
        }
        console.error(`Gagal mengirim notifikasi push untuk langganan ${subscription.id_langganan}:`, error);
      }
    }
  }));
}

let assignmentGeneration = Promise.resolve();
function generateAutomaticAssignments() {
  const generation = assignmentGeneration.then(async () => {
    const assignments = await createAutomaticAssignmentsNow();
    await notifyDriversAboutAssignments(assignments);
    return assignments;
  });
  assignmentGeneration = generation.catch((error) => {
    console.error('Gagal membuat penugasan otomatis:', error);
  });
  return generation;
}

app.get('/api/health', (_request, response) => response.json({ status: 'ok', service: 'SIPES UNAND API' }));

app.get('/api/config', requireAuth, (_request, response) => {
  const hasDisposalCoordinates = Number.isFinite(disposalLatitude)
    && Number.isFinite(disposalLongitude)
    && disposalLatitude >= -90
    && disposalLatitude <= 90
    && disposalLongitude >= -180
    && disposalLongitude <= 180
    && Number.isFinite(disposalRadiusMeters)
    && disposalRadiusMeters > 0;
  response.json({
    assignmentLoadPercent,
    officialDisposal: hasDisposalCoordinates
      ? { name: disposalName, latitude: disposalLatitude, longitude: disposalLongitude, radiusMeters: disposalRadiusMeters }
      : null,
  });
});

app.get('/api/push/config', requireAuth, allowRoles('sopir_bentor'), (_request, response) => {
  response.json({ enabled: pushNotificationsEnabled, publicKey: pushNotificationsEnabled ? vapidPublicKey : null });
});

app.post('/api/push/subscriptions', requireAuth, allowRoles('sopir_bentor'), async (request, response, next) => {
  try {
    if (!pushNotificationsEnabled) {
      response.status(503).json({ error: 'Notifikasi push belum dikonfigurasi oleh administrator.' });
      return;
    }
    const endpoint = String(request.body?.endpoint || '').trim();
    const p256dh = String(request.body?.keys?.p256dh || '').trim();
    const auth = String(request.body?.keys?.auth || '').trim();
    let parsedEndpoint;
    try {
      parsedEndpoint = new URL(endpoint);
    } catch {
      response.status(400).json({ error: 'Alamat langganan notifikasi tidak valid.' });
      return;
    }
    const allowedPushHost = parsedEndpoint.hostname === 'fcm.googleapis.com'
      || parsedEndpoint.hostname.endsWith('.fcm.googleapis.com')
      || parsedEndpoint.hostname.endsWith('.push.services.mozilla.com')
      || parsedEndpoint.hostname.endsWith('.push.apple.com')
      || parsedEndpoint.hostname.endsWith('.notify.windows.com');
    const validKeys = /^[A-Za-z0-9_-]+$/.test(p256dh)
      && p256dh.length >= 20
      && p256dh.length <= 200
      && /^[A-Za-z0-9_-]+$/.test(auth)
      && auth.length >= 16
      && auth.length <= 100;
    if (parsedEndpoint.protocol !== 'https:' || parsedEndpoint.username || parsedEndpoint.password
      || !allowedPushHost || endpoint.length > 2048 || !validKeys) {
      response.status(400).json({ error: 'Alamat atau kunci langganan notifikasi tidak valid.' });
      return;
    }
    await prisma.langgananPush.upsert({
      where: { endpoint },
      create: {
        id_pengguna: request.user.id,
        endpoint,
        p256dh,
        auth,
      },
      update: {
        id_pengguna: request.user.id,
        p256dh,
        auth,
      },
    });
    response.status(201).json({ message: 'Notifikasi tugas berhasil diaktifkan pada perangkat ini.' });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/push/subscriptions', requireAuth, allowRoles('sopir_bentor'), async (request, response, next) => {
  try {
    const endpoint = String(request.body?.endpoint || '').trim();
    if (!endpoint || endpoint.length > 2048) {
      response.status(400).json({ error: 'Alamat langganan notifikasi tidak valid.' });
      return;
    }
    await prisma.langgananPush.deleteMany({
      where: { id_pengguna: request.user.id, endpoint },
    });
    response.json({ message: 'Notifikasi tugas dinonaktifkan pada perangkat ini.' });
  } catch (error) {
    next(error);
  }
});

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
    if (user.status_akun !== 'aktif') {
      response.status(403).json({
        error: user.status_akun === 'ditolak'
          ? 'Pendaftaran belum disetujui. Silakan hubungi administrator.'
          : 'Pendaftaran Anda sedang menunggu persetujuan administrator.',
      });
      return;
    }
    const token = jwt.sign({ id: user.id_pengguna, role: user.peran }, jwtSecret, { expiresIn: '8h' });
    response.json({ token, user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/register', async (request, response, next) => {
  try {
    const username = String(request.body?.username || '').trim();
    const name = String(request.body?.name || '').trim();
    const phone = String(request.body?.phone || '').trim();
    const password = String(request.body?.password || '');
    const role = String(request.body?.role || '');
    if (!/^[a-zA-Z0-9._-]{3,50}$/.test(username)) {
      response.status(400).json({ error: 'Username harus 3–50 karakter dan hanya boleh berisi huruf, angka, titik, garis bawah, atau tanda hubung.' });
      return;
    }
    if (name.length < 2 || name.length > 100 || phone.length < 6 || phone.length > 20) {
      response.status(400).json({ error: 'Nama lengkap dan nomor kontak harus diisi dengan benar.' });
      return;
    }
    if (password.length < 8 || password.length > 200) {
      response.status(400).json({ error: 'Kata sandi harus terdiri dari 8–200 karakter.' });
      return;
    }
    if (!['petugas_gedung', 'sopir_bentor'].includes(role)) {
      response.status(400).json({ error: 'Pilih peran petugas gedung atau sopir bentor.' });
      return;
    }
    const existing = await prisma.pengguna.findUnique({ where: { username } });
    if (existing) {
      response.status(409).json({ error: 'Username sudah digunakan. Silakan pilih username lain.' });
      return;
    }
    await prisma.pengguna.create({
      data: {
        id_pengguna: `USR-${crypto.randomBytes(5).toString('hex')}`,
        username,
        password: await bcrypt.hash(password, 10),
        nama_lengkap: name,
        nomor_kontak: phone,
        peran: role,
        status_akun: 'menunggu',
      },
    });
    response.status(201).json({ message: 'Pendaftaran berhasil dikirim dan menunggu persetujuan administrator.' });
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

app.patch('/api/auth/profile', requireAuth, async (request, response, next) => {
  try {
    const name = String(request.body?.name || '').trim();
    const phone = String(request.body?.phone || '').trim();
    const currentPassword = String(request.body?.currentPassword || '');
    const newPassword = String(request.body?.newPassword || '');
    if (name.length < 2 || name.length > 100 || phone.length < 6 || phone.length > 20) {
      response.status(400).json({ error: 'Nama lengkap dan nomor kontak harus diisi dengan benar.' });
      return;
    }
    const user = await prisma.pengguna.findUnique({ where: { id_pengguna: request.user.id } });
    if (!user) {
      response.status(404).json({ error: 'Akun tidak lagi tersedia.' });
      return;
    }
    const data = { nama_lengkap: name, nomor_kontak: phone };
    if (newPassword) {
      if (newPassword.length < 8 || newPassword.length > 200) {
        response.status(400).json({ error: 'Kata sandi baru harus terdiri dari 8–200 karakter.' });
        return;
      }
      if (!currentPassword || !(await bcrypt.compare(currentPassword, user.password))) {
        response.status(400).json({ error: 'Kata sandi saat ini tidak sesuai.' });
        return;
      }
      data.password = await bcrypt.hash(newPassword, 10);
    }
    const updatedUser = await prisma.pengguna.update({
      where: { id_pengguna: request.user.id },
      data,
    });
    response.json({ user: publicUser(updatedUser) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/users', requireAuth, allowRoles('admin'), async (_request, response, next) => {
  try {
    const users = await prisma.pengguna.findMany({
      select: {
        id_pengguna: true,
        username: true,
        nama_lengkap: true,
        nomor_kontak: true,
        peran: true,
        status_akun: true,
        created_at: true,
      },
      orderBy: [{ status_akun: 'asc' }, { created_at: 'desc' }],
    });
    response.json({
      users: users.map((user) => ({
        id: user.id_pengguna,
        username: user.username,
        name: user.nama_lengkap,
        phone: user.nomor_kontak,
        role: user.peran,
        status: user.status_akun,
        createdAt: user.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/admin/users/:id/access', requireAuth, allowRoles('admin'), async (request, response, next) => {
  try {
    const role = String(request.body?.role || '');
    const status = String(request.body?.status || '');
    if (request.params.id === request.user.id) {
      response.status(400).json({ error: 'Akun administrator yang sedang digunakan tidak dapat diubah dari halaman ini.' });
      return;
    }
    if (!['petugas_gedung', 'sopir_bentor'].includes(role) || !['aktif', 'ditolak'].includes(status)) {
      response.status(400).json({ error: 'Peran atau status akses tidak valid.' });
      return;
    }
    const target = await prisma.pengguna.findUnique({ where: { id_pengguna: request.params.id } });
    if (!target || target.peran === 'admin') {
      response.status(404).json({ error: 'Pengguna tidak ditemukan.' });
      return;
    }
    const updatedUser = await prisma.pengguna.update({
      where: { id_pengguna: target.id_pengguna },
      data: { peran: role, status_akun: status },
    });
    response.json({ user: publicUser(updatedUser) });
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
          ? { id_sopir: request.user.id, status_tugas: { in: ['Diambil Sopir', 'Dalam Perjalanan', 'Penjemputan', 'Menuju Pembuangan'] } }
          : { status_tugas: { in: ['Menunggu Sopir', 'Diambil Sopir', 'Dalam Perjalanan', 'Penjemputan', 'Menuju Pembuangan'] } },
      }),
      request.user.role === 'admin' ? prisma.armadaBentor.findMany({ orderBy: { plat_nomor: 'asc' } }) : [],
      request.user.role === 'admin' ? prisma.logPembuanganAkhir.count({ where: { status_verifikasi: 'Terverifikasi' } }) : 0,
    ]);
    response.json({
      totalReports: reports.length,
      waiting: reports.filter((report) => ['Menunggu Akumulasi', 'Menunggu Penugasan'].includes(report.status_laporan)).length,
      assigned: reports.filter((report) => ['Masuk Penugasan', 'Dijemput', 'Ditugaskan'].includes(report.status_laporan)).length,
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
      if (request.file) await validateUpload(request.file, imageAndDocumentTypes);
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
      const maxFleetCapacity = await prisma.armadaBentor.aggregate({ _max: { kapasitas_maks_kantong: true } });
      if (maxFleetCapacity._max.kapasitas_maks_kantong && bags > maxFleetCapacity._max.kapasitas_maks_kantong) {
        discardUpload(request);
        response.status(400).json({ error: `Jumlah melebihi kapasitas bentor terbesar (${maxFleetCapacity._max.kapasitas_maks_kantong} kantong). Bagi volume menjadi beberapa laporan.` });
        return;
      }
      const report = await prisma.laporanSampah.create({
        data: {
          id_laporan: `LAP-${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
          id_gedung: buildingId,
          id_petugas: request.user.id,
          jumlah_kantong: bags,
          kondisi_sampah: condition,
          catatan: String(request.body.catatan || '').trim() || null,
          url_foto_sampah: attachmentUrl(request),
          status_laporan: 'Menunggu Akumulasi',
        },
      });
      await generateAutomaticAssignments();
      const currentReport = await prisma.laporanSampah.findUnique({
        where: { id_laporan: report.id_laporan },
        include: reportInclude(),
      });
      response.status(201).json({ report: currentReport });
    } catch (error) {
      next(error);
    }
  },
);

app.get('/api/penugasan', requireAuth, async (request, response, next) => {
  try {
    const where = request.user.role === 'sopir_bentor'
      ? { OR: [{ id_sopir: request.user.id }, { id_sopir: null, status_tugas: 'Menunggu Sopir' }] }
      : {};
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

app.patch('/api/penugasan/:id/ambil', requireAuth, allowRoles('sopir_bentor'), async (request, response, next) => {
  try {
    await prisma.$transaction(async (transaction) => {
      const activeAssignment = await transaction.penugasanPengangkutan.findFirst({
        where: {
          id_sopir: request.user.id,
          status_tugas: { in: ['Diambil Sopir', 'Dalam Perjalanan', 'Penjemputan', 'Menuju Pembuangan'] },
        },
      });
      if (activeAssignment) throw Object.assign(new Error('Selesaikan penugasan aktif sebelum mengambil tugas lain.'), { status: 409 });
      const assignment = await transaction.penugasanPengangkutan.updateMany({
        where: {
          id_penugasan: request.params.id,
          id_sopir: null,
          status_tugas: 'Menunggu Sopir',
        },
        data: { id_sopir: request.user.id, status_tugas: 'Diambil Sopir' },
      });
      if (assignment.count === 0) {
        throw Object.assign(new Error('Penugasan sudah diambil sopir lain atau tidak lagi tersedia.'), { status: 409 });
      }
    });
    const claimed = await prisma.penugasanPengangkutan.findUnique({
      where: { id_penugasan: request.params.id },
      include: { sopir: { select: { id_pengguna: true, nama_lengkap: true } }, bentor: true },
    });
    response.json({ assignment: claimed });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/penugasan/:id/status', requireAuth, allowRoles('sopir_bentor'), async (request, response, next) => {
  try {
    const task = await prisma.penugasanPengangkutan.findFirst({
      where: { id_penugasan: request.params.id, id_sopir: request.user.id },
    });
    if (!task) {
      response.status(404).json({ error: 'Penugasan tidak ditemukan atau belum diambil oleh Anda.' });
      return;
    }
    const status = String(request.body?.status || '');
    if (status !== 'Dalam Perjalanan' || task.status_tugas !== 'Diambil Sopir') {
      response.status(409).json({ error: 'Ambil penugasan terlebih dahulu sebelum menjalankan perjalanan.' });
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

app.patch('/api/penugasan/:id/lokasi', requireAuth, allowRoles('sopir_bentor'), async (request, response, next) => {
  try {
    const latitude = Number(request.body?.latitude);
    const longitude = Number(request.body?.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      response.status(400).json({ error: 'Koordinat GPS tidak valid.' });
      return;
    }
    const updated = await prisma.penugasanPengangkutan.updateMany({
      where: {
        id_penugasan: request.params.id,
        id_sopir: request.user.id,
        status_tugas: { in: ['Dalam Perjalanan', 'Penjemputan', 'Menuju Pembuangan'] },
      },
      data: {
        koordinat_lat_sopir: latitude,
        koordinat_long_sopir: longitude,
        waktu_lokasi_sopir: new Date(),
      },
    });
    if (updated.count === 0) {
      response.status(409).json({ error: 'Lokasi hanya dapat diperbarui saat penugasan Anda sedang berjalan.' });
      return;
    }
    response.json({ updated: true });
  } catch (error) {
    next(error);
  }
});

app.post(
  '/api/penugasan/:id/penjemputan/:detailId',
  requireAuth,
  allowRoles('sopir_bentor'),
  uploadImage.single('foto'),
  async (request, response, next) => {
    try {
      if (!request.file) {
        response.status(400).json({ error: 'Foto bukti pengambilan wajib dilampirkan.' });
        return;
      }
      await validateUpload(request.file, imageTypes);
      const detail = await prisma.detailPenugasan.findFirst({
        where: {
          id_detail: request.params.detailId,
          id_penugasan: request.params.id,
          penugasan: { id_sopir: request.user.id, status_tugas: { in: ['Dalam Perjalanan', 'Penjemputan'] } },
        },
        include: { log_penjemputan: true, penugasan: { include: { bentor: true } } },
      });
      if (!detail) {
        discardUpload(request);
        response.status(404).json({ error: 'Titik penjemputan tidak ditemukan pada perjalanan Anda.' });
        return;
      }
      if (detail.log_penjemputan) {
        discardUpload(request);
        response.status(409).json({ error: 'Sampah di gedung ini sudah dikonfirmasi.' });
        return;
      }
      const actualBags = validateInteger(request.body.jumlah_kantong_aktual, 'Jumlah kantong aktual', { min: 0, max: 10000 });
      const result = await prisma.$transaction(async (transaction) => {
        const collected = await transaction.logPenjemputan.aggregate({
          where: { detail: { id_penugasan: detail.id_penugasan } },
          _sum: { jumlah_kantong_aktual: true },
        });
        if ((collected._sum.jumlah_kantong_aktual || 0) + actualBags > detail.penugasan.bentor.kapasitas_maks_kantong) {
          throw Object.assign(new Error('Jumlah pengambilan aktual melebihi kapasitas bentor.'), { status: 400 });
        }
        const log = await transaction.logPenjemputan.create({
          data: {
            id_log_jemput: `JMP-${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
            id_detail: detail.id_detail,
            jumlah_kantong_aktual: actualBags,
            url_foto_jemput: attachmentUrl(request),
            catatan: String(request.body.catatan || '').trim() || null,
          },
        });
        await transaction.detailPenugasan.update({
          where: { id_detail: detail.id_detail },
          data: { status_singgah: 'Selesai' },
        });
        await transaction.laporanSampah.update({
          where: { id_laporan: detail.id_laporan },
          data: { status_laporan: 'Dijemput' },
        });
        const remainingStops = await transaction.detailPenugasan.count({
          where: { id_penugasan: detail.id_penugasan, status_singgah: 'Menunggu' },
        });
        await transaction.penugasanPengangkutan.update({
          where: { id_penugasan: detail.id_penugasan },
          data: { status_tugas: remainingStops === 0 ? 'Menuju Pembuangan' : 'Penjemputan' },
        });
        return log;
      }, { maxWait: 10000, timeout: 20000 });
      response.status(201).json({ collection: result });
    } catch (error) {
      next(error);
    }
  },
);

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
        include: { detail_penugasan: { include: { log_penjemputan: true } }, bentor: true },
      });
      if (!task) {
        discardUpload(request);
        response.status(404).json({ error: 'Penugasan tidak ditemukan.' });
        return;
      }
      if (task.status_tugas === 'Menunggu Verifikasi' || task.status_tugas === 'Terverifikasi') {
        discardUpload(request);
        response.status(409).json({ error: 'Penugasan ini sudah diselesaikan.' });
        return;
      }
      if (task.status_tugas !== 'Menuju Pembuangan') {
        discardUpload(request);
        response.status(409).json({ error: 'Selesaikan semua penjemputan sebelum mengirim bukti pembuangan.' });
        return;
      }
      if (task.detail_penugasan.some((detail) => !detail.log_penjemputan)) {
        discardUpload(request);
        response.status(409).json({ error: 'Konfirmasi pengambilan di semua gedung terlebih dahulu.' });
        return;
      }
      const latitude = Number(request.body.latitude);
      const longitude = Number(request.body.longitude);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        discardUpload(request);
        response.status(400).json({ error: 'Lokasi GPS tidak valid. Izinkan akses lokasi lalu coba lagi.' });
        return;
      }
      const hasOfficialDisposal = Number.isFinite(disposalLatitude)
        && Number.isFinite(disposalLongitude)
        && disposalLatitude >= -90
        && disposalLatitude <= 90
        && disposalLongitude >= -180
        && disposalLongitude <= 180
        && Number.isFinite(disposalRadiusMeters)
        && disposalRadiusMeters > 0;
      if (!hasOfficialDisposal) {
        discardUpload(request);
        response.status(503).json({ error: 'Koordinat resmi PPST UNAND belum dikonfigurasi. Hubungi administrator SIPES.' });
        return;
      }
      const distanceFromDisposal = distanceMeters(
        { latitude, longitude },
        { latitude: disposalLatitude, longitude: disposalLongitude },
      );
      if (distanceFromDisposal > disposalRadiusMeters) {
        discardUpload(request);
        response.status(400).json({ error: `Anda masih ${Math.round(distanceFromDisposal)} meter dari PPST UNAND. Selesaikan penugasan hanya dalam radius ${disposalRadiusMeters} meter.` });
        return;
      }
      const actualBags = validateInteger(request.body.jumlah_kantong, 'Jumlah kantong aktual', { min: 0, max: 10000 });
      const collectedBags = task.detail_penugasan.reduce(
        (total, detail) => total + (detail.log_penjemputan?.jumlah_kantong_aktual || 0),
        0,
      );
      if (actualBags > collectedBags || actualBags > task.bentor.kapasitas_maks_kantong) {
        discardUpload(request);
        response.status(400).json({ error: 'Jumlah kantong yang dibuang tidak boleh melebihi jumlah yang dijemput atau kapasitas bentor.' });
        return;
      }
      const result = await prisma.$transaction(async (transaction) => {
        const disposal = await transaction.logPembuanganAkhir.create({
          data: {
            id_log_buang: `DIS-${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
            id_penugasan: task.id_penugasan,
            waktu_buang: new Date(),
            nama_lokasi_tpa: disposalName,
            koordinat_lat_tpa: latitude,
            koordinat_long_tpa: longitude,
            jumlah_kantong_dibuang: actualBags,
            url_foto_bukti_tpa: attachmentUrl(request),
          },
        });
        await transaction.penugasanPengangkutan.update({
          where: { id_penugasan: task.id_penugasan },
          data: { status_tugas: 'Menunggu Verifikasi' },
        });
        await transaction.armadaBentor.update({
          where: { id_bentor: task.id_bentor },
          data: { status_operasional: 'tersedia' },
        });
        return disposal;
      }, { maxWait: 10000, timeout: 20000 });
      await generateAutomaticAssignments();
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
    const updated = await prisma.$transaction(async (transaction) => {
      const verified = await transaction.logPembuanganAkhir.update({
        where: { id_log_buang: disposal.id_log_buang },
        data: {
          status_verifikasi: status,
          id_admin_verifikator: request.user.id,
          catatan_verifikasi: String(request.body?.catatan || '').trim() || null,
        },
      });
      if (status === 'Terverifikasi') {
        await transaction.penugasanPengangkutan.update({
          where: { id_penugasan: disposal.id_penugasan },
          data: { status_tugas: 'Terverifikasi' },
        });
        await transaction.laporanSampah.updateMany({
          where: { detail_penugasan: { some: { id_penugasan: disposal.id_penugasan } } },
          data: { status_laporan: 'Selesai' },
        });
      }
      return verified;
    });
    response.json({ disposal: updated });
  } catch (error) {
    next(error);
  }
});

app.get('/api/armada', requireAuth, allowRoles('admin'), async (_request, response, next) => {
  try {
    const vehicles = await prisma.armadaBentor.findMany({
      include: { penugasan: { where: { status_tugas: { in: ['Menunggu Sopir', 'Diambil Sopir', 'Dalam Perjalanan', 'Penjemputan', 'Menuju Pembuangan'] } }, include: { sopir: { select: { nama_lengkap: true } } } } },
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
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    response.status(409).json({ error: 'Data sudah diproses oleh permintaan lain. Muat ulang lalu coba kembali.' });
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
  generateAutomaticAssignments().catch((error) => {
    console.error('Gagal memproses akumulasi laporan saat backend dimulai:', error);
  });
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
