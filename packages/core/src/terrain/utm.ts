// UTM (WGS84) → latitude/longitude, Snyder's inverse Transverse Mercator series (< 1 m error inside a zone).

const A = 6378137.0
const F = 1 / 298.257223563
const K0 = 0.9996
const E2 = F * (2 - F)
const EP2 = E2 / (1 - E2)

/** 'urn:ogc:def:crs:EPSG::32651' → { zone: 51, south: false }; EPSG 327xx → south. Throws for anything else. */
export function utmZoneFromCrs(crsName: string): { zone: number; south: boolean } {
  const match = /(?:EPSG)?:{1,2}(32[67])(\d{2})$/.exec(crsName.trim())
  if (!match) throw new Error(`"${crsName}" is not a UTM WGS84 coordinate system (EPSG 326xx or 327xx).`)
  const zone = Number(match[2])
  if (zone < 1 || zone > 60) throw new Error(`UTM zone ${zone} is out of range.`)
  return { zone, south: match[1] === '327' }
}

export function utmToLatLng(e: number, n: number, zone: number, south: boolean): { lat: number; lng: number } {
  const x = e - 500000
  const y = south ? n - 10000000 : n
  const mu = y / K0 / (A * (1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256))
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2))
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu)
  const sin = Math.sin(phi1)
  const cos = Math.cos(phi1)
  const tan = Math.tan(phi1)
  const c1 = EP2 * cos ** 2
  const t1 = tan ** 2
  const n1 = A / Math.sqrt(1 - E2 * sin ** 2)
  const r1 = (A * (1 - E2)) / (1 - E2 * sin ** 2) ** 1.5
  const d = x / (n1 * K0)
  const lat =
    phi1 -
    ((n1 * tan) / r1) *
      (d ** 2 / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * EP2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * EP2 - 3 * c1 ** 2) * d ** 6) / 720)
  const lon =
    (d - ((1 + 2 * t1 + c1) * d ** 3) / 6 + ((5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * EP2 + 24 * t1 ** 2) * d ** 5) / 120) / cos
  return { lat: (lat * 180) / Math.PI, lng: (zone - 1) * 6 - 180 + 3 + (lon * 180) / Math.PI }
}
