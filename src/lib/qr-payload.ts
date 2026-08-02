import type { NavNode } from '@/types/nav-types'

/**
 * QR payload format for NAVI location codes.
 *
 * Format: `navi://<campusId>/navigate?node=<nodeId>`
 * - `<campusId>` — the campus this code belongs to (e.g. `asu-ibajay`)
 * - `<nodeId>` — the routable GRAPH node id (never a component id — see
 *   ERRORS.md 2026-08-02)
 *
 * Legacy scanners also accept a bare node id or a URL carrying only
 * `?node=<id>` (the QRScanner component's original format).
 */
export const QR_PROTOCOL = 'navi://'
export const QR_DEFAULT_CAMPUS = 'asu-ibajay'

export interface QrPayload {
  campusId: string
  nodeId: string
}

export function encodeQrPayload(campusId: string, nodeId: string): string {
  return `${QR_PROTOCOL}${campusId}/navigate?node=${encodeURIComponent(nodeId)}`
}

/**
 * Parse any supported payload text into a QrPayload, or null when the
 * text contains no recognizable node reference.
 */
export function parseQrPayload(text: string): QrPayload | null {
  if (!text) return null
  const trimmed = text.trim()

  // navi://<campus>/navigate?node=<id> — canonical
  const canonical = trimmed.match(/^navi:\/\/([^/?]+)\/navigate\?node=([^&]+)/)
  if (canonical) {
    return { campusId: canonical[1], nodeId: decodeURIComponent(canonical[2]) }
  }

  // any URL with ?node=<id> (legacy QRScanner format, deep links)
  const anyUrl = trimmed.match(/[?&]node=([^&]+)/)
  if (anyUrl) {
    return { campusId: QR_DEFAULT_CAMPUS, nodeId: decodeURIComponent(anyUrl[1]) }
  }

  // bare node id (e.g. studio marker codes, manual entry)
  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return { campusId: QR_DEFAULT_CAMPUS, nodeId: trimmed }
  }

  return null
}

/**
 * True when a payload explicitly belongs to a different campus than the
 * one currently loaded. Payload forms that carry no campus context
 * (bare ids, legacy `?node=` URLs) default to QR_DEFAULT_CAMPUS and are
 * never foreign — they resolve against whatever campus is loaded.
 */
export function isForeignCampus(
  payload: QrPayload | null,
  currentCampusId: string,
): boolean {
  if (!payload || !payload.campusId) return false
  if (payload.campusId === QR_DEFAULT_CAMPUS) return false
  return payload.campusId !== currentCampusId
}

/**
 * Resolve a scanned payload against the loaded campus graph.
 * Returns the matching node, or null when the node doesn't exist in the
 * loaded campus. Cross-campus rejection must be decided by
 * isForeignCampus BEFORE calling this.
 */
export function resolveQrPayload(
  payload: QrPayload | null,
  nodes: NavNode[],
): NavNode | null {
  if (!payload) return null
  return nodes.find((n) => n.id === payload.nodeId) ?? null
}
