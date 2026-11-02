import {
  BUILT_IN_MATERIALS, BUILT_IN_PRESETS, buildStructureMesh, resolveStructureEnds, structurePath,
  type CampusDocument, type StructurePreset, type TerrainSampler,
} from '@navi/core'

/** The campus's own preset, else the built-in one, else the plain stair. */
export function presetFor(document: CampusDocument, presetId: string): StructurePreset {
  return document.structurePresets?.find((p) => p.id === presetId)
    ?? BUILT_IN_PRESETS.find((p) => p.id === presetId)
    ?? BUILT_IN_PRESETS[0]
}

/** Every stair and ramp as one mesh in the terrain grid's local metres (for the 3D mesh layer). */
export function buildStructuresMesh(document: CampusDocument, sampler: TerrainSampler): Float32Array {
  const parts: Float32Array[] = []
  for (const structure of document.structures ?? []) {
    const resolved = resolveStructureEnds(document, sampler, structure)
    if (!resolved) continue
    parts.push(buildStructureMesh({
      path: structurePath(resolved.start, resolved.end, resolved.bend),
      startH: resolved.start.h,
      endH: resolved.end.h,
      form: structure.form,
      width: structure.width,
      underneath: structure.underneath,
      railings: structure.railings,
      ...(structure.flight ? { flight: structure.flight } : {}),
      ...(structure.landings ? { landings: structure.landings } : {}),
      groundAt: (x, y) => sampler.heightAt(x, y),
      look: presetFor(document, structure.presetId).look,
      materials: BUILT_IN_MATERIALS,
    }))
  }
  const out = new Float32Array(parts.reduce((n, part) => n + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}
