import type maplibregl from 'maplibre-gl'

export interface OpeningSymbolData {
  lines: GeoJSON.FeatureCollection<GeoJSON.LineString>
  markers: GeoJSON.FeatureCollection<GeoJSON.Point>
}

export const OPENING_SYMBOL_LAYER_IDS = ['floor-opening-symbols-lines', 'floor-opening-symbols-fire'] as const
/** Plan symbols only read at building scale. */
export const OPENING_SYMBOL_MIN_ZOOM = 18

type MapLike = Pick<maplibregl.Map, 'getSource' | 'getLayer' | 'addSource' | 'addLayer' | 'setLayoutProperty'>

/** Installs (once) and updates the door/window plan-symbol layers. Shared by Studio and NAVI Web. */
export function syncOpeningSymbolLayers(map: MapLike, symbols: OpeningSymbolData | undefined, visible: boolean): void {
  const empty = { type: 'FeatureCollection' as const, features: [] }
  const [linesId, fireId] = OPENING_SYMBOL_LAYER_IDS
  const data: Record<string, GeoJSON.FeatureCollection> = { [linesId]: symbols?.lines ?? empty, [fireId]: symbols?.markers ?? empty }
  for (const id of OPENING_SYMBOL_LAYER_IDS) {
    const source = map.getSource(id) as maplibregl.GeoJSONSource | undefined
    if (source) source.setData(data[id])
    else map.addSource(id, { type: 'geojson', data: data[id] })
  }
  if (!map.getLayer(linesId)) map.addLayer({
    id: linesId, source: linesId, type: 'line', minzoom: OPENING_SYMBOL_MIN_ZOOM,
    paint: {
      'line-color': ['match', ['get', 'kind'], ['window-face', 'window-glass', 'window-hatch', 'window-swing', 'window-mullion'], '#0284C7', '#047857'],
      'line-width': ['match', ['get', 'kind'], ['leaf', 'panel', 'fold', 'shutter'], 2, 1.25],
      'line-dasharray': ['match', ['get', 'kind'], ['arc', 'shutter', 'window-swing'], ['literal', [2, 2]], ['literal', [1, 0]]],
    },
  } as maplibregl.LayerSpecification)
  if (!map.getLayer(fireId)) map.addLayer({
    id: fireId, source: fireId, type: 'symbol', minzoom: OPENING_SYMBOL_MIN_ZOOM,
    layout: { 'text-field': 'F', 'text-size': 11, 'text-allow-overlap': true },
    paint: { 'text-color': '#B91C1C', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1 },
  } as maplibregl.LayerSpecification)
  for (const id of OPENING_SYMBOL_LAYER_IDS) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
}

/** Extrusion colour: a feature's own `color` (chosen material or glass), else the layer's default. */
export function doorExtrusionColor(fallback: string): ['coalesce', ['get', 'color'], string] {
  return ['coalesce', ['get', 'color'], fallback]
}
