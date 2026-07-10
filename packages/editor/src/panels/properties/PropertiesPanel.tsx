import { useEditor, useDocumentVersion, useSelection } from '../../context'
import { BuildingProperties } from './building-props'
import { FloorProperties } from './floor-props'
import { RoomProperties } from './room-props'
import { HallwayProperties } from './hallway-props'
import { RoadProperties } from './road-props'
import { EntranceProperties } from './entrance-props'
import { StaircaseProperties } from './staircase-props'
import { ElevatorProperties } from './elevator-props'
import { PanoramaProperties } from './panorama-props'
import { QRProperties } from './qr-props'
import { findEntityById } from './property-utils'

export function PropertiesPanel() {
  const { document } = useEditor()
  const selection = useSelection()
  const version = useDocumentVersion()
  const selectedId = selection.lastSelected?.id ?? null

  if (!selectedId) {
    return (
      <div data-version={version} style={{ padding: 12, fontSize: 13, fontFamily: 'system-ui, sans-serif', color: '#666', fontStyle: 'italic' }}>
        Select an entity to edit its properties
      </div>
    )
  }

  const found = findEntityById(document, selectedId)
  if (!found) {
    return (
      <div style={{ padding: 12, fontSize: 13, fontFamily: 'system-ui, sans-serif', color: '#f14c4c' }}>
        Entity not found: {selectedId}
      </div>
    )
  }

  switch (found.path) {
    case 'building': return <BuildingProperties building={found.entity as any} />
    case 'floor': return <FloorProperties floor={found.entity as any} />
    case 'room': return <RoomProperties room={found.entity as any} />
    case 'hallway': return <HallwayProperties hallway={found.entity as any} />
    case 'road': return <RoadProperties road={found.entity as any} />
    case 'entrance': return <EntranceProperties entrance={found.entity as any} />
    case 'staircase': return <StaircaseProperties staircase={found.entity as any} />
    case 'elevator': return <ElevatorProperties elevator={found.entity as any} />
    case 'panorama': return <PanoramaProperties panorama={found.entity as any} />
    case 'qr': return <QRProperties qr={found.entity as any} />
    default: return <div style={{ padding: 12, color: '#666' }}>Unknown entity type</div>
  }
}
