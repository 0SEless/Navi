import type { LatLng } from '@navi/core'
import { DocumentEventBus } from './eventbus'

export interface ViewportState {
  zoom: number
  center: LatLng
  bearing: number
  pitch: number
  activeBuildingId: string | null
  activeFloorId: string | null
  activeLayer: string | null
}

export class Viewport {
  private _zoom = 15
  private _center: LatLng = { lat: 0, lng: 0 }
  private _bearing = 0
  private _pitch = 0
  private _activeBuildingId: string | null = null
  private _activeFloorId: string | null = null
  private _activeLayer: string | null = null

  constructor(private eventBus: DocumentEventBus) {}

  setZoom(zoom: number): void {
    this._zoom = Math.max(1, Math.min(22, zoom))
    this.emit()
  }

  setCenter(center: LatLng): void {
    this._center = { ...center }
    this.emit()
  }

  setBearing(bearing: number): void {
    this._bearing = bearing
    this.emit()
  }

  setPitch(pitch: number): void {
    this._pitch = Math.max(0, Math.min(60, pitch))
    this.emit()
  }

  panTo(center: LatLng): void {
    this._center = { ...center }
    this.emit()
  }

  setActiveBuilding(id: string | null): void {
    this._activeBuildingId = id
    this.emit()
  }

  setActiveFloor(id: string | null): void {
    this._activeFloorId = id
    this.emit()
  }

  setActiveLayer(layer: string | null): void {
    this._activeLayer = layer
    this.emit()
  }

  reset(): void {
    this._zoom = 15
    this._center = { lat: 0, lng: 0 }
    this._bearing = 0
    this._pitch = 0
    this._activeBuildingId = null
    this._activeFloorId = null
    this._activeLayer = null
    this.emit()
  }

  get state(): ViewportState {
    return {
      zoom: this._zoom,
      center: { ...this._center },
      bearing: this._bearing,
      pitch: this._pitch,
      activeBuildingId: this._activeBuildingId,
      activeFloorId: this._activeFloorId,
      activeLayer: this._activeLayer,
    }
  }

  get zoom(): number { return this._zoom }
  get center(): LatLng { return { ...this._center } }
  get bearing(): number { return this._bearing }
  get pitch(): number { return this._pitch }
  get activeBuildingId(): string | null { return this._activeBuildingId }
  get activeFloorId(): string | null { return this._activeFloorId }
  get activeLayer(): string | null { return this._activeLayer }

  private emit(): void {
    this.eventBus.emit('viewport.changed', this.state)
  }
}
