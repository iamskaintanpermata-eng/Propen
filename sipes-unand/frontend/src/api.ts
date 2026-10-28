export type UserRole = 'admin' | 'petugas_gedung' | 'sopir_bentor'

export type User = {
  id: string
  username: string
  name: string
  role: UserRole
  phone: string
  status: 'menunggu' | 'aktif' | 'ditolak'
}

export type Building = {
  id_gedung: string
  nama_gedung: string
  fakultas: string
  koordinat_lat: number
  koordinat_long: number
  kapasitas_tps: number
}

export type ApiReport = {
  id_laporan: string
  id_gedung: string
  id_petugas: string
  tanggal_lapor: string
  jumlah_kantong: number
  kondisi_sampah: string
  catatan: string | null
  url_foto_sampah: string | null
  status_laporan: string
  gedung: Building
  petugas: { id_pengguna: string; nama_lengkap: string }
}

export type ApiAssignment = {
  id_penugasan: string
  id_sopir: string
  id_bentor: string
  tanggal_penugasan: string
  total_rencana_kantong: number
  nama_lokasi_tpa_target: string
  status_tugas: string
  koordinat_lat_sopir: number | null
  koordinat_long_sopir: number | null
  waktu_lokasi_sopir: string | null
  sopir: { id_pengguna: string; nama_lengkap: string } | null
  bentor: { plat_nomor: string; kapasitas_maks_kantong: number }
  detail_penugasan: {
    id_detail: string
    status_singgah: string
    laporan: ApiReport
    log_penjemputan: {
      jumlah_kantong_aktual: number
      url_foto_jemput: string
    } | null
  }[]
  log_pembuangan_akhir?: {
    id_log_buang: string
    nama_lokasi_tpa: string
    koordinat_lat_tpa: number
    koordinat_long_tpa: number
    jumlah_kantong_dibuang: number
    url_foto_bukti_tpa: string
    status_verifikasi: string
  } | null
}

export type OfficialDisposal = {
  name: string
  latitude: number
  longitude: number
  radiusMeters: number
}

export async function apiRequest<T>(
  path: string,
  token?: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response
  try {
    response = await fetch(path, { ...init, headers })
  } catch {
    throw new Error('Tidak dapat terhubung ke server. Pastikan backend SIPES berjalan di localhost:5000.')
  }

  const payload = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(payload.error || `Permintaan gagal (${response.status}).`)
  return payload as T
}

export function apiUrl(path: string) {
  return path.startsWith('http') ? path : path
}
