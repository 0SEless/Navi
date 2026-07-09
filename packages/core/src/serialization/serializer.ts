import type { CampusDocument } from '../types/document'

// ── Serialize CampusDocument to JSON string ──

export function serializeDocument(doc: CampusDocument): string {
  return JSON.stringify(doc, null, 2)
}

// ── Deserialize JSON string back to CampusDocument ──

export function deserializeDocument(json: string): CampusDocument {
  const parsed = JSON.parse(json)
  validateDocument(parsed)
  return parsed as CampusDocument
}

// ── Basic validation on deserialization ──

function validateDocument(doc: unknown): asserts doc is CampusDocument {
  if (!doc || typeof doc !== 'object') {
    throw new Error('Invalid document: not an object')
  }
  const d = doc as Record<string, unknown>

  if (typeof d.schemaVersion !== 'number') {
    throw new Error('Invalid document: missing or invalid schemaVersion')
  }
  if (!d.metadata || typeof d.metadata !== 'object') {
    throw new Error('Invalid document: missing metadata')
  }
  if (!Array.isArray(d.buildings)) {
    throw new Error('Invalid document: buildings must be an array')
  }
  if (!Array.isArray(d.roads)) {
    throw new Error('Invalid document: roads must be an array')
  }
  if (!Array.isArray(d.panoramas)) {
    throw new Error('Invalid document: panoramas must be an array')
  }
  if (!Array.isArray(d.qrCheckpoints)) {
    throw new Error('Invalid document: qrCheckpoints must be an array')
  }
}

// ── Round-trip equality test ──

export function roundTrip(doc: CampusDocument): { success: boolean; error?: string } {
  try {
    const json = serializeDocument(doc)
    const restored = deserializeDocument(json)
    const json2 = serializeDocument(restored)
    if (json !== json2) {
      return { success: false, error: 'Round-trip produced different JSON' }
    }
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}
