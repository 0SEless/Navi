import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { GateScreen, gateHandoffUrl } from '../GateScreen'
import type { CampusBundle } from '@/types/nav-types'

describe('gateHandoffUrl', () => {
  it('encodes the destination into a phone navigation preview link', () => {
    expect(gateHandoffUrl('https://x', 'qr-1', 'n 2')).toBe('https://x/map/navigate?qr=qr-1&to=n%202')
  })
})

describe('GateScreen', () => {
  it('does not offer search when the checkpoint has no routing anchor', () => {
    render(<GateScreen campus={{} as CampusBundle} checkpointId="qr-1" startNodeId={null} />)
    expect(screen.getByText("This gate screen's checkpoint has no routing anchor. Ask staff to set it up.")).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('shows a clear no-route state for an unconnected destination', () => {
    const campus = {
      nodes: [
        { id: 'gate', label: 'Gate', position: { lat: 0, lng: 0 }, floor: 0, buildingId: '', campusId: 'c', type: 'outdoor' },
        { id: 'reading', label: 'Reading Room', position: { lat: 1, lng: 1 }, floor: 0, buildingId: 'b', campusId: 'c', type: 'room' },
      ],
      edges: [],
      searchEntries: [{ id: 'reading', label: 'Reading Room', type: 'room', nodeId: 'reading' }],
    } as unknown as CampusBundle
    render(<GateScreen campus={campus} checkpointId="qr-1" startNodeId="gate" />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'read' } })
    fireEvent.click(screen.getByRole('option', { name: 'Reading Room' }))
    expect(screen.getByText('No route to this place from here.')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Continue on your phone' })).toBeNull()
  })
})
