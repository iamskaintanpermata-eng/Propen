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
  UserRound,
  X,
} from 'lucide-react'
import type { ApiAssignment, ApiReport, Building, OfficialDisposal, User, UserRole } from './api'
import { apiRequest } from './api'
import MapPanel from './MapPanel'
import type { MapBuilding } from './MapPanel'
import 'leaflet/dist/leaflet.css'
import './App.css'

type Page = 'Ringkasan' | 'Laporan sampah' | 'Penugasan' | 'Armada' | 'Peta kampus' | 'Riwayat' | 'Pengguna' | 'Profil saya' | 'Pusat bantuan'
type ReportStatus = 'Menunggu Akumulasi' | 'Masuk Penugasan' | 'Dijemput' | 'Selesai'
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
  attachment: string | null
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
type ManagedUser = User & { createdAt: string }

const todayLabel = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
const allPages: { label: Page; icon: LucideIcon; roles: UserRole[] }[] = [
  { label: 'Ringkasan', icon: LayoutDashboard, roles: ['admin', 'petugas_gedung', 'sopir_bentor'] },
  { label: 'Laporan sampah', icon: FileText, roles: ['admin', 'petugas_gedung'] },
  { label: 'Penugasan', icon: Truck, roles: ['admin', 'sopir_bentor'] },
  { label: 'Armada', icon: Bike, roles: ['admin'] },
  { label: 'Pengguna', icon: Users, roles: ['admin'] },
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
    status: report.status_laporan === 'Menunggu Penugasan'
      ? 'Menunggu Akumulasi'
      : report.status_laporan === 'Ditugaskan'
        ? 'Masuk Penugasan'
        : report.status_laporan as ReportStatus,
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
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([])
  const [disposals, setDisposals] = useState<Disposal[]>([])
  const [officialDisposal, setOfficialDisposal] = useState<OfficialDisposal | null>(null)
  const [stats, setStats] = useState<DashboardStats>({ totalReports: 0, waiting: 0, assigned: 0, completed: 0, activeTasks: 0, verifiedDisposals: 0 })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Semua status')
  const [modal, setModal] = useState<'report' | 'collection' | 'proof' | null>(null)
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreview | null>(null)
  const [proofAssignment, setProofAssignment] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [modalError, setModalError] = useState('')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [reportPhoto, setReportPhoto] = useState<File | null>(null)
  const [proofPhoto, setProofPhoto] = useState<File | null>(null)
  const [collectionPhoto, setCollectionPhoto] = useState<File | null>(null)
  const [collectionDetail, setCollectionDetail] = useState<{ assignmentId: string; detailId: string; building: string } | null>(null)
  const [driverPosition, setDriverPosition] = useState<{ latitude: number; longitude: number } | null>(null)
  const locationSentAt = useRef(0)

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
    const optionalFleetRequest = user.role === 'admin'
      ? apiRequest<{ vehicles: Vehicle[] }>('/api/armada', token)
      : Promise.resolve({ vehicles: [] as Vehicle[] })
    const optionalUsersRequest = user.role === 'admin'
      ? apiRequest<{ users: ManagedUser[] }>('/api/admin/users', token)
      : Promise.resolve({ users: [] as ManagedUser[] })
    Promise.all([
      apiRequest<{ totalReports: number; waiting: number; assigned: number; completed: number; activeTasks: number; verifiedDisposals: number }>('/api/dashboard', token),
      apiRequest<{ reports: ApiReport[] }>('/api/laporan', token),
      apiRequest<{ buildings: Building[] }>('/api/gedung', token),
      apiRequest<{ assignments: ApiAssignment[] }>('/api/penugasan', token),
      apiRequest<{ disposals: Disposal[] }>('/api/riwayat', token),
      apiRequest<{ officialDisposal: OfficialDisposal | null }>('/api/config', token),
      optionalFleetRequest,
      optionalUsersRequest,
    ]).then(([dashboard, reportResult, buildingResult, assignmentResult, historyResult, configResult, fleetResult, userResult]) => {
      if (!active) return
      setStats(dashboard)
      setReports(reportResult.reports.map(displayReport))
      setBuildings(buildingResult.buildings)
      setAssignments(assignmentResult.assignments)
      setDisposals(historyResult.disposals)
      setOfficialDisposal(configResult.officialDisposal)
      setVehicles(fleetResult.vehicles)
      setManagedUsers(userResult.users)
    }).catch((cause: Error) => {
      if (active) setError(cause.message)
    })
    return () => { active = false }
  }, [token, user, refreshKey])

  const activeDriverAssignment = user?.role === 'sopir_bentor'
    ? assignments.find((assignment) => assignment.sopir?.id_pengguna === user.id
      && ['Dalam Perjalanan', 'Penjemputan', 'Menuju Pembuangan'].includes(assignment.status_tugas))
    : undefined
  const activeDriverAssignmentId = activeDriverAssignment?.id_penugasan

  useEffect(() => {
    if (!token || !activeDriverAssignmentId || !navigator.geolocation) return
    const assignmentId = activeDriverAssignmentId
    const watchId = navigator.geolocation.watchPosition((position) => {
      setDriverPosition({ latitude: position.coords.latitude, longitude: position.coords.longitude })
      const now = Date.now()
      if (now - locationSentAt.current < 30000) return
      locationSentAt.current = now
      apiRequest(`/api/penugasan/${encodeURIComponent(assignmentId)}/lokasi`, token, {
        method: 'PATCH',
        body: JSON.stringify({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      }).catch((cause: Error) => setError(cause.message))
    }, (cause) => {
      setError(cause.code === cause.PERMISSION_DENIED
        ? 'Izinkan akses lokasi agar admin dapat memantau posisi bentor.'
        : 'Posisi GPS sopir tidak dapat diperbarui.')
    }, { enableHighAccuracy: true, maximumAge: 10000 });
    return () => navigator.geolocation.clearWatch(watchId)
  }, [token, activeDriverAssignmentId])

  useEffect(() => {
    if (user?.role !== 'admin' || activePage !== 'Penugasan') return
    const intervalId = window.setInterval(() => setRefreshKey((current) => current + 1), 20000)
    return () => window.clearInterval(intervalId)
  }, [user?.role, activePage])

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
    setOfficialDisposal(null)
    setDriverPosition(null)
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
    try {
      const form = new FormData(event.currentTarget)
      if (reportPhoto) form.set('lampiran', reportPhoto)
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

  async function claimAssignment(assignmentId: string) {
    if (!token) return
    try {
      await apiRequest(`/api/penugasan/${encodeURIComponent(assignmentId)}/ambil`, token, { method: 'PATCH' })
      notify('Penugasan berhasil diambil. Periksa titik jemput sebelum menjalankannya.')
      refresh()
    } catch (cause) {
      setError((cause as Error).message)
    }
  }

  async function startAssignment(assignmentId: string) {
    if (!token) return
    try {
      await apiRequest(`/api/penugasan/${encodeURIComponent(assignmentId)}/status`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'Dalam Perjalanan' }),
      })
      notify('Perjalanan dimulai. Posisi GPS dapat dibagikan kepada admin.')
      refresh()
    } catch (cause) {
      setError((cause as Error).message)
    }
  }

  async function submitCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || !collectionDetail) return
    if (!collectionPhoto) {
      setModalError('Ambil foto bukti pengambilan sebelum mengonfirmasi.')
      return
    }
    try {
      const form = new FormData(event.currentTarget)
      form.set('foto', collectionPhoto)
      await apiRequest(
        `/api/penugasan/${encodeURIComponent(collectionDetail.assignmentId)}/penjemputan/${encodeURIComponent(collectionDetail.detailId)}`,
        token,
        { method: 'POST', body: form },
      )
      setModal(null)
      setCollectionPhoto(null)
      setCollectionDetail(null)
      setModalError('')
      notify('Pengambilan sampah berhasil dikonfirmasi.')
      refresh()
    } catch (cause) {
      setModalError((cause as Error).message)
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

  async function saveProfile(details: { name: string; phone: string; currentPassword: string; newPassword: string }) {
    if (!token) return
    try {
      const { user: updatedUser } = await apiRequest<{ user: User }>('/api/auth/profile', token, {
        method: 'PATCH',
        body: JSON.stringify(details),
      })
      setUser(updatedUser)
      notify('Profil berhasil diperbarui.')
    } catch (cause) {
      setError((cause as Error).message)
    }
  }

  async function updateUserAccess(id: string, role: UserRole, status: 'aktif' | 'ditolak') {
    if (!token) return
    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(id)}/access`, token, {
        method: 'PATCH',
        body: JSON.stringify({ role, status }),
      })
      notify(status === 'aktif' ? 'Pendaftaran pengguna disetujui.' : 'Pendaftaran pengguna ditolak.')
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
          <span className="brand-mark"><img className="brand-logo" src="/unand-logo.png" alt="Logo Universitas Andalas" /></span>
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
        <button className={`nav-item ${activePage === 'Profil saya' ? 'nav-active' : ''}`} onClick={() => { setActivePage('Profil saya'); setMobileNavOpen(false) }}><UserRound size={18} /><span>Profil saya</span></button>
        <button className={`nav-item ${activePage === 'Pusat bantuan' ? 'nav-active' : ''}`} onClick={() => { setActivePage('Pusat bantuan'); setMobileNavOpen(false) }}><CircleHelp size={18} /><span>Pusat bantuan</span></button>
        <div className="sidebar-bottom">
          <button className="profile" onClick={() => setActivePage('Profil saya')}><span className="avatar">{user.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><span className="profile-copy"><strong>{user.name}</strong><small>{roleName}</small></span></button>
          <button className="nav-item signout-button" onClick={signOut}><LogOut size={17} /><span>Keluar</span></button>
        </div>
      </aside>
      {mobileNavOpen && <button className="sidebar-scrim" aria-label="Tutup navigasi" onClick={() => setMobileNavOpen(false)} />}

      <main className="main-panel">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Buka navigasi" onClick={() => setMobileNavOpen(true)}><Menu size={21} /></button>
          <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{activePage}</strong></div>
          <div className="topbar-actions"><span className="campus-status"><span /> Sistem terhubung</span><button className="top-profile" onClick={() => setActivePage('Profil saya')}><span className="avatar avatar-small">{user.name.slice(0, 1).toUpperCase()}</span><span>{user.name}</span><UserRound size={15} /></button></div>
        </header>
        <div className="page-content">
          <section className={`page-heading ${activePage === 'Ringkasan' ? 'page-heading-dashboard' : ''}`}>
            <div><div className="eyebrow"><span className="eyebrow-line" /> SIPES UNAND <span className="eyebrow-dot">/</span> {roleName.toUpperCase()}</div>
              <h1>{activePage === 'Ringkasan' ? <>Pengelolaan kampus,<br className="title-break" /> <span>lebih terpantau.</span></> : activePage === 'Peta kampus' ? <>Peta operasional<br /><span>kampus Unand.</span></> : activePage}</h1>
              <p>{activePage === 'Ringkasan' ? `Selamat datang, ${user.name}. ${user.role === 'sopir_bentor' ? 'Lihat dan selesaikan tugas pengangkutan Anda.' : 'Berikut pembaruan operasional kampus.'}` : pageDescription(activePage)}</p>
            </div>
            <div className="heading-actions"><div className="date-chip"><Clock3 size={15} /><span>{todayLabel}</span></div>
              {user.role === 'petugas_gedung' && activePage === 'Laporan sampah' && <button className="primary-button" onClick={() => { setModalError(''); setModal('report') }}><Plus size={17} /> Buat laporan</button>}
            </div>
          </section>

          {error && <div className="error-banner" role="alert"><CircleHelp size={17} /><span>{error}</span><button aria-label="Tutup pesan error" onClick={() => setError('')}><X size={15} /></button></div>}
          {activePage === 'Ringkasan' && <Dashboard user={user} reports={reports} assignments={assignments} stats={stats} onNavigate={setActivePage} onOpenAttachment={(preview) => setAttachmentPreview(preview)} onCreateReport={() => { setModalError(''); setModal('report') }} />}
          {activePage === 'Laporan sampah' && <ReportsPage user={user} reports={filteredReports} search={search} statusFilter={statusFilter} onSearch={setSearch} onStatusFilter={setStatusFilter} onRefresh={refresh} onOpenAttachment={(preview) => setAttachmentPreview(preview)} onCreate={() => { setModalError(''); setModal('report') }} />}
          {activePage === 'Penugasan' && <AssignmentsPage
            user={user}
            assignments={assignments}
            buildings={mapBuildings}
            officialDisposal={officialDisposal}
            driverPosition={driverPosition}
            onClaim={claimAssignment}
            onStart={startAssignment}
            onCollect={(assignmentId, detailId, building) => {
              setCollectionDetail({ assignmentId, detailId, building })
              setCollectionPhoto(null)
              setModalError('')
              setModal('collection')
            }}
            onProof={(id) => { setProofAssignment(id); setProofPhoto(null); setModalError(''); setModal('proof') }}
            onOpenAttachment={(preview) => setAttachmentPreview(preview)}
          />}
          {activePage === 'Armada' && <FleetPage vehicles={vehicles} />}
          {activePage === 'Peta kampus' && <MapPage buildings={mapBuildings} officialDisposal={officialDisposal} />}
          {activePage === 'Riwayat' && <HistoryPage user={user} disposals={disposals} reports={reports.filter((report) => report.status === 'Selesai')} onVerify={verifyDisposal} onOpenAttachment={(preview) => setAttachmentPreview(preview)} />}
          {activePage === 'Pengguna' && user.role === 'admin' && <UsersPage users={managedUsers} currentUserId={user.id} onUpdateAccess={updateUserAccess} />}
          {activePage === 'Profil saya' && <ProfilePage user={user} onSave={saveProfile} />}
          {activePage === 'Pusat bantuan' && <HelpPage />}
          <footer className="page-footer"><span><span className="footer-leaf"><Leaf size={13} /></span> SIPES UNAND <span className="footer-separator">·</span> Mendukung Green Campus</span><span>Terhubung ke database lokal <span className="footer-live-dot" /> <strong>Aktif</strong></span></footer>
        </div>
      </main>

      {notice && <div className="toast"><CheckCircle2 size={18} />{notice}<button aria-label="Tutup" onClick={() => setNotice('')}><X size={15} /></button></div>}
      {modal === 'report' && <ReportModal buildings={buildings} photo={reportPhoto} onPhotoChange={setReportPhoto} error={modalError} onClose={() => { setModal(null); setReportPhoto(null); setModalError('') }} onSubmit={submitReport} />}
      {modal === 'collection' && collectionDetail && <CollectionModal building={collectionDetail.building} photo={collectionPhoto} onPhotoChange={setCollectionPhoto} error={modalError} onClose={() => { setModal(null); setCollectionPhoto(null); setCollectionDetail(null); setModalError('') }} onSubmit={submitCollection} />}
      {modal === 'proof' && <ProofModal photo={proofPhoto} officialDisposal={officialDisposal} onPhotoChange={setProofPhoto} error={modalError} onClose={() => { setModal(null); setProofPhoto(null); setModalError('') }} onSubmit={submitProof} />}
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
    Pengguna: 'Tinjau pendaftaran dan atur hak akses pengguna SIPES.',
    'Profil saya': 'Perbarui informasi pribadi dan kata sandi akun Anda.',
    'Pusat bantuan': 'Panduan singkat dan kontak bantuan SIPES UNAND.',
  }
  return descriptions[page]
}

function LoginPage({ onLogin, initialError }: { onLogin: (token: string, user: User) => void; initialError: string }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<'petugas_gedung' | 'sopir_bentor'>('petugas_gedung')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (mode === 'register') {
        const response = await apiRequest<{ message: string }>('/api/auth/register', undefined, {
          method: 'POST',
          body: JSON.stringify({ username, password, name, phone, role }),
        })
        setSuccess(response.message)
        setMode('login')
        setPassword('')
        return
      }
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
    <section className="login-brand-panel"><div className="login-brand"><span className="brand-mark"><img className="brand-logo" src="/unand-logo.png" alt="Logo Universitas Andalas" /></span><span className="brand-copy"><strong>sipes<span>.</span></strong><small>UNIVERSITAS ANDALAS</small></span></div>
      <div className="login-message"><span className="login-eyebrow"><Leaf size={14} /> GREEN CAMPUS INITIATIVE</span><h1>Kelola sampah.<br /><span>Jaga lingkungan.</span></h1><p>Platform terpadu untuk memantau proses pengumpulan, pengangkutan, hingga pembuangan akhir sampah kampus.</p>
        <div className="login-feature"><span><MapPin size={17} /></span><div><strong>Terpantau secara geografis</strong><small>Titik TPS dan operasional kampus dalam satu peta.</small></div></div>
        <div className="login-feature"><span><ShieldCheck size={17} /></span><div><strong>Tercatat dan terverifikasi</strong><small>Dokumentasi bukti untuk setiap aktivitas pengangkutan.</small></div></div>
      </div><div className="login-campus-caption"><span /> UNIVERSITAS ANDALAS <i>·</i> PADANG, SUMATERA BARAT</div>
    </section>
    <section className="login-form-panel"><div className="login-form-wrap"><div className="login-mobile-brand"><span className="brand-mark"><img className="brand-logo" src="/unand-logo.png" alt="Logo Universitas Andalas" /></span><span className="brand-copy"><strong>sipes<span>.</span></strong><small>UNIVERSITAS ANDALAS</small></span></div>
      <span className="login-form-kicker">{mode === 'login' ? 'SELAMAT DATANG KEMBALI' : 'PENDAFTARAN PENGGUNA'}</span><h2>{mode === 'login' ? 'Masuk ke SIPES' : 'Daftar akun SIPES'}</h2><p className="login-subtitle">{mode === 'login' ? 'Masukkan akun untuk melanjutkan ke ruang kerja Anda.' : 'Pendaftaran akan ditinjau admin sebelum akun dapat digunakan.'}</p>
      {(error || initialError) && <div className="login-error" role="alert">{error || initialError}</div>}
      {success && <div className="login-success" role="status">{success}</div>}
      <form onSubmit={submit} className="login-form">
        {mode === 'register' && <>
          <label>Nama lengkap<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nama sesuai identitas" required maxLength={100} /></label>
          <label>Nomor kontak<input autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Contoh: 081234567890" required maxLength={20} /></label>
        </>}
        <label>Nama pengguna<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Contoh: nama.pengguna" required minLength={3} maxLength={50} /></label>
        {mode === 'register' && <label>Peran yang diajukan<select value={role} onChange={(event) => setRole(event.target.value as 'petugas_gedung' | 'sopir_bentor')}><option value="petugas_gedung">Petugas gedung</option><option value="sopir_bentor">Sopir bentor</option></select></label>}
        <label>Kata sandi<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'login' ? 'Masukkan kata sandi' : 'Minimal 8 karakter'} required minLength={mode === 'register' ? 8 : undefined} /></label>
        <button type="submit" className="primary-button login-submit" disabled={loading}>{loading ? 'Memproses...' : mode === 'login' ? <>Masuk ke akun <ArrowRight size={16} /></> : <>Kirim pendaftaran <ArrowRight size={16} /></>}</button>
      </form>
      <button type="button" className="login-mode-toggle" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setSuccess('') }}>
        {mode === 'login' ? 'Belum punya akun? Daftar di sini' : 'Sudah punya akun? Kembali masuk'}
      </button>
      <figure className="login-campus-art"><img src="/unand-campus-photo.png" alt="Pemandangan kampus Universitas Andalas di Limau Manis" /><figcaption>Universitas Andalas <span>·</span> Limau Manis</figcaption></figure>
      <div className="login-footer">SIPES UNAND <span>·</span> Sistem Informasi Pengelolaan Sampah</div>
    </div></section>
  </main>
}

function UsersPage({ users, currentUserId, onUpdateAccess }: {
  users: ManagedUser[]
  currentUserId: string
  onUpdateAccess: (id: string, role: UserRole, status: 'aktif' | 'ditolak') => void
}) {
  const [selectedRoles, setSelectedRoles] = useState<Record<string, UserRole>>({})
  const pendingUsers = users.filter((item) => item.status === 'menunggu')
  return <section className="account-page">
    <div className="panel account-summary"><span className="stat-icon stat-green"><Users size={19} /></span><div><strong>{pendingUsers.length} pendaftaran menunggu</strong><p>Tinjau peran yang diajukan dan berikan akses yang sesuai sebelum pengguna dapat masuk.</p></div></div>
    <div className="panel page-table-panel">
      <div className="table-toolbar"><div><h2>Pengguna terdaftar</h2><p>{users.length} akun tersimpan dalam SIPES.</p></div></div>
      <div className="table-scroll"><table><thead><tr><th>PENGGUNA</th><th>KONTAK</th><th>PERAN</th><th>STATUS</th><th>PENDAFTARAN</th><th>AKSI ADMIN</th></tr></thead><tbody>
        {users.map((item) => <tr key={item.id}>
          <td><strong>{item.name}</strong><small>@{item.username}</small></td>
          <td>{item.phone}</td>
          <td>{item.role === 'admin' ? 'Administrator' : <select className="user-role-select" aria-label={`Peran ${item.name}`} value={selectedRoles[item.id] || item.role} disabled={item.id === currentUserId} onChange={(event) => setSelectedRoles((roles) => ({ ...roles, [item.id]: event.target.value as UserRole }))}><option value="petugas_gedung">Petugas gedung</option><option value="sopir_bentor">Sopir bentor</option></select>}</td>
          <td><span className={`user-status status-${item.status}`}>{item.status === 'aktif' ? 'Aktif' : item.status === 'menunggu' ? 'Menunggu' : 'Ditolak'}</span></td>
          <td>{new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(item.createdAt))}</td>
          <td>{item.id !== currentUserId && item.role !== 'admin' && item.status !== 'aktif'
            ? <div className="user-review-actions"><button className="table-action-button" onClick={() => onUpdateAccess(item.id, selectedRoles[item.id] || item.role, 'aktif')}>Setujui</button>{item.status === 'menunggu' && <button className="user-reject-button" onClick={() => onUpdateAccess(item.id, selectedRoles[item.id] || item.role, 'ditolak')}>Tolak</button>}</div>
            : <span className="field-help">—</span>}</td>
        </tr>)}
      </tbody></table>
      {users.length === 0 && <div className="empty-state"><Users size={22} /><strong>Belum ada data pengguna</strong><span>Daftar akun akan tampil di sini.</span></div>}</div>
    </div>
  </section>
}

function ProfilePage({ user, onSave }: {
  user: User
  onSave: (details: { name: string; phone: string; currentPassword: string; newPassword: string }) => void
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    onSave({
      name: String(form.get('name') || ''),
      phone: String(form.get('phone') || ''),
      currentPassword: String(form.get('currentPassword') || ''),
      newPassword: String(form.get('newPassword') || ''),
    })
  }
  const roleName = user.role === 'admin' ? 'Administrator' : user.role === 'sopir_bentor' ? 'Sopir bentor' : 'Petugas gedung'
  return <section className="panel profile-settings">
    <div className="profile-settings-heading"><span className="avatar profile-settings-avatar">{user.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><div><h2>{user.name}</h2><p>{roleName} · @{user.username}</p></div></div>
    <form className="settings-form" onSubmit={submit}>
      <label>Nama lengkap<input name="name" defaultValue={user.name} required minLength={2} maxLength={100} /></label>
      <label>Nama pengguna<input value={user.username} disabled /></label>
      <label>Nomor kontak<input name="phone" defaultValue={user.phone} required minLength={6} maxLength={20} /></label>
      <div className="settings-divider"><strong>Ubah kata sandi</strong><span>Kosongkan jika tidak ingin mengganti kata sandi.</span></div>
      <label>Kata sandi saat ini<input name="currentPassword" type="password" autoComplete="current-password" /></label>
      <label>Kata sandi baru<input name="newPassword" type="password" autoComplete="new-password" minLength={8} /></label>
      <button className="primary-button" type="submit"><Check size={16} /> Simpan perubahan</button>
    </form>
  </section>
}

function HelpPage() {
  return <section className="help-center">
    <div className="panel help-intro"><span className="stat-icon stat-green"><CircleHelp size={20} /></span><div><h2>Butuh bantuan?</h2><p>Gunakan panduan berikut untuk memulai. Untuk bantuan akses akun, hubungi administrator SIPES UNAND.</p></div></div>
    <div className="help-card-grid">
      <article className="panel help-card"><span className="intro-icon"><Users size={19} /></span><h3>Akun dan akses</h3><p>Pendaftaran baru harus disetujui admin. Jika akun masih menunggu, Anda belum dapat masuk. Hubungi admin kampus untuk menanyakan statusnya.</p></article>
      <article className="panel help-card"><span className="intro-icon"><FileText size={19} /></span><h3>Laporan sampah</h3><p>Petugas gedung dapat membuat laporan berisi lokasi, jumlah kantong, kondisi sampah, catatan, dan foto bukti.</p></article>
      <article className="panel help-card"><span className="intro-icon"><Truck size={19} /></span><h3>Pengangkutan</h3><p>Sopir mengambil tugas yang tersedia, mencatat bukti penjemputan, lalu mengirim bukti pembuangan dengan GPS aktif.</p></article>
      <article className="panel help-card"><span className="intro-icon"><MapPin size={19} /></span><h3>Peta dan lokasi</h3><p>Izinkan akses lokasi saat menjalankan tugas. Peta satelit dan peta jalan membutuhkan koneksi internet; gunakan pemilih layer di pojok kanan atas peta untuk berganti tampilan.</p></article>
    </div>
    <div className="panel help-contact"><strong>Kontak pengelola</strong><p>Hubungi administrator atau unit kebersihan kampus Universitas Andalas untuk kendala akun dan penggunaan SIPES.</p></div>
  </section>
}

function Dashboard({ user, reports, assignments, stats, onNavigate, onOpenAttachment, onCreateReport }: { user: User; reports: Report[]; assignments: ApiAssignment[]; stats: DashboardStats; onNavigate: (page: Page) => void; onOpenAttachment: (preview: AttachmentPreview) => void; onCreateReport: () => void }) {
  return <>
    <section className="stats-grid">
      <StatCard icon={FileText} label={user.role === 'petugas_gedung' ? 'Laporan saya' : 'Total laporan'} value={stats.totalReports} color="green" caption="tercatat di sistem" />
      <StatCard icon={Clock3} label="Menunggu akumulasi" value={stats.waiting} color="orange" caption="laporan menunggu muatan 80%" />
      <StatCard icon={Truck} label={user.role === 'sopir_bentor' ? 'Tugas aktif saya' : 'Dalam pengangkutan'} value={user.role === 'sopir_bentor' ? assignments.filter((assignment) => assignment.sopir?.id_pengguna === user.id && !['Terverifikasi', 'Menunggu Verifikasi'].includes(assignment.status_tugas)).length : stats.activeTasks} color="blue" caption="penugasan aktif" />
      <StatCard icon={ShieldCheck} label="Selesai ditangani" value={user.role === 'admin' ? stats.verifiedDisposals : stats.completed} color="purple" caption={user.role === 'admin' ? 'pembuangan terverifikasi' : 'laporan selesai'} />
    </section>
    {user.role === 'sopir_bentor' ? <section className="panel driver-home-card"><span className="stat-icon stat-blue"><Truck size={19} /></span><div><h2>Periksa tugas pengangkutan Anda</h2><p>{assignments.filter((assignment) => assignment.status_tugas === 'Menunggu Sopir' || (assignment.sopir?.id_pengguna === user.id && !['Terverifikasi', 'Menunggu Verifikasi'].includes(assignment.status_tugas))).length} tugas tersedia atau aktif.</p></div><button className="primary-button" onClick={() => onNavigate('Penugasan')}>Buka tugas <ArrowRight size={15} /></button></section> : <>
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
  return <section className="panel page-table-panel"><div className="table-toolbar"><div><h2>Semua laporan</h2><p>{user.role === 'petugas_gedung' ? 'Laporan yang Anda catat dari area gedung.' : 'Laporan kondisi sampah dari seluruh area kampus.'}</p></div><div className="table-controls"><label className="search-control"><Search size={16} /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Cari laporan atau lokasi..." /></label><select className="filter-control" value={statusFilter} onChange={(event) => onStatusFilter(event.target.value)}><option>Semua status</option><option>Menunggu Akumulasi</option><option>Masuk Penugasan</option><option>Dijemput</option><option>Selesai</option></select>{user.role === 'petugas_gedung' && <button className="primary-button table-create" onClick={onCreate}><Plus size={16} /> Laporan</button>}</div></div>
    <ReportsTable reports={reports} onOpenAttachment={onOpenAttachment} />
    <div className="table-pagination"><span>Menampilkan <strong>{reports.length}</strong> laporan</span><button onClick={onRefresh}>Muat ulang data</button></div>
  </section>
}

function ReportsTable({ reports, onOpenAttachment }: { reports: Report[]; onOpenAttachment: (preview: AttachmentPreview) => void }) {
  return <div className="panel reports-panel"><div className="table-scroll"><table><thead><tr><th>LOKASI & ID</th><th>KONDISI</th><th>KANTONG</th><th>PELAPOR</th><th>BUKTI</th><th>STATUS</th></tr></thead><tbody>
    {reports.map((report) => <tr key={report.id}><td><strong>{report.building}</strong><small>{report.id} · {report.time}</small></td><td><ConditionBadge condition={report.condition} /></td><td>{report.bags} kantong</td><td>{report.reporter}</td><td>{report.attachment ? <button type="button" className="file-link" onClick={() => onOpenAttachment({ url: report.attachment as string, title: `Bukti laporan · ${report.building}` })}><FileText size={14} />Buka bukti</button> : <span className="field-help">Tidak ada foto</span>}</td><td><StatusBadge status={report.status} /></td></tr>)}
  </tbody></table>{reports.length === 0 && <div className="empty-state"><Search size={22} /><strong>Belum ada laporan</strong><span>Laporan baru dari petugas akan muncul di sini.</span></div>}</div></div>
}

function AssignmentsPage({
  user,
  assignments,
  buildings,
  officialDisposal,
  driverPosition,
  onClaim,
  onStart,
  onCollect,
  onProof,
  onOpenAttachment,
}: {
  user: User
  assignments: ApiAssignment[]
  buildings: MapBuilding[]
  officialDisposal: OfficialDisposal | null
  driverPosition: { latitude: number; longitude: number } | null
  onClaim: (id: string) => void
  onStart: (id: string) => void
  onCollect: (assignmentId: string, detailId: string, building: string) => void
  onProof: (id: string) => void
  onOpenAttachment: (preview: AttachmentPreview) => void
}) {
  const tasks = user.role === 'sopir_bentor'
    ? assignments.filter((item) => item.status_tugas === 'Menunggu Sopir' || item.sopir?.id_pengguna === user.id)
    : assignments
  return <section className="assignment-list">
    <div className="section-intro"><span className="intro-icon"><Truck size={19} /></span><span>{user.role === 'sopir_bentor' ? 'Ambil tugas yang tersedia, kunjungi setiap gedung sesuai urutan, konfirmasi pengambilan, lalu bawa muatan ke PPST UNAND.' : 'Penugasan dibuat otomatis dari laporan yang terkumpul dan ditampilkan untuk pemantauan serta verifikasi.'}</span></div>
    {user.role === 'sopir_bentor' && !officialDisposal && <div className="error-banner" role="status"><CircleHelp size={17} /><span>Koordinat resmi PPST belum dikonfigurasi. Admin perlu mengisi OFFICIAL_DISPOSAL_LATITUDE dan OFFICIAL_DISPOSAL_LONGITUDE sebelum bukti pembuangan dapat dikirim.</span></div>}
    {tasks.map((assignment) => {
      const completedStops = assignment.detail_penugasan.filter((detail) => detail.log_penjemputan).length
      const hasStarted = ['Dalam Perjalanan', 'Penjemputan', 'Menuju Pembuangan', 'Menunggu Verifikasi', 'Terverifikasi'].includes(assignment.status_tugas)
      const complete = ['Menunggu Verifikasi', 'Terverifikasi'].includes(assignment.status_tugas)
      const progress = complete ? 100 : assignment.status_tugas === 'Menuju Pembuangan' ? 85 : hasStarted ? Math.max(25, Math.round(completedStops / assignment.detail_penugasan.length * 75)) : assignment.status_tugas === 'Diambil Sopir' ? 15 : 5
      const assignmentDriverPosition = user.role === 'sopir_bentor' && assignment.sopir?.id_pengguna === user.id
        ? driverPosition
        : assignment.koordinat_lat_sopir !== null && assignment.koordinat_long_sopir !== null
          ? { latitude: assignment.koordinat_lat_sopir, longitude: assignment.koordinat_long_sopir }
          : null
      const routeStops = assignment.detail_penugasan.map((detail) => detail.laporan.gedung)
      const statusColor = assignment.status_tugas === 'Terverifikasi'
        ? 'green'
        : ['Dalam Perjalanan', 'Penjemputan', 'Menuju Pembuangan'].includes(assignment.status_tugas)
          ? 'blue'
          : assignment.status_tugas === 'Menunggu Verifikasi'
            ? 'green'
            : 'amber'
      return <article className="panel assignment-card" key={assignment.id_penugasan}>
        <div className="assignment-top"><span className="assignment-id">{assignment.id_penugasan}</span><span className={`assignment-status assignment-${statusColor}`}><i />{assignment.status_tugas}</span></div>
        <h2>{routeStops.map((building) => building.nama_gedung).join(' · ')}</h2>
        <div className="assignment-meta"><span><Users size={15} /> {assignment.sopir?.nama_lengkap || 'Menunggu sopir'}</span><span><Bike size={15} /> {assignment.bentor.plat_nomor}</span><span><PackageCheck size={15} /> {assignment.total_rencana_kantong} / {assignment.bentor.kapasitas_maks_kantong} kantong</span></div>
        <div className="assignment-progress"><div><span>{assignment.detail_penugasan.length} titik pengangkutan</span><strong>{completedStops} / {assignment.detail_penugasan.length} selesai</strong></div><i><b className={`progress-${statusColor}`} style={{ width: `${progress}%` }} /></i></div>
        <div className="assignment-stops">{assignment.detail_penugasan.map((detail, index) => <div key={detail.id_detail}><span>{index + 1}</span><strong>{detail.laporan.gedung.nama_gedung}</strong><small>{detail.log_penjemputan ? `${detail.log_penjemputan.jumlah_kantong_aktual} kantong · Dijemput` : `${detail.laporan.jumlah_kantong} kantong · ${detail.status_singgah}`}</small>{detail.log_penjemputan && <button type="button" className="file-link" onClick={() => onOpenAttachment({ url: detail.log_penjemputan!.url_foto_jemput, title: `Bukti pengambilan · ${detail.laporan.gedung.nama_gedung}` })}><FileText size={14} />Bukti foto</button>}{user.role === 'sopir_bentor' && assignment.sopir?.id_pengguna === user.id && !detail.log_penjemputan && ['Dalam Perjalanan', 'Penjemputan'].includes(assignment.status_tugas) && <button className="secondary-button" onClick={() => onCollect(assignment.id_penugasan, detail.id_detail, detail.laporan.gedung.nama_gedung)}>Konfirmasi Pengambilan</button>}</div>)}</div>
        <MapPanel buildings={buildings} route={routeStops} officialDisposal={officialDisposal} driverPosition={assignmentDriverPosition} compact />
        {assignment.status_tugas === 'Menunggu Verifikasi' && assignment.log_pembuangan_akhir && <div className="assignment-bottom"><span>Bukti pembuangan menunggu verifikasi admin.</span><button type="button" className="file-link" onClick={() => onOpenAttachment({ url: assignment.log_pembuangan_akhir!.url_foto_bukti_tpa, title: 'Bukti pembuangan resmi' })}><FileText size={14} />Bukti pembuangan</button></div>}
        {user.role === 'sopir_bentor' && <div className="assignment-bottom">
          {assignment.status_tugas === 'Menunggu Sopir' && <button className="primary-button" onClick={() => onClaim(assignment.id_penugasan)}><Check size={15} /> Ambil Penugasan</button>}
          {assignment.sopir?.id_pengguna === user.id && assignment.status_tugas === 'Diambil Sopir' && <button className="primary-button" onClick={() => onStart(assignment.id_penugasan)}><Truck size={15} /> Jalankan Penugasan</button>}
          {assignment.sopir?.id_pengguna === user.id && assignment.status_tugas === 'Menuju Pembuangan' && <button className="primary-button" onClick={() => onProof(assignment.id_penugasan)} disabled={!officialDisposal}><FileCheck2 size={15} /> Selesaikan Penugasan</button>}
        </div>}
      </article>
    })}
    {tasks.length === 0 && <div className="panel empty-state"><Truck size={22} /><strong>{user.role === 'sopir_bentor' ? 'Belum ada tugas tersedia' : 'Belum ada penugasan'}</strong><span>{user.role === 'admin' ? 'Penugasan akan muncul otomatis setelah laporan mencapai ambang akumulasi dan armada tersedia.' : 'Tugas pengangkutan baru akan muncul setelah sampah terakumulasi.'}</span></div>}
  </section>
}

function FleetPage({ vehicles }: { vehicles: Vehicle[] }) {
  return <div className="fleet-grid">{vehicles.map((vehicle) => <article className="panel fleet-card" key={vehicle.id_bentor}><div className="fleet-card-head"><span className={`fleet-illustration fleet-${vehicle.status_operasional === 'tersedia' ? 'green' : 'blue'}`}><Bike size={28} /></span><span className={`assignment-status assignment-${vehicle.status_operasional === 'tersedia' ? 'green' : 'blue'}`}><i />{vehicle.status_operasional}</span></div><div className="fleet-id">{vehicle.id_bentor}</div><h2>{vehicle.plat_nomor}</h2><div className="fleet-spec"><span>Kapasitas maksimal</span><strong>{vehicle.kapasitas_maks_kantong} kantong</strong></div></article>)}{vehicles.length === 0 && <div className="panel empty-state"><Bike size={22} /><strong>Belum ada data armada</strong><span>Tambahkan armada di basis data SIPES.</span></div>}</div>
}

function MapPage({ buildings, officialDisposal }: { buildings: MapBuilding[]; officialDisposal: OfficialDisposal | null }) {
  if (buildings.length === 0) return <div className="panel empty-state"><Map size={22} /><strong>Data lokasi belum tersedia</strong><span>Jalankan inisialisasi basis data untuk memuat lokasi kampus.</span></div>
  return <><div className="map-summary"><div><span className="stat-icon stat-green"><MapPin size={17} /></span><span><strong>{buildings.length} titik gedung</strong><small>Koordinat TPS Universitas Andalas</small></span></div><div><i className="map-status-dot" /> {officialDisposal ? `${officialDisposal.name} terpetakan` : 'Titik PPST belum dikonfigurasi'}</div></div><MapPanel buildings={buildings} officialDisposal={officialDisposal} /><p className="map-data-note">Peta satelit disediakan oleh Esri; peta jalan menggunakan OpenStreetMap. Gunakan pemilih layer di pojok kanan atas untuk berganti tampilan. Titik gedung berasal dari basis data SIPES; titik PPST hanya tampil setelah koordinat resminya dikonfigurasi.</p></>
}

function HistoryPage({ user, disposals, reports, onVerify, onOpenAttachment }: { user: User; disposals: Disposal[]; reports: Report[]; onVerify: (id: string) => void; onOpenAttachment: (preview: AttachmentPreview) => void }) {
  return <>
    <section className="history-callout"><span><ShieldCheck size={20} /></span><div><strong>Setiap pembuangan memiliki jejak yang dapat ditelusuri.</strong><p>Dokumentasi foto dan titik GPS membantu memverifikasi lokasi tujuan pembuangan.</p></div></section>
    <section className="panel page-table-panel"><div className="table-toolbar"><div><h2>Bukti pembuangan akhir</h2><p>Foto, koordinat, jumlah kantong, dan status verifikasi.</p></div></div>
      <div className="history-timeline">{disposals.map((disposal) => <article className="history-entry" key={disposal.id_log_buang}><span className="timeline-mark"><Check size={15} /></span><span className="history-entry-copy"><strong>{disposal.nama_lokasi_tpa}</strong><small>{disposal.penugasan.id_penugasan} · {disposal.jumlah_kantong_dibuang} kantong · GPS {disposal.koordinat_lat_tpa.toFixed(5)}, {disposal.koordinat_long_tpa.toFixed(5)}</small></span><button type="button" className="file-link" onClick={() => onOpenAttachment({ url: disposal.url_foto_bukti_tpa, title: `Bukti pembuangan · ${disposal.nama_lokasi_tpa}` })}><FileText size={14} />Foto</button><StatusBadge status={disposal.status_verifikasi === 'Terverifikasi' ? 'Selesai' : 'Menunggu Verifikasi'} />{user.role === 'admin' && disposal.status_verifikasi === 'Menunggu Verifikasi' && <button className="table-action-button" onClick={() => onVerify(disposal.id_log_buang)}>Verifikasi</button>}</article>)}
        {disposals.length === 0 && <div className="empty-state"><ShieldCheck size={22} /><strong>Belum ada bukti pembuangan</strong><span>Bukti foto dari sopir akan muncul setelah tugas diselesaikan.</span></div>}</div>
    </section>
    {reports.length > 0 && <><div className="home-section-heading"><div><h2>Laporan selesai</h2><p>Lokasi penjemputan yang sudah ditangani.</p></div></div><ReportsTable reports={reports} onOpenAttachment={onOpenAttachment} /></>}
  </>
}

function ReportModal({ buildings, photo, onPhotoChange, error, onClose, onSubmit }: { buildings: Building[]; photo: File | null; onPhotoChange: (photo: File | null) => void; error: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <ModalShell title="Buat laporan sampah" description="Catat jumlah dan kondisi sampah untuk dimasukkan ke akumulasi penjemputan." icon={FilePlus2} onClose={onClose}><form onSubmit={onSubmit}>
    {error && <div className="login-error" role="alert">{error}</div>}
    <label>Lokasi gedung<select name="id_gedung" required defaultValue=""><option value="" disabled>Pilih gedung</option>{buildings.map((building) => <option key={building.id_gedung} value={building.id_gedung}>{building.nama_gedung}</option>)}</select></label>
    <div className="form-row"><label>Jumlah kantong<input name="jumlah_kantong" type="number" min="1" max="500" placeholder="Contoh: 12" required /></label><label>Kondisi sampah<select name="kondisi_sampah" defaultValue="Hampir Penuh"><option>Normal</option><option>Hampir Penuh</option><option>Penuh</option><option>Mendesak</option></select></label></div>
    <label>Catatan<textarea name="catatan" placeholder="Catatan untuk sopir atau pengelola (opsional)" rows={3} /></label>
    <CameraCapture label="Foto kondisi sampah (opsional)" photo={photo} onPhotoChange={onPhotoChange} />
    <small className="field-help">Foto opsional. Jika dilampirkan, format JPG, PNG, WebP, atau PDF maksimal 8 MB.</small>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Batal</button><button type="submit" className="primary-button"><FileCheck2 size={16} /> Kirim ke akumulasi</button></div>
  </form></ModalShell>
}

function CollectionModal({ building, photo, onPhotoChange, error, onClose, onSubmit }: { building: string; photo: File | null; onPhotoChange: (photo: File | null) => void; error: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <ModalShell title="Konfirmasi pengambilan" description={`Catat jumlah aktual dan bukti foto dari ${building}.`} icon={PackageCheck} onClose={onClose}><form onSubmit={onSubmit}>
    {error && <div className="login-error" role="alert">{error}</div>}
    <label>Jumlah kantong yang benar-benar diambil<input name="jumlah_kantong_aktual" type="number" min="0" max="10000" placeholder="Jumlah aktual" required /></label>
    <CameraCapture label="Foto bukti pengambilan" photo={photo} onPhotoChange={onPhotoChange} />
    <small className="field-help">Foto bukti pengambilan wajib dilampirkan. Format JPG, PNG, atau WebP, maksimal 8 MB.</small>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Batal</button><button type="submit" className="primary-button" disabled={!photo}><Check size={16} /> Konfirmasi Pengambilan</button></div>
  </form></ModalShell>
}

function ProofModal({ photo, officialDisposal, onPhotoChange, error, onClose, onSubmit }: { photo: File | null; officialDisposal: OfficialDisposal | null; onPhotoChange: (photo: File | null) => void; error: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <ModalShell title="Selesaikan penugasan" description="Kirim foto bukti di PPST UNAND. GPS harus berada di dalam radius lokasi resmi." icon={FileCheck2} onClose={onClose}><form onSubmit={onSubmit}>
    {error && <div className="login-error" role="alert">{error}</div>}
    <label>Jumlah kantong yang dibuang<input name="jumlah_kantong" type="number" min="0" max="10000" placeholder="Jumlah aktual" required /></label>
    <label>Lokasi resmi<input value={officialDisposal?.name || 'PPST UNAND'} readOnly /></label>
    <CameraCapture label="Foto bukti di lokasi pembuangan" photo={photo} onPhotoChange={onPhotoChange} />
    <small className="field-help">Foto diambil langsung dengan kamera dalam format JPG, maksimal 8 MB. Koordinat GPS direkam saat dikirim.</small>
    <div className="gps-notice"><MapPin size={16} /><span>{officialDisposal ? `GPS harus berada dalam radius ${officialDisposal.radiusMeters} m dari ${officialDisposal.name}. Izinkan akses lokasi saat mengirim.` : 'Koordinat PPST UNAND belum dikonfigurasi; penyelesaian penugasan dikunci.'}</span></div>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Batal</button><button type="submit" className="primary-button" disabled={!photo || !officialDisposal}><ShieldCheck size={16} /> Selesaikan Penugasan</button></div>
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

function StatusBadge({ status }: { status: ReportStatus | 'Menunggu Verifikasi' }) {
  const className = status === 'Selesai' ? 'status-done' : ['Menunggu Akumulasi', 'Menunggu Verifikasi'].includes(status) ? 'status-waiting' : 'status-assigned'
  return <span className={`status-badge ${className}`}><i />{status}</span>
}

export default App
