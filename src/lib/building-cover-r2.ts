/** Server-only R2 operations for the isolated building-covers namespace. */
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createR2Client, type R2Config } from './r2'
import { parseBuildingCoverKey } from './building-cover-policy'

export const BUILDING_COVER_PUT_TTL_SECONDS = 10 * 60
export const BUILDING_COVER_GET_TTL_SECONDS = 15 * 60

export type BuildingCoverHeadResult =
  | { ok: true; contentType: string; byteSize: number }
  | { ok: false; notFound: true }

function parseKeyOrThrow(key: string) {
  const parsed = parseBuildingCoverKey(key)
  if (!parsed) throw new TypeError('Refusing an R2 operation outside the building-covers namespace.')
  return parsed
}

/** Sign a private direct PUT for one immutable building cover object. */
export async function presignBuildingCoverPut(config: R2Config, key: string, contentType: string): Promise<string> {
  const parsed = parseKeyOrThrow(key)
  if (parsed.contentType !== contentType) throw new TypeError('Building cover content type does not match its key.')

  const client = createR2Client(config)
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: contentType,
      // No ACL: the configured R2 bucket remains private.
    }),
    { expiresIn: BUILDING_COVER_PUT_TTL_SECONDS },
  )
}

/** Inspect one immutable object without downloading it. */
export async function headBuildingCoverObject(config: R2Config, key: string): Promise<BuildingCoverHeadResult> {
  parseKeyOrThrow(key)
  const client = createR2Client(config)
  try {
    const result = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }))
    return {
      ok: true,
      contentType: typeof result.ContentType === 'string' ? result.ContentType : '',
      byteSize: typeof result.ContentLength === 'number' ? result.ContentLength : -1,
    }
  } catch (error) {
    const err = error as {
      name?: unknown
      Code?: unknown
      code?: unknown
      $metadata?: { httpStatusCode?: unknown }
    }
    const name = [err?.name, err?.Code, err?.code].find((candidate) => typeof candidate === 'string' && candidate.length > 0)
    const status = err?.$metadata?.httpStatusCode
    if (name === 'NotFound' || name === 'NoSuchKey' || status === 404) return { ok: false, notFound: true }
    throw error
  }
}

/** Sign a short-lived GET whose response overrides keep the immutable object an inline raster image. */
export async function presignBuildingCoverGet(config: R2Config, key: string): Promise<string> {
  const parsed = parseKeyOrThrow(key)
  const client = createR2Client(config)
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ResponseContentType: parsed.contentType,
      ResponseContentDisposition: 'inline',
      ResponseCacheControl: 'public, max-age=31536000, immutable',
    }),
    { expiresIn: BUILDING_COVER_GET_TTL_SECONDS },
  )
}
