import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bike,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileCheck2,
  FilePlus2,
  FileText,
  LayoutDashboard,
  Leaf,
  LogOut,
  Map,
  MapPin,
  Menu,
  MoreHorizontal,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  Truck,
  Users,
  X,
} from 'lucide-react'
import type { ApiAssignment, ApiReport, Building, User, UserRole } from './api'
import { apiRequest } from './api'
import MapPanel from './MapPanel'
import type { MapBuilding } from './MapPanel'
import 'leaflet/dist/leaflet.css'
import './App.css'

type Page = 'Ringkasan' | 'Laporan sampah' | 'Penugasan' | 'Armada' | 'Peta kampus' | 'Riwayat'
type ReportStatus = 'Menunggu penugasan' | 'Ditugaskan' | 'Selesai'
type Condition = 'Normal' | 'Hampir penuh' | 'Penuh' | 'Mendesak'
type Report = {
  id: string
  buildingId: string
  building: string
  bags: number
  condition: Condition
  status: ReportStatus
  time: string
  reporter: string
  attachment: string
}
type DashboardStats = { totalReports: number; waiting: number; assigned: number; completed: number; activeTasks: number; verifiedDisposals: number }
type Disposal = {
  id_log_buang: string
  nama_lokasi_tpa: string
  koordinat_lat_tpa: number
  koordinat_long_tpa: number
  jumlah_kantong_dibuang: number
  url_foto_bukti_tpa: string
  status_verifikasi: string
  waktu_buang: string
  penugasan: ApiAssignment
}
type Vehicle = { id_bentor: string; plat_nomor: string; kapasitas_maks_kantong: number; status_operasional: string }
type AttachmentPreview = { url: string; title: string }

const todayLabel = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
const allPages: { label: Page; icon: LucideIcon; roles: UserRole[] }[] = [
  { label: 'Ringkasan', icon: LayoutDashboard, roles: ['admin', 'petugas_gedung', 'sopir_bentor'] },
  { label: 'Laporan sampah', icon: FileText, roles: ['admin', 'petugas_gedung'] },
  { label: 'Penugasan', icon: Truck, roles: ['admin', 'sopir_bentor'] },
  { label: 'Armada', icon: Bike, roles: ['admin'] },
  { label: 'Peta kampus', icon: Map, roles: ['admin', 'petugas_gedung', 'sopir_bentor'] },
  { label: 'Riwayat', icon: Activity, roles: ['admin', 'petugas_gedung', 'sopir_bentor'] },
]

