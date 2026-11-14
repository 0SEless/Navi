/**
 * Local "show anyway" view of an unpublished campus in the visitor app (development servers only).
 * Open the app with ?localPreview=<campusId>:<save number>; it is remembered for this browser tab.
 * ?localPreview=off clears it. Production builds ignore it entirely.
 */
export const LOCAL_PREVIEW_KEY = 'navi-local-preview'

export interface LocalPreview { campusId: string; commitNo: number }

function parse(value: string | null): LocalPreview | null {
  if (!value) return null
  const at = value.lastIndexOf(':')
  if (at <= 0) return null
  const campusId = value.slice(0, at)
  const commitNo = Number(value.slice(at + 1))
  return /^[A-Za-z0-9_-]+$/.test(campusId) && Number.isInteger(commitNo) && commitNo > 0 ? { campusId, commitNo } : null
}

export function readLocalPreview(): LocalPreview | null {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return null
  try {
    const param = new URLSearchParams(window.location.search).get('localPreview')
    if (param !== null) {
      const preview = param === 'off' ? null : parse(param)
      if (preview) window.sessionStorage.setItem(LOCAL_PREVIEW_KEY, `${preview.campusId}:${preview.commitNo}`)
      else window.sessionStorage.removeItem(LOCAL_PREVIEW_KEY)
      return preview
    }
    return parse(window.sessionStorage.getItem(LOCAL_PREVIEW_KEY))
  } catch {
    return null
  }
}
