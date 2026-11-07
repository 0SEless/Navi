import { recordChange } from '@navi/core'
import type { CampusDocument, Structure, StructurePreset } from '@navi/core'
import type { Command, CommandHandler, MutationResult } from './types'
import { followStairRoute } from './stair-route'

// Terrain plan: outdoor stairs and ramps (free map parts, no lock) and their presets.
// A list that becomes empty is removed again, so an untouched campus stays byte-stable.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validStructure(value: unknown): string | null {
  if (!isRecord(value)) return 'A stair needs its settings.'
  if (typeof value.id !== 'string' || value.id === '') return 'A stair needs an id.'
  if (value.form !== 'stairs' && value.form !== 'ramp') return 'The form must be stairs or a ramp.'
  if (typeof value.width !== 'number' || !(value.width >= 0.6 && value.width <= 10)) return 'The width must be from 0.6 to 10 metres.'
  if (!isRecord(value.start) || !isRecord(value.end)) return 'A stair needs two ends.'
  return null
}

function list(document: CampusDocument): Structure[] {
  return document.structures ? [...document.structures] : []
}

function store(document: CampusDocument, items: Structure[]): void {
  if (items.length > 0) document.structures = items
  else delete document.structures
}

function replaceCommand(previous: Structure): Command {
  return { id: 'structure.replace', label: 'Undo stair edit', payload: { structure: previous } }
}

export const structureCreateHandler: CommandHandler = {
  id: 'structure.create',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const invalid = validStructure(payload.structure)
    if (invalid) return { success: false, error: invalid }
    const structure = structuredClone(payload.structure) as Structure
    const items = list(document)
    if (items.some((s) => s.id === structure.id)) return { success: false, error: `A stair with id ${structure.id} already exists.` }
    const index = typeof payload.index === 'number' ? Math.max(0, Math.min(items.length, payload.index)) : items.length
    items.splice(index, 0, structure)
    store(document, items)
    recordChange(document, { entityId: structure.id, entityType: 'structure', operation: payload.index === undefined ? 'created' : 'restored' })
    return { success: true, entityId: structure.id }
  },
  inverse(payload: Record<string, unknown>): Command | null {
    const id = (payload.structure as Structure | undefined)?.id
    return id ? { id: 'structure.delete', label: 'Undo add stair', payload: { id } } : null
  },
}

/** Replaces a stair's settings (one undo step for a drag or a panel change). */
export const structureReplaceHandler: CommandHandler = {
  id: 'structure.replace',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const invalid = validStructure(payload.structure)
    if (invalid) return { success: false, error: invalid }
    const next = structuredClone(payload.structure) as Structure
    const items = list(document)
    const index = items.findIndex((s) => s.id === next.id)
    if (index < 0) return { success: false, error: `Stair not found: ${next.id}` }
    const previous = items[index]
    items[index] = next
    store(document, items)
    followStairRoute(document, next.id)
    recordChange(document, { entityId: next.id, entityType: 'structure', operation: 'updated' })
    return { success: true, entityId: next.id, data: { previous } }
  },
  inverse(_payload: Record<string, unknown>, result: MutationResult): Command | null {
    const previous = result.data?.previous as Structure | undefined
    return previous ? replaceCommand(previous) : null
  },
}

/** Swap preset: takes the preset's shape (width, underneath, railings) and id; keeps both ends and the bend. */
export const structureSwapPresetHandler: CommandHandler = {
  id: 'structure.swap-preset',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const preset = payload.preset as StructurePreset | undefined
    if (!isRecord(preset) || typeof preset.id !== 'string' || !isRecord(preset.shape)) return { success: false, error: 'Pick a preset.' }
    const current = document.structures?.find((s) => s.id === payload.id)
    if (!current) return { success: false, error: `Stair not found: ${String(payload.id)}` }
    return structureReplaceHandler.execute(document, { structure: { ...current, ...preset.shape, presetId: preset.id, form: preset.form } })
  },
  inverse(_payload: Record<string, unknown>, result: MutationResult): Command | null {
    const previous = result.data?.previous as Structure | undefined
    return previous ? replaceCommand(previous) : null
  },
}

export const structureDeleteHandler: CommandHandler = {
  id: 'structure.delete',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const items = list(document)
    const index = items.findIndex((s) => s.id === payload.id)
    if (index < 0) return { success: false, error: `Stair not found: ${String(payload.id)}` }
    const [previous] = items.splice(index, 1)
    store(document, items)
    recordChange(document, { entityId: previous.id, entityType: 'structure', operation: 'deleted' })
    return { success: true, entityId: previous.id, data: { previous, index } }
  },
  inverse(_payload: Record<string, unknown>, result: MutationResult): Command | null {
    const previous = result.data?.previous as Structure | undefined
    return previous ? { id: 'structure.create', label: 'Undo delete stair', payload: { structure: previous, index: result.data?.index } } : null
  },
}

export const structurePresetCreateHandler: CommandHandler = {
  id: 'structure-preset.create',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const preset = payload.preset as StructurePreset | undefined
    if (!isRecord(preset) || typeof preset.id !== 'string' || typeof preset.name !== 'string' || preset.name.trim() === '') return { success: false, error: 'A preset needs an id and a name.' }
    const items = document.structurePresets ? [...document.structurePresets] : []
    if (items.some((p) => p.id === preset.id)) return { success: false, error: `A preset with id ${preset.id} already exists.` }
    const index = typeof payload.index === 'number' ? Math.max(0, Math.min(items.length, payload.index)) : items.length
    items.splice(index, 0, structuredClone(preset))
    document.structurePresets = items
    recordChange(document, { entityId: preset.id, entityType: 'structure-preset', operation: 'created' })
    return { success: true, entityId: preset.id }
  },
  inverse(payload: Record<string, unknown>): Command | null {
    const id = (payload.preset as StructurePreset | undefined)?.id
    return id ? { id: 'structure-preset.delete', label: 'Undo save preset', payload: { id } } : null
  },
}

export const structurePresetDeleteHandler: CommandHandler = {
  id: 'structure-preset.delete',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const items = document.structurePresets ? [...document.structurePresets] : []
    const index = items.findIndex((p) => p.id === payload.id)
    if (index < 0) return { success: false, error: `Preset not found: ${String(payload.id)}` }
    const [previous] = items.splice(index, 1)
    if (items.length > 0) document.structurePresets = items
    else delete document.structurePresets
    recordChange(document, { entityId: previous.id, entityType: 'structure-preset', operation: 'deleted' })
    return { success: true, entityId: previous.id, data: { previous, index } }
  },
  inverse(_payload: Record<string, unknown>, result: MutationResult): Command | null {
    const previous = result.data?.previous as StructurePreset | undefined
    return previous ? { id: 'structure-preset.create', label: 'Undo delete preset', payload: { preset: previous, index: result.data?.index } } : null
  },
}

export const structureHandlers: CommandHandler[] = [
  structureCreateHandler,
  structureReplaceHandler,
  structureSwapPresetHandler,
  structureDeleteHandler,
  structurePresetCreateHandler,
  structurePresetDeleteHandler,
]