function displayReport(report: ApiReport): Report {
  return {
    id: report.id_laporan,
    buildingId: report.id_gedung,
    building: report.gedung.nama_gedung,
    bags: report.jumlah_kantong,
    condition: report.kondisi_sampah === 'Hampir Penuh' ? 'Hampir penuh' : report.kondisi_sampah as Condition,
    status: report.status_laporan === 'Menunggu Penugasan' ? 'Menunggu penugasan' : report.status_laporan as ReportStatus,
    time: new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(new Date(report.tanggal_lapor)),
    reporter: report.petugas.nama_lengkap,
    attachment: report.url_foto_sampah,
  }
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('sipes-token') || '')
  const [user, setUser] = useState<User | null>(null)
  const [sessionLoading, setSessionLoading] = useState(Boolean(token))
  const [activePage, setActivePage] = useState<Page>('Ringkasan')
  const [reports, setReports] = useState<Report[]>([])
  const [buildings, setBuildings] = useState<Building[]>([])
  const [assignments, setAssignments] = useState<ApiAssignment[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [disposals, setDisposals] = useState<Disposal[]>([])
  const [stats, setStats] = useState<DashboardStats>({ totalReports: 0, waiting: 0, assigned: 0, completed: 0, activeTasks: 0, verifiedDisposals: 0 })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Semua status')
  const [modal, setModal] = useState<'report' | 'assignment' | 'proof' | null>(null)
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreview | null>(null)
  const [proofAssignment, setProofAssignment] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [modalError, setModalError] = useState('')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [reportPhoto, setReportPhoto] = useState<File | null>(null)
  const [proofPhoto, setProofPhoto] = useState<File | null>(null)

  useEffect(() => {
    if (!token) {
      return
    }
    let active = true
    apiRequest<{ user: User }>('/api/auth/me', token)
      .then(({ user: currentUser }) => {
        if (active) setUser(currentUser)
      })
      .catch((cause: Error) => {
        if (!active) return
        localStorage.removeItem('sipes-token')
        setToken('')
        setError(cause.message)
      })
      .finally(() => {
        if (active) setSessionLoading(false)
      })
    return () => { active = false }
  }, [token])

  useEffect(() => {
    if (!token || !user) return
    let active = true
    const optionalRequests = user.role === 'admin'
      ? apiRequest<{ vehicles: Vehicle[] }>('/api/armada', token)
      : Promise.resolve({ vehicles: [] as Vehicle[] })
    Promise.all([
      apiRequest<{ totalReports: number; waiting: number; assigned: number; completed: number; activeTasks: number; verifiedDisposals: number }>('/api/dashboard', token),
      apiRequest<{ reports: ApiReport[] }>('/api/laporan', token),
      apiRequest<{ buildings: Building[] }>('/api/gedung', token),
      apiRequest<{ assignments: ApiAssignment[] }>('/api/penugasan', token),
      apiRequest<{ disposals: Disposal[] }>('/api/riwayat', token),
      optionalRequests,
    ]).then(([dashboard, reportResult, buildingResult, assignmentResult, historyResult, fleetResult]) => {
      if (!active) return
      setStats(dashboard)
      setReports(reportResult.reports.map(displayReport))
      setBuildings(buildingResult.buildings)
      setAssignments(assignmentResult.assignments)
      setDisposals(historyResult.disposals)
      setVehicles(fleetResult.vehicles)
    }).catch((cause: Error) => {
      if (active) setError(cause.message)
    })
    return () => { active = false }
  }, [token, user, refreshKey])

  const filteredReports = useMemo(() => reports.filter((report) => {
    const matchesSearch = `${report.id} ${report.building} ${report.reporter}`.toLowerCase().includes(search.toLowerCase())
    return matchesSearch && (statusFilter === 'Semua status' || report.status === statusFilter)
  }), [reports, search, statusFilter])

  function notify(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice((current) => current === message ? '' : current), 3500)
  }

  function refresh() {
    setRefreshKey((current) => current + 1)
  }

  function signOut() {
    localStorage.removeItem('sipes-token')
    setToken('')
    setUser(null)
    setReports([])
    setAssignments([])
    setBuildings([])
    setVehicles([])
    setDisposals([])
    setStats({ totalReports: 0, waiting: 0, assigned: 0, completed: 0, activeTasks: 0, verifiedDisposals: 0 })
    setActivePage('Ringkasan')
    setError('')
  }

  function acceptLogin(nextToken: string, nextUser: User) {
    localStorage.setItem('sipes-token', nextToken)
    setError('')
    setUser(nextUser)
    setToken(nextToken)
    setActivePage(nextUser.role === 'sopir_bentor' ? 'Penugasan' : 'Ringkasan')
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    if (!reportPhoto) {
      setModalError('Ambil foto kondisi sampah dengan kamera sebelum menyimpan laporan.')
      return
    }
    try {
      const form = new FormData(event.currentTarget)
      form.set('lampiran', reportPhoto)
      await apiRequest('/api/laporan', token, { method: 'POST', body: form })
      setModal(null)
      setReportPhoto(null)
      setModalError('')
      setActivePage('Laporan sampah')
      notify('Laporan berhasil disimpan.')
      refresh()
    } catch (cause) {
      setModalError((cause as Error).message)
    }
  }

  async function createAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    const form = new FormData(event.currentTarget)
    const selectedReports = form.getAll('reports').map(String)
    try {
      await apiRequest('/api/penugasan', token, {
        method: 'POST',
        body: JSON.stringify({
          id_sopir: form.get('driver'),
          id_bentor: form.get('vehicle'),
          id_laporan: selectedReports,
        }),
      })
      setModal(null)
      setModalError('')
      notify('Penugasan berhasil dibuat dan diteruskan ke sopir.')
      refresh()
    } catch (cause) {
      setModalError((cause as Error).message)
    }
  }

  async function startAssignment(assignmentId: string) {
    if (!token) return
    try {
      await apiRequest(`/api/penugasan/${encodeURIComponent(assignmentId)}/status`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'Dalam Proses' }),
      })
      notify('Perjalanan dimulai. Tetap ikuti rute yang ditentukan.')
      refresh()
    } catch (cause) {
      setError((cause as Error).message)
    }
  }

  async function submitProof(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || !proofAssignment) return
    if (!proofPhoto) {
      setModalError('Ambil foto bukti pembuangan dengan kamera sebelum mengirim.')
      return
    }
    try {
      const form = new FormData(event.currentTarget)
      form.set('foto', proofPhoto)
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Peramban ini tidak mendukung GPS.'))
          return
        }
        navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error('Aktifkan izin lokasi/GPS di peramban untuk mengirim bukti.')), { enableHighAccuracy: true, timeout: 15000 })
      })
      form.append('latitude', String(position.coords.latitude))
      form.append('longitude', String(position.coords.longitude))
      await apiRequest(`/api/penugasan/${encodeURIComponent(proofAssignment)}/bukti`, token, { method: 'POST', body: form })
      setModal(null)
      setProofPhoto(null)
      setModalError('')
      notify('Bukti pembuangan dan koordinat GPS berhasil dikirim.')
      refresh()
    } catch (cause) {
      setModalError((cause as Error).message)
    }
  }

  async function verifyDisposal(disposalId: string) {
    if (!token) return
    try {
      await apiRequest(`/api/pembuangan/${encodeURIComponent(disposalId)}/verifikasi`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'Terverifikasi' }),
      })
      notify('Bukti pembuangan berhasil diverifikasi.')
      refresh()
    } catch (cause) {
      setError((cause as Error).message)
    }
  }

  if (sessionLoading) return <div className="session-loading"><span className="loading-spinner" />Memeriksa sesi SIPES...</div>
  if (!user || !token) return <LoginPage onLogin={acceptLogin} initialError={error} />

  const roleName = user.role === 'admin' ? 'Administrator' : user.role === 'sopir_bentor' ? 'Sopir bentor' : 'Petugas gedung'
  const navItems = allPages.filter((page) => page.roles.includes(user.role))
  const mapBuildings: MapBuilding[] = buildings.map((building) => ({
    ...building,
    laporan_sampah: reports.filter((report) => report.buildingId === building.id_gedung).slice(0, 1).map((report) => ({
      jumlah_kantong: report.bags,
      kondisi_sampah: report.condition === 'Hampir penuh' ? 'Hampir Penuh' : report.condition,
      status_laporan: report.status,
    })),
  }))

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setActivePage('Ringkasan') }}>
          <span className="brand-mark"><Leaf size={23} strokeWidth={2.4} /></span>
          <span className="brand-copy"><strong>sipes<span>.</span></strong><small>UNIVERSITAS ANDALAS</small></span>
        </a>
        <div className="workspace-label">MENU UTAMA</div>
        <nav className="main-nav" aria-label="Navigasi utama">
          {navItems.map(({ label, icon: Icon }) => (
            <button key={label} className={`nav-item ${activePage === label ? 'nav-active' : ''}`} onClick={() => { setActivePage(label); setMobileNavOpen(false) }}>
              <Icon size={18} strokeWidth={1.9} /><span>{label}</span>
              {label === 'Laporan sampah' && stats.waiting > 0 && <span className="nav-count">{stats.waiting}</span>}
            </button>
          ))}
        </nav>
        <div className="workspace-label tools-label">AKUN</div>
        <button className="nav-item" onClick={() => notify(`Masuk sebagai ${roleName}. Username: ${user.username}`)}><Users size={18} /><span>Profil saya</span></button>
        <button className="nav-item" onClick={() => notify('Hubungi pengelola SIPES UNAND melalui unit kebersihan kampus.')}><CircleHelp size={18} /><span>Pusat bantuan</span></button>
        <div className="sidebar-bottom">
          <button className="profile" onClick={signOut}><span className="avatar">{user.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><span className="profile-copy"><strong>{user.name}</strong><small>{roleName} · Keluar</small></span><LogOut size={16} className="profile-more" /></button>
        </div>
      </aside>
      {mobileNavOpen && <button className="sidebar-scrim" aria-label="Tutup navigasi" onClick={() => setMobileNavOpen(false)} />}

      <main className="main-panel">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Buka navigasi" onClick={() => setMobileNavOpen(true)}><Menu size={21} /></button>
          <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{activePage}</strong></div>
          <div className="topbar-actions"><span className="campus-status"><span /> Sistem terhubung</span><button className="top-profile" onClick={signOut}><span className="avatar avatar-small">{user.name.slice(0, 1).toUpperCase()}</span><span>{user.name}</span><LogOut size={15} /></button></div>
        </header>
        <div className="page-content">
          <section className={`page-heading ${activePage === 'Ringkasan' ? 'page-heading-dashboard' : ''}`}>
            <div><div className="eyebrow"><span className="eyebrow-line" /> SIPES UNAND <span className="eyebrow-dot">/</span> {roleName.toUpperCase()}</div>
              <h1>{activePage === 'Ringkasan' ? <>Pengelolaan kampus,<br className="title-break" /> <span>lebih terpantau.</span></> : activePage === 'Peta kampus' ? <>Peta operasional<br /><span>kampus Unand.</span></> : activePage}</h1>
              <p>{activePage === 'Ringkasan' ? `Selamat datang, ${user.name}. ${user.role === 'sopir_bentor' ? 'Lihat dan selesaikan tugas pengangkutan Anda.' : 'Berikut pembaruan operasional kampus.'}` : pageDescription(activePage)}</p>
            </div>
            <div className="heading-actions"><div className="date-chip"><Clock3 size={15} /><span>{todayLabel}</span></div>
              {user.role === 'petugas_gedung' && activePage === 'Laporan sampah' && <button className="primary-button" onClick={() => { setModalError(''); setModal('report') }}><Plus size={17} /> Buat laporan</button>}
              {user.role === 'admin' && activePage === 'Penugasan' && <button className="primary-button" onClick={() => { setModalError(''); setModal('assignment') }}><Plus size={17} /> Buat penugasan</button>}
            </div>
          </section>

          {error && <div className="error-banner" role="alert"><CircleHelp size={17} /><span>{error}</span><button aria-label="Tutup pesan error" onClick={() => setError('')}><X size={15} /></button></div>}
          {activePage === 'Ringkasan' && <Dashboard user={user} reports={reports} assignments={assignments} stats={stats} onNavigate={setActivePage} onOpenAttachment={(preview) => setAttachmentPreview(preview)} onCreateReport={() => { setModalError(''); setModal('report') }} />}
          {activePage === 'Laporan sampah' && <ReportsPage user={user} reports={filteredReports} search={search} statusFilter={statusFilter} onSearch={setSearch} onStatusFilter={setStatusFilter} onRefresh={refresh} onOpenAttachment={(preview) => setAttachmentPreview(preview)} onCreate={() => { setModalError(''); setModal('report') }} />}
          {activePage === 'Penugasan' && <AssignmentsPage user={user} assignments={assignments} onCreate={() => { setModalError(''); setModal('assignment') }} onStart={startAssignment} onProof={(id) => { setProofAssignment(id); setProofPhoto(null); setModalError(''); setModal('proof') }} />}
          {activePage === 'Armada' && <FleetPage vehicles={vehicles} />}
          {activePage === 'Peta kampus' && <MapPage buildings={mapBuildings} />}
          {activePage === 'Riwayat' && <HistoryPage user={user} disposals={disposals} reports={reports.filter((report) => report.status === 'Selesai')} onVerify={verifyDisposal} onOpenAttachment={(preview) => setAttachmentPreview(preview)} />}
          <footer className="page-footer"><span><span className="footer-leaf"><Leaf size={13} /></span> SIPES UNAND <span className="footer-separator">·</span> Mendukung Green Campus</span><span>Terhubung ke database lokal <span className="footer-live-dot" /> <strong>Aktif</strong></span></footer>
        </div>
      </main>

      {notice && <div className="toast"><CheckCircle2 size={18} />{notice}<button aria-label="Tutup" onClick={() => setNotice('')}><X size={15} /></button></div>}
      {modal === 'report' && <ReportModal buildings={buildings} photo={reportPhoto} onPhotoChange={setReportPhoto} error={modalError} onClose={() => { setModal(null); setReportPhoto(null); setModalError('') }} onSubmit={submitReport} />}
      {modal === 'assignment' && <AssignmentModal reports={reports.filter((report) => report.status === 'Menunggu penugasan')} vehicles={vehicles.filter((vehicle) => vehicle.status_operasional === 'tersedia')} error={modalError} onClose={() => { setModal(null); setModalError('') }} onSubmit={createAssignment} />}
      {modal === 'proof' && <ProofModal photo={proofPhoto} onPhotoChange={setProofPhoto} error={modalError} onClose={() => { setModal(null); setProofPhoto(null); setModalError('') }} onSubmit={submitProof} />}
      {attachmentPreview && <AttachmentPreviewModal preview={attachmentPreview} onClose={() => setAttachmentPreview(null)} />}
    </div>
  )
}

