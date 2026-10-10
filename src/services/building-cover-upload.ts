import {
  BUILDING_COVER_MAX_BYTES,
  isBuildingCoverReferenceForOwner,
} from '@/lib/building-cover-policy'

export type BuildingCoverUploadStage = 'validating' | 'signing' | 'uploading' | 'verifying'

interface UploadOptions {
  fetcher?: typeof fetch
  onStage?: (stage: BuildingCoverUploadStage) => void
}

interface JsonRecord {
  [key: string]: unknown
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireSupportedFile(file: File): void {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPEG, PNG, or WebP image.')
  }
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > BUILDING_COVER_MAX_BYTES) {
    throw new Error('Choose an image no larger than 8 MiB.')
  }
}

function isSafeUploadUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    const localDevelopment = url.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    return (url.protocol === 'https:' || localDevelopment)
      && url.username === ''
      && url.password === ''
  } catch {
    return false
  }
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function postJson(fetcher: typeof fetch, body: JsonRecord): Promise<{ response: Response; value: unknown }> {
  const response = await fetcher('/api/building-cover-upload', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { response, value: await responseJson(response) }
}

/** Upload one selected file and return only its stable, owner-bound public reference. */
export async function uploadBuildingCover(
  file: File,
  campusId: string,
  buildingId: string,
  options: UploadOptions = {},
): Promise<{ reference: string }> {
  const fetcher = options.fetcher ?? fetch
  options.onStage?.('validating')
  requireSupportedFile(file)

  options.onStage?.('signing')
  let sign: { response: Response; value: unknown }
  try {
    sign = await postJson(fetcher, {
      action: 'sign', campusId, buildingId, contentType: file.type, byteSize: file.size,
    })
  } catch {
    throw new Error('Unable to start the upload. Check your connection and try again.')
  }
  if (!sign.response.ok || !isRecord(sign.value)
    || !isSafeUploadUrl(sign.value.uploadUrl)
    || typeof sign.value.uploadToken !== 'string'
    || sign.value.uploadToken.length === 0) {
    throw new Error('Unable to start the upload. Check your access and try again.')
  }

  options.onStage?.('uploading')
  let uploadResponse: Response
  try {
    uploadResponse = await fetcher(sign.value.uploadUrl, {
      method: 'PUT',
      credentials: 'omit',
      headers: { 'Content-Type': file.type },
      body: file,
    })
  } catch {
    throw new Error('Unable to upload the image. Check your connection and try again.')
  }
  if (!uploadResponse.ok) throw new Error('Unable to upload the image. Check your access and try again.')

  options.onStage?.('verifying')
  let complete: { response: Response; value: unknown }
  try {
    complete = await postJson(fetcher, {
      action: 'complete', campusId, buildingId, uploadToken: sign.value.uploadToken,
    })
  } catch {
    throw new Error('Unable to verify the uploaded image. Try again.')
  }
  if (!complete.response.ok || !isRecord(complete.value)
    || complete.value.ok !== true
    || complete.value.contentType !== file.type
    || complete.value.byteSize !== file.size
    || !isBuildingCoverReferenceForOwner(complete.value.reference, campusId, buildingId)) {
    throw new Error('Unable to verify the uploaded image. Try again.')
  }

  return { reference: complete.value.reference as string }
}
