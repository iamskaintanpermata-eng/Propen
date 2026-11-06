import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(scriptDirectory, '..', '..');
const schemaPath = path.join(backendDirectory, 'prisma', 'schema.prisma');
const sourceArgumentIndex = process.argv.indexOf('--source');
const sourceArgument = sourceArgumentIndex >= 0 ? process.argv[sourceArgumentIndex + 1] : 'file:./dev.db';
const sourceUrl = sourceArgument.startsWith('file:')
  ? new URL(sourceArgument, pathToFileURL(schemaPath))
  : pathToFileURL(path.resolve(process.cwd(), sourceArgument));
const sourcePath = fileURLToPath(sourceUrl);
const tables = [
  { model: 'pengguna', table: 'PENGGUNA', dates: ['created_at'] },
  { model: 'gedung', table: 'GEDUNG', dates: [] },
  { model: 'armadaBentor', table: 'ARMADA_BENTOR', dates: [] },
  { model: 'laporanSampah', table: 'LAPORAN_SAMPAH', dates: ['tanggal_lapor'] },
  {
    model: 'penugasanPengangkutan',
    table: 'PENUGASAN_PENGANGKUTAN',
    dates: ['tanggal_penugasan', 'waktu_lokasi_sopir'],
  },
  { model: 'detailPenugasan', table: 'DETAIL_PENUGASAN', dates: [] },
  { model: 'logPenjemputan', table: 'LOG_PENJEMPUTAN', dates: ['waktu_jemput'] },
  { model: 'logPembuanganAkhir', table: 'LOG_PEMBUANGAN_AKHIR', dates: ['waktu_buang'] },
  { model: 'langgananPush', table: 'LANGGANAN_PUSH', dates: ['created_at', 'updated_at'] },
];

function readLegacyRows() {
  if (!fs.existsSync(sourcePath)) throw new Error(`Database SQLite sumber tidak ditemukan: ${sourcePath}`);

  const source = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    source.exec('BEGIN');
    const existingTables = new Set(
      source.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(({ name }) => name),
    );
    const rowsByTable = new Map();
    for (const table of tables) {
      if (!existingTables.has(table.table)) {
        rowsByTable.set(table.model, []);
        continue;
      }

      const rows = source.prepare(`SELECT * FROM "${table.table}"`).all().map((row) => {
        for (const field of table.dates) {
          if (row[field] !== null && row[field] !== undefined) row[field] = new Date(row[field]);
        }
        return row;
      });
      rowsByTable.set(table.model, rows);
    }
    source.exec('COMMIT');
    return rowsByTable;
  } catch (error) {
    source.exec('ROLLBACK');
    throw error;
  } finally {
    source.close();
  }
}

async function main() {
  if (!process.env.DATABASE_URL?.startsWith('postgresql://')
    && !process.env.DATABASE_URL?.startsWith('postgres://')) {
    throw new Error('DATABASE_URL tujuan harus menunjuk ke PostgreSQL.');
  }

  const existingCounts = await Promise.all(tables.map(({ model }) => prisma[model].count()));
  if (existingCounts.some((count) => count > 0)) {
    throw new Error('Database PostgreSQL tujuan tidak kosong. Tidak ada data yang diimpor.');
  }

  const rowsByTable = readLegacyRows();
  const sourceCounts = tables.map(({ model }) => rowsByTable.get(model).length);
  if (sourceCounts.every((count) => count === 0)) {
    throw new Error('Tidak ada data yang dapat dipindahkan dari database SQLite sumber.');
  }

  await prisma.$transaction(async (transaction) => {
    for (const { model } of tables) {
      const rows = rowsByTable.get(model);
      if (rows.length > 0) await transaction[model].createMany({ data: rows });
    }
  }, { maxWait: 10000, timeout: 120000 });

  console.log('Pemindahan data SQLite ke PostgreSQL selesai. Ringkasan jumlah record:');
  tables.forEach(({ table, model }, index) => {
    console.log(`  ${table}: ${sourceCounts[index]}`);
  });
  console.log(`Database SQLite asli tidak diubah: ${sourcePath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