function pageDescription(page: Page) {
  const descriptions: Record<Page, string> = {
    Ringkasan: 'Pantau kegiatan pengelolaan sampah kampus.',
    'Laporan sampah': 'Kelola laporan kondisi sampah di seluruh area kampus.',
    Penugasan: 'Pantau atau laksanakan pengangkutan sampah.',
    Armada: 'Lihat kesiapan armada bentor.',
    'Peta kampus': 'Lihat sebaran gedung, TPS, dan kondisi laporan secara geografis.',
    Riwayat: 'Telusuri aktivitas pengangkutan dan verifikasi pembuangan.',
  }
  return descriptions[page]
}

function LoginPage({ onLogin, initialError }: { onLogin: (token: string, user: User) => void; initialError: string }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const response = await apiRequest<{ token: string; user: User }>('/api/auth/login', undefined, {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
      onLogin(response.token, response.user)
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return <main className="login-screen">
    <section className="login-brand-panel"><div className="login-brand"><span className="brand-mark"><Leaf size={23} /></span><span className="brand-copy"><strong>sipes<span>.</span></strong><small>UNIVERSITAS ANDALAS</small></span></div>
      <div className="login-message"><span className="login-eyebrow"><Leaf size={14} /> GREEN CAMPUS INITIATIVE</span><h1>Kelola sampah.<br /><span>Jaga lingkungan.</span></h1><p>Platform terpadu untuk memantau proses pengumpulan, pengangkutan, hingga pembuangan akhir sampah kampus.</p>
        <div className="login-feature"><span><MapPin size={17} /></span><div><strong>Terpantau secara geografis</strong><small>Titik TPS dan operasional kampus dalam satu peta.</small></div></div>
        <div className="login-feature"><span><ShieldCheck size={17} /></span><div><strong>Tercatat dan terverifikasi</strong><small>Dokumentasi bukti untuk setiap aktivitas pengangkutan.</small></div></div>
      </div><div className="login-campus-caption"><span /> UNIVERSITAS ANDALAS <i>·</i> PADANG, SUMATERA BARAT</div>
    </section>
    <section className="login-form-panel"><div className="login-form-wrap"><div className="login-mobile-brand"><span className="brand-mark"><Leaf size={21} /></span><span className="brand-copy"><strong>sipes<span>.</span></strong><small>UNIVERSITAS ANDALAS</small></span></div>
      <span className="login-form-kicker">SELAMAT DATANG KEMBALI</span><h2>Masuk ke SIPES</h2><p className="login-subtitle">Masukkan akun untuk melanjutkan ke ruang kerja Anda.</p>
      {(error || initialError) && <div className="login-error" role="alert">{error || initialError}</div>}
      <form onSubmit={submit} className="login-form"><label>Nama pengguna<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Contoh: admin" required /></label><label>Kata sandi<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Masukkan kata sandi" required /></label><button type="submit" className="primary-button login-submit" disabled={loading}>{loading ? 'Memeriksa akun...' : <>Masuk ke akun <ArrowRight size={16} /></>}</button></form>
      <figure className="login-campus-art"><img src="/unand-campus.svg" alt="Ilustrasi kampus Universitas Andalas di Limau Manis" /><figcaption>Universitas Andalas <span>·</span> Limau Manis</figcaption></figure>
      <div className="login-footer">SIPES UNAND <span>·</span> Sistem Informasi Pengelolaan Sampah</div>
    </div></section>
  </main>
}

function Dashboard({ user, reports, assignments, stats, onNavigate, onOpenAttachment, onCreateReport }: { user: User; reports: Report[]; assignments: ApiAssignment[]; stats: DashboardStats; onNavigate: (page: Page) => void; onOpenAttachment: (preview: AttachmentPreview) => void; onCreateReport: () => void }) {
  return <>
    <section className="stats-grid">
      <StatCard icon={FileText} label={user.role === 'petugas_gedung' ? 'Laporan saya' : 'Total laporan'} value={stats.totalReports} color="green" caption="tercatat di sistem" />
      <StatCard icon={Clock3} label="Menunggu penjemputan" value={stats.waiting} color="orange" caption="laporan belum ditugaskan" />
      <StatCard icon={Truck} label={user.role === 'sopir_bentor' ? 'Tugas aktif saya' : 'Dalam pengangkutan'} value={user.role === 'sopir_bentor' ? assignments.filter((assignment) => ['Ditugaskan', 'Dalam Proses'].includes(assignment.status_tugas)).length : stats.activeTasks} color="blue" caption="penugasan aktif" />
      <StatCard icon={ShieldCheck} label="Selesai ditangani" value={user.role === 'admin' ? stats.verifiedDisposals : stats.completed} color="purple" caption={user.role === 'admin' ? 'pembuangan terverifikasi' : 'laporan selesai'} />
    </section>
    {user.role === 'sopir_bentor' ? <section className="panel driver-home-card"><span className="stat-icon stat-blue"><Truck size={19} /></span><div><h2>Periksa tugas pengangkutan Anda</h2><p>{assignments.filter((assignment) => ['Ditugaskan', 'Dalam Proses'].includes(assignment.status_tugas)).length} penugasan aktif menunggu tindakan.</p></div><button className="primary-button" onClick={() => onNavigate('Penugasan')}>Buka tugas <ArrowRight size={15} /></button></section> : <>
      <div className="home-section-heading"><div><h2>Aktivitas terbaru</h2><p>Laporan sampah yang tercatat di area kampus.</p></div>{user.role === 'petugas_gedung' && <button className="primary-button" onClick={onCreateReport}><Plus size={16} /> Buat laporan</button>}</div>
      <ReportsTable reports={reports.slice(0, 5)} onOpenAttachment={onOpenAttachment} />
      <div className="dashboard-shortcuts"><button onClick={() => onNavigate('Laporan sampah')}><FileText size={17} /><span><strong>Kelola laporan</strong><small>Telusuri status penjemputan sampah.</small></span><ArrowRight size={16} /></button><button onClick={() => onNavigate('Peta kampus')}><MapPin size={17} /><span><strong>Peta kampus</strong><small>Lihat lokasi TPS dan laporan gedung.</small></span><ArrowRight size={16} /></button>{user.role === 'admin' && <button onClick={() => onNavigate('Penugasan')}><Truck size={17} /><span><strong>Penugasan bentor</strong><small>{stats.activeTasks} perjalanan sedang aktif.</small></span><ArrowRight size={16} /></button>}</div>
    </>}
  </>
}

function StatCard({ icon: Icon, label, value, color, caption }: { icon: LucideIcon; label: string; value: number; color: string; caption: string }) {
  return <article className="stat-card"><div className="stat-top"><span className={`stat-icon stat-${color}`}><Icon size={18} /></span><MoreHorizontal size={18} color="#a1aaa4" /></div><span className="stat-label">{label}</span><div className="stat-value-line"><strong>{String(value).padStart(2, '0')}</strong></div><small className="stat-caption">{caption}</small></article>
}

function ReportsPage({ user, reports, search, statusFilter, onSearch, onStatusFilter, onRefresh, onOpenAttachment, onCreate }: { user: User; reports: Report[]; search: string; statusFilter: string; onSearch: (value: string) => void; onStatusFilter: (value: string) => void; onRefresh: () => void; onOpenAttachment: (preview: AttachmentPreview) => void; onCreate: () => void }) {
  return <section className="panel page-table-panel"><div className="table-toolbar"><div><h2>Semua laporan</h2><p>{user.role === 'petugas_gedung' ? 'Laporan yang Anda catat dari area gedung.' : 'Laporan kondisi sampah dari seluruh area kampus.'}</p></div><div className="table-controls"><label className="search-control"><Search size={16} /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Cari laporan atau lokasi..." /></label><select className="filter-control" value={statusFilter} onChange={(event) => onStatusFilter(event.target.value)}><option>Semua status</option><option>Menunggu penugasan</option><option>Ditugaskan</option><option>Selesai</option></select>{user.role === 'petugas_gedung' && <button className="primary-button table-create" onClick={onCreate}><Plus size={16} /> Laporan</button>}</div></div>
    <ReportsTable reports={reports} onOpenAttachment={onOpenAttachment} />
    <div className="table-pagination"><span>Menampilkan <strong>{reports.length}</strong> laporan</span><button onClick={onRefresh}>Muat ulang data</button></div>
  </section>
}

function ReportsTable({ reports, onOpenAttachment }: { reports: Report[]; onOpenAttachment: (preview: AttachmentPreview) => void }) {
  return <div className="panel reports-panel"><div className="table-scroll"><table><thead><tr><th>LOKASI & ID</th><th>KONDISI</th><th>KANTONG</th><th>PELAPOR</th><th>BUKTI</th><th>STATUS</th></tr></thead><tbody>
    {reports.map((report) => <tr key={report.id}><td><strong>{report.building}</strong><small>{report.id} · {report.time}</small></td><td><ConditionBadge condition={report.condition} /></td><td>{report.bags} kantong</td><td>{report.reporter}</td><td><button type="button" className="file-link" onClick={() => onOpenAttachment({ url: report.attachment, title: `Bukti laporan · ${report.building}` })}><FileText size={14} />Buka bukti</button></td><td><StatusBadge status={report.status} /></td></tr>)}
  </tbody></table>{reports.length === 0 && <div className="empty-state"><Search size={22} /><strong>Belum ada laporan</strong><span>Laporan baru dari petugas akan muncul di sini.</span></div>}</div></div>
}

function AssignmentsPage({ user, assignments, onCreate, onStart, onProof }: { user: User; assignments: ApiAssignment[]; onCreate: () => void; onStart: (id: string) => void; onProof: (id: string) => void }) {
  const tasks = user.role === 'sopir_bentor' ? assignments.filter((item) => ['Ditugaskan', 'Dalam Proses'].includes(item.status_tugas)) : assignments
  return <section className="assignment-list">
    <div className="section-intro"><span className="intro-icon"><Truck size={19} /></span><span>{user.role === 'sopir_bentor' ? 'Tinjau titik penjemputan, mulai perjalanan, lalu kirim foto bukti pembuangan akhir dengan GPS.' : 'Penugasan menghubungkan laporan dari petugas gedung dengan armada dan sopir.'}</span></div>
    {tasks.map((assignment) => <article className="panel assignment-card" key={assignment.id_penugasan}><div className="assignment-top"><span className="assignment-id">{assignment.id_penugasan}</span><span className={`assignment-status assignment-${assignment.status_tugas === 'Dalam Proses' ? 'blue' : assignment.status_tugas === 'Terverifikasi' ? 'green' : 'amber'}`}><i />{assignment.status_tugas}</span></div>
      <h2>{assignment.detail_penugasan.map((detail) => detail.laporan.gedung.nama_gedung).join(' · ')}</h2><div className="assignment-meta"><span><Users size={15} /> {assignment.sopir.nama_lengkap}</span><span><Bike size={15} /> {assignment.bentor.plat_nomor}</span><span><PackageCheck size={15} /> {assignment.total_rencana_kantong} kantong</span></div>
      <div className="assignment-progress"><div><span>{assignment.detail_penugasan.length} titik pengangkutan</span><strong>{assignment.detail_penugasan.filter((detail) => detail.status_singgah === 'Selesai').length} / {assignment.detail_penugasan.length} selesai</strong></div><i><b className={`progress-${assignment.status_tugas === 'Selesai' || assignment.status_tugas === 'Terverifikasi' ? 'green' : assignment.status_tugas === 'Dalam Proses' ? 'blue' : 'amber'}`} style={{ width: `${assignment.status_tugas === 'Selesai' || assignment.status_tugas === 'Terverifikasi' ? 100 : assignment.status_tugas === 'Dalam Proses' ? 55 : 10}%` }} /></i></div>
      <div className="assignment-stops">{assignment.detail_penugasan.map((detail, index) => <div key={detail.id_detail}><span>{index + 1}</span><strong>{detail.laporan.gedung.nama_gedung}</strong><small>{detail.laporan.jumlah_kantong} kantong · {detail.status_singgah}</small></div>)}</div>
      {user.role === 'sopir_bentor' && <div className="assignment-bottom">{assignment.status_tugas === 'Ditugaskan' && <button className="primary-button" onClick={() => onStart(assignment.id_penugasan)}><Truck size={15} /> Mulai perjalanan</button>}{assignment.status_tugas === 'Dalam Proses' && <button className="primary-button" onClick={() => onProof(assignment.id_penugasan)}><FileCheck2 size={15} /> Kirim bukti pembuangan</button>}</div>}
    </article>)}
    {tasks.length === 0 && <div className="panel empty-state"><Truck size={22} /><strong>{user.role === 'sopir_bentor' ? 'Belum ada tugas aktif' : 'Belum ada penugasan'}</strong><span>{user.role === 'admin' ? 'Buat penugasan baru untuk laporan yang menunggu.' : 'Tugas pengangkutan baru akan muncul di sini.'}</span>{user.role === 'admin' && <button className="primary-button" onClick={onCreate}><Plus size={15} /> Buat penugasan</button>}</div>}
  </section>
}

function FleetPage({ vehicles }: { vehicles: Vehicle[] }) {
  return <div className="fleet-grid">{vehicles.map((vehicle) => <article className="panel fleet-card" key={vehicle.id_bentor}><div className="fleet-card-head"><span className={`fleet-illustration fleet-${vehicle.status_operasional === 'tersedia' ? 'green' : 'blue'}`}><Bike size={28} /></span><span className={`assignment-status assignment-${vehicle.status_operasional === 'tersedia' ? 'green' : 'blue'}`}><i />{vehicle.status_operasional}</span></div><div className="fleet-id">{vehicle.id_bentor}</div><h2>{vehicle.plat_nomor}</h2><div className="fleet-spec"><span>Kapasitas maksimal</span><strong>{vehicle.kapasitas_maks_kantong} kantong</strong></div></article>)}{vehicles.length === 0 && <div className="panel empty-state"><Bike size={22} /><strong>Belum ada data armada</strong><span>Tambahkan armada di basis data SIPES.</span></div>}</div>
}

function MapPage({ buildings }: { buildings: MapBuilding[] }) {
  if (buildings.length === 0) return <div className="panel empty-state"><Map size={22} /><strong>Data lokasi belum tersedia</strong><span>Jalankan inisialisasi basis data untuk memuat lokasi kampus.</span></div>
  return <><div className="map-summary"><div><span className="stat-icon stat-green"><MapPin size={17} /></span><span><strong>{buildings.length} titik gedung</strong><small>Koordinat TPS Universitas Andalas</small></span></div><div><i className="map-status-dot" /> Lokasi dari database</div></div><MapPanel buildings={buildings} /><p className="map-data-note">Peta menggunakan OpenStreetMap. Data titik lokasi berasal dari koordinat gedung dalam basis data SIPES. Membuka tiles peta memerlukan koneksi internet.</p></>
}

function HistoryPage({ user, disposals, reports, onVerify, onOpenAttachment }: { user: User; disposals: Disposal[]; reports: Report[]; onVerify: (id: string) => void; onOpenAttachment: (preview: AttachmentPreview) => void }) {
  return <>
    <section className="history-callout"><span><ShieldCheck size={20} /></span><div><strong>Setiap pembuangan memiliki jejak yang dapat ditelusuri.</strong><p>Dokumentasi foto dan titik GPS membantu memverifikasi lokasi tujuan pembuangan.</p></div></section>
    <section className="panel page-table-panel"><div className="table-toolbar"><div><h2>Bukti pembuangan akhir</h2><p>Foto, koordinat, jumlah kantong, dan status verifikasi.</p></div></div>
      <div className="history-timeline">{disposals.map((disposal) => <article className="history-entry" key={disposal.id_log_buang}><span className="timeline-mark"><Check size={15} /></span><span className="history-entry-copy"><strong>{disposal.nama_lokasi_tpa}</strong><small>{disposal.penugasan.id_penugasan} · {disposal.jumlah_kantong_dibuang} kantong · GPS {disposal.koordinat_lat_tpa.toFixed(5)}, {disposal.koordinat_long_tpa.toFixed(5)}</small></span><button type="button" className="file-link" onClick={() => onOpenAttachment({ url: disposal.url_foto_bukti_tpa, title: `Bukti pembuangan · ${disposal.nama_lokasi_tpa}` })}><FileText size={14} />Foto</button><StatusBadge status={disposal.status_verifikasi === 'Terverifikasi' ? 'Selesai' : 'Ditugaskan'} />{user.role === 'admin' && disposal.status_verifikasi === 'Menunggu Verifikasi' && <button className="table-action-button" onClick={() => onVerify(disposal.id_log_buang)}>Verifikasi</button>}</article>)}
        {disposals.length === 0 && <div className="empty-state"><ShieldCheck size={22} /><strong>Belum ada bukti pembuangan</strong><span>Bukti foto dari sopir akan muncul setelah tugas diselesaikan.</span></div>}</div>
    </section>
    {reports.length > 0 && <><div className="home-section-heading"><div><h2>Laporan selesai</h2><p>Lokasi penjemputan yang sudah ditangani.</p></div></div><ReportsTable reports={reports} onOpenAttachment={onOpenAttachment} /></>}
  </>
}

function ReportModal({ buildings, photo, onPhotoChange, error, onClose, onSubmit }: { buildings: Building[]; photo: File | null; onPhotoChange: (photo: File | null) => void; error: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <ModalShell title="Buat laporan sampah" description="Catat kondisi TPS dan ambil foto bukti menggunakan kamera." icon={FilePlus2} onClose={onClose}><form onSubmit={onSubmit}>
    {error && <div className="login-error" role="alert">{error}</div>}
    <label>Lokasi gedung<select name="id_gedung" required defaultValue=""><option value="" disabled>Pilih gedung</option>{buildings.map((building) => <option key={building.id_gedung} value={building.id_gedung}>{building.nama_gedung}</option>)}</select></label>
    <div className="form-row"><label>Jumlah kantong<input name="jumlah_kantong" type="number" min="1" max="500" placeholder="Contoh: 12" required /></label><label>Kondisi sampah<select name="kondisi_sampah" defaultValue="Hampir Penuh"><option>Normal</option><option>Hampir Penuh</option><option>Penuh</option><option>Mendesak</option></select></label></div>
    <label>Catatan<textarea name="catatan" placeholder="Catatan untuk sopir atau pengelola (opsional)" rows={3} /></label>
    <CameraCapture label="Foto kondisi sampah" photo={photo} onPhotoChange={onPhotoChange} />
    <small className="field-help">Foto diambil langsung dengan kamera. Format JPG, maksimal 8 MB.</small>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Batal</button><button type="submit" className="primary-button" disabled={!photo}><FileCheck2 size={16} /> Simpan laporan</button></div>
  </form></ModalShell>
}

function AssignmentModal({ reports, vehicles, error, onClose, onSubmit }: { reports: Report[]; vehicles: Vehicle[]; error: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [drivers, setDrivers] = useState<User[]>([])
  const [loadError, setLoadError] = useState('')
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([])
  const token = localStorage.getItem('sipes-token') || ''
  useEffect(() => {
    let active = true
    apiRequest<{ drivers: User[] }>('/api/sopir', token).then((result) => {
      if (active) setDrivers(result.drivers)
    }).catch((cause: Error) => {
      if (active) setLoadError(cause.message)
    })
    return () => { active = false }
  }, [token])
  return <ModalShell title="Buat penugasan" description="Pilih sopir, armada tersedia, dan laporan yang dijemput." icon={Truck} onClose={onClose}><form onSubmit={onSubmit}>
    {(loadError || error) && <div className="login-error" role="alert">{error || loadError}</div>}
    <label>Sopir<select name="driver" required defaultValue=""><option value="" disabled>Pilih sopir bentor</option>{drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select></label>
    <label>Armada<select name="vehicle" required defaultValue=""><option value="" disabled>Pilih armada tersedia</option>{vehicles.map((vehicle) => <option key={vehicle.id_bentor} value={vehicle.id_bentor}>{vehicle.plat_nomor} · kapasitas {vehicle.kapasitas_maks_kantong}</option>)}</select></label>
    <fieldset className="report-checkbox-list"><legend>Pilih laporan yang akan dijemput</legend>{reports.map((report) => <label key={report.id}><input type="checkbox" name="reports" value={report.id} checked={selectedReportIds.includes(report.id)} onChange={(event) => {
      const checked = event.currentTarget.checked
      setSelectedReportIds((current) => checked ? [...current, report.id] : current.filter((id) => id !== report.id))
    }} /><span><strong>{report.building}</strong><small>{report.id} · {report.bags} kantong · {report.condition}</small></span></label>)}{reports.length === 0 && <p>Tidak ada laporan yang menunggu penugasan.</p>}</fieldset>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Batal</button><button type="submit" className="primary-button" disabled={!selectedReportIds.length || !vehicles.length || !drivers.length}><Truck size={16} /> Terbitkan penugasan</button></div>
  </form></ModalShell>
}

function ProofModal({ photo, onPhotoChange, error, onClose, onSubmit }: { photo: File | null; onPhotoChange: (photo: File | null) => void; error: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <ModalShell title="Bukti pembuangan akhir" description="Ambil foto menggunakan kamera dan izinkan akses GPS untuk verifikasi." icon={FileCheck2} onClose={onClose}><form onSubmit={onSubmit}>
    {error && <div className="login-error" role="alert">{error}</div>}
    <label>Jumlah kantong yang dibuang<input name="jumlah_kantong" type="number" min="1" max="10000" placeholder="Jumlah aktual" required /></label>
    <label>Lokasi pembuangan<input name="nama_lokasi_tpa" defaultValue="TPA / Fasilitas Pengomposan Kampus Unand" required /></label>
    <CameraCapture label="Foto bukti di lokasi pembuangan" photo={photo} onPhotoChange={onPhotoChange} />
    <small className="field-help">Foto diambil langsung dengan kamera dalam format JPG, maksimal 8 MB. Koordinat GPS direkam saat dikirim.</small>
    <div className="gps-notice"><MapPin size={16} /><span>Peramban akan meminta izin lokasi GPS saat Anda mengirim bukti.</span></div>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Batal</button><button type="submit" className="primary-button" disabled={!photo}><ShieldCheck size={16} /> Kirim bukti</button></div>
  </form></ModalShell>
}

function CameraCapture({ label, photo, onPhotoChange }: { label: string; photo: File | null; onPhotoChange: (photo: File | null) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const requestIdRef = useRef(0)
  const [cameraError, setCameraError] = useState('')
  const [cameraLoading, setCameraLoading] = useState(true)
  const [previewUrl, setPreviewUrl] = useState('')

  const stopCamera = useCallback(() => {
    requestIdRef.current += 1
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const startCamera = useCallback(async () => {
    const requestId = ++requestIdRef.current
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Kamera tidak tersedia. Buka aplikasi melalui localhost atau HTTPS.')
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      if (requestId !== requestIdRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraLoading(false)
    } catch (cause) {
      if (requestId !== requestIdRef.current) return
      stopCamera()
      setCameraLoading(false)
      const errorName = cause instanceof DOMException ? cause.name : ''
      const message = errorName === 'NotAllowedError'
        ? 'Izin kamera ditolak. Izinkan akses kamera di pengaturan peramban, lalu coba lagi.'
        : errorName === 'NotFoundError'
          ? 'Kamera tidak ditemukan pada perangkat ini.'
          : errorName === 'NotReadableError'
            ? 'Kamera sedang digunakan aplikasi lain. Tutup aplikasi tersebut lalu coba lagi.'
            : cause instanceof Error
              ? cause.message
              : 'Kamera gagal dibuka. Periksa izin kamera lalu coba lagi.'
      setCameraError(message)
    }
  }, [stopCamera])

  useEffect(() => {
    const startupTimer = window.setTimeout(() => { void startCamera() }, 0)
    return () => {
      window.clearTimeout(startupTimer)
      stopCamera()
    }
  }, [startCamera, stopCamera])

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  function capturePhoto() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      setCameraError('Kamera belum siap. Tunggu sebentar lalu coba lagi.')
      return
    }
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) {
      setCameraError('Foto tidak dapat diproses oleh peramban ini.')
      return
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const requestId = requestIdRef.current
    canvas.toBlob((blob) => {
      if (requestId !== requestIdRef.current) return
      if (!blob) {
        setCameraError('Foto gagal diambil. Coba gunakan kamera lagi.')
        return
      }
      const capturedPhoto = new File([blob], `bukti-${Date.now()}.jpg`, { type: 'image/jpeg' })
      setPreviewUrl(URL.createObjectURL(capturedPhoto))
      onPhotoChange(capturedPhoto)
      setCameraError('')
      stopCamera()
    }, 'image/jpeg', 0.9)
  }

  function retakePhoto() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl('')
    onPhotoChange(null)
    setCameraLoading(true)
    setCameraError('')
    void startCamera()
  }

  function retryCamera() {
    setCameraLoading(true)
    setCameraError('')
    void startCamera()
  }

  return <div className="camera-capture">
    <strong>{label}</strong>
    <div className="camera-preview">
      {photo && previewUrl
        ? <img src={previewUrl} alt="Pratinjau foto bukti yang diambil" />
        : <video ref={videoRef} autoPlay playsInline muted aria-label="Pratinjau kamera" />}
    </div>
    {cameraError && <p className="camera-error" role="alert">{cameraError}</p>}
    <div className="camera-actions">
      {photo
        ? <button type="button" className="secondary-button" onClick={retakePhoto}><Camera size={15} /> Ambil ulang foto</button>
        : <>
          <button type="button" className="primary-button" onClick={capturePhoto} disabled={cameraLoading || Boolean(cameraError)}><Camera size={15} />{cameraLoading ? 'Membuka kamera...' : 'Ambil foto'}</button>
          {cameraError && <button type="button" className="secondary-button" onClick={retryCamera}>Coba lagi</button>}
        </>}
    </div>
    <canvas ref={canvasRef} className="camera-canvas" />
  </div>
}

function AttachmentPreviewModal({ preview, onClose }: { preview: AttachmentPreview; onClose: () => void }) {
  const isPdf = /\.pdf(?:$|[?#])/i.test(preview.url)
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return <div className="attachment-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="attachment-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="attachment-preview-title">
      <header className="attachment-preview-header">
        <div><span className="modal-icon"><FileText size={20} /></span><h2 id="attachment-preview-title">{preview.title}</h2></div>
        <button type="button" className="icon-button" aria-label="Tutup pratinjau" onClick={onClose}><X size={18} /></button>
      </header>
      <div className="attachment-preview-content">
        {isPdf
          ? <iframe title={preview.title} src={preview.url} />
          : imageFailed
            ? <p className="attachment-preview-error" role="alert">Gambar bukti tidak dapat dimuat. Periksa koneksi server lalu coba lagi.</p>
            : <img src={preview.url} alt={preview.title} onError={() => setImageFailed(true)} />}
      </div>
      <footer className="attachment-preview-footer">
        <button type="button" className="secondary-button" onClick={onClose}><ArrowLeft size={15} /> Kembali ke halaman sebelumnya</button>
      </footer>
    </section>
  </div>
}

function ModalShell({ title, description, icon: Icon, onClose, children }: { title: string; description: string; icon: LucideIcon; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><div><span className="modal-icon"><Icon size={20} /></span><div><h2 id="modal-title">{title}</h2><p>{description}</p></div></div><button className="icon-button" aria-label="Tutup modal" onClick={onClose}><X size={18} /></button></div>{children}</section></div>
}

function ConditionBadge({ condition }: { condition: Condition }) {
  const className = condition === 'Mendesak' ? 'condition-urgent' : condition === 'Penuh' ? 'condition-full' : condition === 'Hampir penuh' ? 'condition-near' : 'condition-normal'
  return <span className={`condition-badge ${className}`}><i />{condition}</span>
}

function StatusBadge({ status }: { status: ReportStatus }) {
  const className = status === 'Selesai' ? 'status-done' : status === 'Ditugaskan' ? 'status-assigned' : 'status-waiting'
  return <span className={`status-badge ${className}`}><i />{status}</span>
}

export default App
