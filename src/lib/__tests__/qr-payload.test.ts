import { describe, it, expect } from 'vitest'
import {
  encodeQrPayload,
  parseQrPayload,
  resolveQrPayload,
} from '../qr-payload'
import type { NavNode } from '@/types/nav-types'

const node = (id: string): NavNode => ({
  id,
  label: id,
  position: { lat: 11.82, lng: 122.168 },
  floor: 0,
  buildingId: 'bld-main',
  campusId: 'asu-ibajay',
  type: 'room',
})

describe('encodeQrPayload', () => {
  it('produces the canonical navi:// URL', () => {
    expect(encodeQrPayload('asu-ibajay', 'node-1')).toBe(
      'navi://asu-ibajay/navigate?node=node-1',
    )
  })

  it('URL-encodes node ids', () => {
    expect(encodeQrPayload('asu-ibajay', 'room a/b')).toContain(
      'node=room%20a%2Fb',
    )
  })
})

describe('parseQrPayload', () => {
  it('parses canonical payloads', () => {
    expect(parseQrPayload('navi://asu-ibajay/navigate?node=node-1')).toEqual({
      campusId: 'asu-ibajay',
      nodeId: 'node-1',
    })
  })

  it('parses legacy ?node= URLs (original QRScanner format)', () => {
    expect(parseQrPayload('https://navi.app/?node=node-42&x=1')).toEqual({
      campusId: 'asu-ibajay',
      nodeId: 'node-42',
    })
  })

  it('URL-decodes node ids with spaces and slashes (?node=room%20a%2Fb)', () => {
    expect(parseQrPayload('https://navi.app/?node=room%20a%2Fb')).toEqual({
      campusId: 'asu-ibajay',
      nodeId: 'room a/b',
    })
  })

  it('URL-decodes percent-encoded dashes (?node=node%2D1)', () => {
    expect(parseQrPayload('navi://asu-ibajay/navigate?node=node%2D1')).toEqual({
      campusId: 'asu-ibajay',
      nodeId: 'node-1',
    })
  })

  it('parses bare node ids', () => {
    expect(parseQrPayload('node-7')).toEqual({
      campusId: 'asu-ibajay',
      nodeId: 'node-7',
    })
  })

  it('rejects garbage', () => {
    expect(parseQrPayload('hello world!')).toBeNull()
    expect(parseQrPayload('')).toBeNull()
    expect(parseQrPayload('   ')).toBeNull()
  })

  it('round-trips through encodeQrPayload', () => {
    const enc = encodeQrPayload('asu-ibajay', 'node-3')
    expect(parseQrPayload(enc)).toEqual({ campusId: 'asu-ibajay', nodeId: 'node-3' })
  })
})

describe('resolveQrPayload', () => {
  const nodes = [node('node-1'), node('node-2')]

  it('resolves to an existing node', () => {
    const result = resolveQrPayload(
      parseQrPayload('navi://asu-ibajay/navigate?node=node-2'),
      nodes,
    )
    expect(result?.id).toBe('node-2')
  })

  it('returns null for unknown node ids (cross-campus codes)', () => {
    expect(
      resolveQrPayload(parseQrPayload('navi://other-campus/navigate?node=nope'), nodes),
    ).toBeNull()
  })

  it('returns null for unparsable input', () => {
    expect(resolveQrPayload(null, nodes)).toBeNull()
  })
})
