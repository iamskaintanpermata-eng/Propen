import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import { divIcon } from 'leaflet'

export type MapBuilding = {
  id_gedung: string
  nama_gedung: string
  fakultas: string
  koordinat_lat: number
  koordinat_long: number
  kapasitas_tps: number
  laporan_sampah?: { jumlah_kantong: number; kondisi_sampah: string; status_laporan: string }[]
}

const campusCenter: [number, number] = [-0.91542, 100.45785]

function markerIcon(condition?: string) {
  const urgency = condition === 'Mendesak' || condition === 'Penuh' ? 'urgent' : condition === 'Hampir Penuh' ? 'warning' : ''
  return divIcon({
    className: 'map-marker-wrapper',
    html: `<span class="map-marker ${urgency}"><span></span></span>`,
    iconSize: [28, 34],
    iconAnchor: [14, 31],
    popupAnchor: [0, -29],
  })
}

export default function MapPanel({ buildings }: { buildings: MapBuilding[] }) {
  return (
    <div className="map-panel">
      <div className="map-attribution-note"><span /> Peta kampus <strong>Limau Manis</strong></div>
      <MapContainer center={campusCenter} zoom={16} scrollWheelZoom className="campus-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {buildings.map((building) => {
          const latest = building.laporan_sampah?.[0]
          const bags = latest?.jumlah_kantong ?? 0
          return (
            <Marker
              key={building.id_gedung}
              position={[building.koordinat_lat, building.koordinat_long]}
              icon={markerIcon(latest?.kondisi_sampah)}
            >
              <Popup>
                <div className="map-popup">
                  <strong>{building.nama_gedung}</strong>
                  <span>{building.fakultas}</span>
                  <span>TPS: {bags} / {building.kapasitas_tps} kantong</span>
                  <span>Kondisi: {latest?.kondisi_sampah || 'Belum ada laporan'}</span>
                  <a href={`https://www.openstreetmap.org/?mlat=${building.koordinat_lat}&mlon=${building.koordinat_long}#map=18/${building.koordinat_lat}/${building.koordinat_long}`} target="_blank" rel="noreferrer">Buka rute peta</a>
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>
      <div className="map-legend"><span><i className="legend-green" /> Kondisi normal</span><span><i className="legend-yellow" /> Perlu perhatian</span><span><i className="legend-red" /> Mendesak</span></div>
    </div>
  )
}
