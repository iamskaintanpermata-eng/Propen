import { useEffect, useMemo, useState } from 'react'
import { Circle, LayersControl, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import type { LatLngExpression } from 'leaflet'
import { divIcon, latLngBounds } from 'leaflet'
import type { OfficialDisposal } from './api'

export type MapBuilding = {
  id_gedung: string
  nama_gedung: string
  fakultas: string
  koordinat_lat: number
  koordinat_long: number
  kapasitas_tps: number
  laporan_sampah?: { jumlah_kantong: number; kondisi_sampah: string; status_laporan: string }[]
}

type Position = { latitude: number; longitude: number }
type RoadRouteResult = { coordinates: [number, number][]; error: string }

const campusCenter: [number, number] = [-0.9135, 100.4612]

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

function destinationIcon() {
  return divIcon({
    className: 'map-marker-wrapper',
    html: '<span class="map-marker map-marker-destination"><span></span></span>',
    iconSize: [30, 36],
    iconAnchor: [15, 33],
    popupAnchor: [0, -30],
  })
}

function driverIcon() {
  return divIcon({
    className: 'map-marker-wrapper',
    html: '<span class="map-marker map-marker-driver"><span></span></span>',
    iconSize: [30, 36],
    iconAnchor: [15, 33],
    popupAnchor: [0, -30],
  })
}

function FitRoute({ positions }: { positions: Position[] }) {
  const map = useMap()
  const key = positions.map((point) => `${point.latitude},${point.longitude}`).join('|')
  useEffect(() => {
    if (!key) return
    const points = key.split('|').map((position) => position.split(',').map(Number))
    const bounds = latLngBounds(points.map(([latitude, longitude]) => [latitude, longitude] as LatLngExpression))
    if (points.length === 1) map.setView([points[0][0], points[0][1]], 16)
    else map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 })
  }, [key, map])
  return null
}

