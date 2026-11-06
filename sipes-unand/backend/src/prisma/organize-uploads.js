import 'dotenv/config';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(scriptDirectory, '..', '..');
const uploadDirectory = path.resolve(backendDirectory, process.env.UPLOAD_DIR || '../uploads');
const schemaPath = path.join(backendDirectory, 'prisma', 'schema.prisma');
const databaseUrl = process.env.DATABASE_URL || '';
const applyChanges = process.argv.includes('--apply');
const photoTables = [
  {
    model: 'laporanSampah',
    idField: 'id_laporan',
    dateField: 'tanggal_lapor',
    urlField: 'url_foto_sampah',
    category: 'laporan',
  },
  {
    model: 'logPenjemputan',
    idField: 'id_log_jemput',
    dateField: 'waktu_jemput',
    urlField: 'url_foto_jemput',
    category: 'penjemputan',
  },
  {
    model: 'logPembuanganAkhir',
    idField: 'id_log_buang',
    dateField: 'waktu_buang',
    urlField: 'url_foto_bukti_tpa',
    category: 'pembuangan',
  },
];

function legacyFilename(url) {
  let pathname;
  try {
    pathname = new URL(url, 'http://localhost').pathname;
  } catch {
    throw new Error(`Alamat foto tidak valid: ${url}`);
  }
  const match = pathname.match(/^\/uploads\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function organizedPath(category, date, filename) {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const datePrefix = date.toISOString().slice(0, 10).replaceAll('-', '');
  const organizedFilename = `${datePrefix}-${filename}`;
  return {
    absolutePath: path.join(uploadDirectory, category, year, month, organizedFilename),
    url: `/uploads/${category}/${year}/${month}/${organizedFilename}`,
  };
}

async function sameFile(firstPath, secondPath) {
  try {
    const [first, second] = await Promise.all([fs.readFile(firstPath), fs.readFile(secondPath)]);
    return first.equals(second);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function readPhotoRecords() {
  const groups = await Promise.all(photoTables.map(async (table) => ({
    table,
    records: await prisma[table.model].findMany({
      select: {
        [table.idField]: true,
        [table.dateField]: true,
        [table.urlField]: true,
      },
    }),
  })));

  return groups.flatMap(({ table, records }) => records
    .filter((record) => record[table.urlField])
    .map((record) => ({
    table,
    id: record[table.idField],
    date: record[table.dateField],
    url: record[table.urlField],
    })));
}

async function main() {
  if (!databaseUrl.startsWith('file:')) {
    throw new Error('Penataan foto lama hanya didukung untuk database SQLite lokal.');
  }

  const records = await readPhotoRecords();
  const plan = [];
  const referencedLegacyFiles = new Set();
  for (const record of records) {
    const filename = legacyFilename(record.url);
    if (!filename) continue;
    referencedLegacyFiles.add(filename);

    const sourcePath = path.join(uploadDirectory, filename);
    const sourceStat = await fs.stat(sourcePath).catch((error) => {
      if (error.code === 'ENOENT') {
        throw new Error(`File foto yang tercatat tidak ditemukan: ${record.url}`);
      }
      throw error;
    });
    if (!sourceStat.isFile()) {
      throw new Error(`Alamat foto bukan file: ${record.url}`);
    }

    const target = organizedPath(record.table.category, record.date, filename);
    const targetRelativePath = path.relative(uploadDirectory, target.absolutePath);
    if (targetRelativePath === '..' || targetRelativePath.startsWith(`..${path.sep}`) || path.isAbsolute(targetRelativePath)) {
      throw new Error(`Tujuan foto berada di luar folder uploads: ${target.url}`);
    }
    plan.push({ ...record, oldUrl: record.url, sourcePath, absolutePath: target.absolutePath, newUrl: target.url });
  }

  for (const entry of await fs.readdir(uploadDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(jpe?g|png|webp)$/i.test(entry.name) || referencedLegacyFiles.has(entry.name)) continue;
    const sourcePath = path.join(uploadDirectory, entry.name);
    const stat = await fs.stat(sourcePath);
    const target = organizedPath('arsip', stat.mtime, entry.name);
    plan.push({
      table: null,
      id: null,
      date: stat.mtime,
      oldUrl: `/uploads/${entry.name}`,
      sourcePath,
      absolutePath: target.absolutePath,
      newUrl: target.url,
    });
  }

  if (plan.length === 0) {
    console.log('Tidak ada foto lama di folder uploads utama yang perlu ditata.');
    return;
  }

  console.log(`${applyChanges ? 'Akan menata' : 'Pratinjau'} ${plan.length} foto lama:`);
  for (const item of plan) console.log(`  ${item.table?.category || 'arsip'}: ${item.oldUrl} -> ${item.newUrl}`);

  if (!applyChanges) {
    console.log('Belum ada file atau database yang diubah. Jalankan dengan --apply untuk menerapkan.');
    return;
  }

  const backupDirectory = path.join(backendDirectory, '.photo-backups', new Date().toISOString().replaceAll(':', '-'));
  const legacyBackupDirectory = path.join(backupDirectory, 'legacy');
  await fs.mkdir(legacyBackupDirectory, { recursive: true });

  try {
    const databasePath = fileURLToPath(new URL(databaseUrl, pathToFileURL(schemaPath)));
    const databaseBackupPath = path.join(backupDirectory, path.basename(databasePath));
    const escapedBackupPath = databaseBackupPath.replaceAll("'", "''");
    await prisma.$executeRawUnsafe(`VACUUM INTO '${escapedBackupPath}'`);

    const backedUpSources = new Set();
    for (const item of plan) {
      if (!backedUpSources.has(item.sourcePath)) {
        await fs.copyFile(item.sourcePath, path.join(legacyBackupDirectory, path.basename(item.sourcePath)));
        backedUpSources.add(item.sourcePath);
      }
      await fs.mkdir(path.dirname(item.absolutePath), { recursive: true });
      try {
        await fs.copyFile(item.sourcePath, item.absolutePath, constants.COPYFILE_EXCL);
      } catch (error) {
        if (error.code !== 'EEXIST' || !(await sameFile(item.sourcePath, item.absolutePath))) throw error;
      }
    }

    await fs.writeFile(
      path.join(backupDirectory, 'manifest.json'),
      JSON.stringify(plan.map(({ table, id, oldUrl, newUrl }) => ({
        table: table?.model || 'arsip',
        id,
        oldUrl,
        newUrl,
      })), null, 2),
    );

    const updates = plan.filter((item) => item.table);
    if (updates.length > 0) {
      await prisma.$transaction(
        updates.map((item) => prisma[item.table.model].update({
          where: { [item.table.idField]: item.id },
          data: { [item.table.urlField]: item.newUrl },
        })),
      );
    }

    const currentRecords = await readPhotoRecords();
    const stillReferenced = new Set(currentRecords.map((record) => record.url));
    for (const sourcePath of backedUpSources) {
      const oldUrl = `/uploads/${path.basename(sourcePath)}`;
      if (stillReferenced.has(oldUrl)) continue;
      await fs.unlink(sourcePath);
    }

    console.log(`Foto tertata. Backup database, foto lama, dan manifest tersimpan di: ${backupDirectory}`);
  } catch (error) {
    console.error(`Penataan foto gagal. File sumber dipertahankan bila belum dipindahkan. Backup (jika berhasil dibuat): ${backupDirectory}`);
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
