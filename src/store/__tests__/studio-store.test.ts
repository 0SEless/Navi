import { describe, it, expect, beforeEach } from 'vitest'
import { useStudioStore } from '../studio-store'

describe('useStudioStore', () => {
  beforeEach(() => {
    useStudioStore.setState({
      tool: 'select',
      editorMode: 'campus',
      activeBuildingId: null,
      activeFloor: 0,
      layers: {
        osm: true, satellite: false, floor_plan: false,
        buildings: true, rooms: true, hallways: true,
        assets: true, nodes: false, edges: false, labels: true,
      },
    })
  })

  it('sets tool', () => {
    useStudioStore.getState().setTool('trace')
    expect(useStudioStore.getState().tool).toBe('trace')
  })

  it('sets editor mode', () => {
    useStudioStore.getState().setEditorMode('building')
    expect(useStudioStore.getState().editorMode).toBe('building')
  })

  it('sets active building', () => {
    useStudioStore.getState().setActiveBuilding('BLD01')
    expect(useStudioStore.getState().activeBuildingId).toBe('BLD01')
  })

  it('sets active floor', () => {
    useStudioStore.getState().setActiveFloor(2)
    expect(useStudioStore.getState().activeFloor).toBe(2)
  })

  it('toggles layer visibility', () => {
    useStudioStore.getState().toggleLayer('nodes')
    expect(useStudioStore.getState().layers.nodes).toBe(true)
  })
})