function RoadRoute({ stops, destination, onError }: { stops: Position[]; destination: OfficialDisposal | null; onError: (message: string) => void }) {
  const [result, setResult] = useState<RoadRouteResult>({ coordinates: [], error: '' })
  const coordinates = useMemo(
    () => [...stops, ...(destination ? [{ latitude: destination.latitude, longitude: destination.longitude }] : [])],
    [stops, destination],
  )
  const requestPath = coordinates.map((point) => `${point.longitude},${point.latitude}`).join(';')

  useEffect(() => {
    let active = true
    onError('')
    fetch(`https://router.project-osrm.org/route/v1/driving/${requestPath}?overview=full&geometries=geojson&steps=false`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Layanan rute merespons HTTP ${response.status}.`)
        return response.json() as Promise<{ code: string; routes?: { geometry: { coordinates: [number, number][] } }[] }>
      })
      .then((payload) => {
        const roadCoordinates = payload.routes?.[0]?.geometry.coordinates
        if (payload.code !== 'Ok' || !roadCoordinates?.length) throw new Error('Rute jalan antar titik belum tersedia.')
        if (active) {
          setResult({ coordinates: roadCoordinates.map(([longitude, latitude]) => [latitude, longitude]), error: '' })
          onError('')
        }
      })
      .catch((cause: Error) => {
        if (active) {
          setResult({ coordinates: [], error: cause.message })
          onError(cause.message)
        }
      })
    return () => { active = false }
  }, [requestPath, onError])

  return result.coordinates.length > 0
    ? <Polyline positions={result.coordinates as LatLngExpression[]} pathOptions={{ color: '#13834e', weight: 5, opacity: 0.8 }} />
    : null
}

export default function MapPanel({
  buildings,
  route,
  officialDisposal = null,
  driverPosition = null,
  compact = false,
}: {
  buildings: MapBuilding[]
  route?: MapBuilding[]
  officialDisposal?: OfficialDisposal | null
  driverPosition?: Position | null
  compact?: boolean
}) {
  const [routeError, setRouteError] = useState('')
  const routeStops = route ?? []
  const routePositions = routeStops.map((building) => ({ latitude: building.koordinat_lat, longitude: building.koordinat_long }))
  const routeCoordinates = [...routePositions, ...(officialDisposal ? [{ latitude: officialDisposal.latitude, longitude: officialDisposal.longitude }] : [])]
  const requestPath = routeCoordinates.map((point) => `${point.longitude},${point.latitude}`).join(';')
  const fitPositions = route
    ? [
      ...routePositions,
      ...(officialDisposal ? [{ latitude: officialDisposal.latitude, longitude: officialDisposal.longitude }] : []),
      ...(driverPosition ? [driverPosition] : []),
    ]
    : [
      ...buildings.map((building) => ({ latitude: building.koordinat_lat, longitude: building.koordinat_long })),
      ...(officialDisposal ? [{ latitude: officialDisposal.latitude, longitude: officialDisposal.longitude }] : []),
    ]
  const routeUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${routeCoordinates.map((point) => `${point.latitude},${point.longitude}`).join(';')}`

  return (
    <div className={`map-panel ${compact ? 'map-panel-compact' : ''}`}>
      <div className="map-attribution-note"><span /> Peta kampus <strong>Limau Manis</strong>{routeStops.length > 0 && <a href={routeUrl} target="_blank" rel="noreferrer">Buka rute</a>}</div>
      <MapContainer center={campusCenter} zoom={16} scrollWheelZoom={!compact} className="campus-map">
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Satelit">
            <TileLayer
              attribution='Tiles &copy; <a href="https://www.esri.com/">Esri</a> — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Peta jalan">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
        </LayersControl>
        {buildings.map((building) => {
          const latest = building.laporan_sampah?.[0]
          const bags = latest?.jumlah_kantong ?? 0
          const stopNumber = routeStops.findIndex((stop) => stop.id_gedung === building.id_gedung)
          return (
            <Marker
              key={building.id_gedung}
              position={[building.koordinat_lat, building.koordinat_long]}
              icon={markerIcon(latest?.kondisi_sampah)}
            >
              <Popup>
                <div className="map-popup">
                  <strong>{stopNumber >= 0 ? `${stopNumber + 1}. ` : ''}{building.nama_gedung}</strong>
                  <span>{building.fakultas}</span>
                  <span>TPS: {bags} / {building.kapasitas_tps} kantong</span>
                  <span>Kondisi: {latest?.kondisi_sampah || 'Belum ada laporan'}</span>
                </div>
              </Popup>
            </Marker>
          )
        })}
        {officialDisposal && <>
          <Marker position={[officialDisposal.latitude, officialDisposal.longitude]} icon={destinationIcon()}>
            <Popup><div className="map-popup"><strong>{officialDisposal.name}</strong><span>Lokasi pembuangan resmi</span><span>Geofence {officialDisposal.radiusMeters} m</span></div></Popup>
          </Marker>
          <Circle center={[officialDisposal.latitude, officialDisposal.longitude]} radius={officialDisposal.radiusMeters} pathOptions={{ color: '#8055bd', fillOpacity: 0.08 }} />
        </>}
        {driverPosition && <Marker position={[driverPosition.latitude, driverPosition.longitude]} icon={driverIcon()}><Popup>Posisi terakhir sopir</Popup></Marker>}
        {(routeStops.length > 1 || officialDisposal) && <RoadRoute key={requestPath} stops={routePositions} destination={officialDisposal} onError={setRouteError} />}
        <FitRoute positions={fitPositions} />
      </MapContainer>
      {routeError && <div className="map-route-error" role="status">{routeError} Urutan titik jemput tetap ditampilkan; buka rute eksternal untuk navigasi jalan.</div>}
      <div className="map-legend"><span><i className="legend-green" /> Gedung / jemput</span>{officialDisposal && <span><i className="legend-purple" /> PPST UNAND</span>}{driverPosition && <span><i className="legend-blue" /> Posisi sopir</span>}</div>
    </div>
  )
}
