import {
  PANORAMA_ALLOWED_CONTENT_TYPES,
  PANORAMA_MAX_BYTES,
  parsePanoramaKey,
} from "./panorama-keys";

export type PanoramaUploadStage = "validating" | "signing" | "uploading" | "verifying";

export interface UploadPanoramaAssetOptions {
  campusId: string;
  panoramaId: string;
  file: File;
  onStage?: (stage: PanoramaUploadStage) => void;
}

const MAX_PANNELLUM_WIDTH = 8192;

async function validatePanoramaFile(file: File): Promise<void> {
  if (!(PANORAMA_ALLOWED_CONTENT_TYPES as readonly string[]).includes(file.type)) {
    throw new Error("Choose a JPEG, PNG, or WebP panorama image.");
  }
  if (file.size <= 0 || file.size > PANORAMA_MAX_BYTES) {
    throw new Error("Panorama images must be no larger than 25 MiB.");
  }
  if (typeof createImageBitmap !== "function") {
    throw new Error("This browser cannot inspect the panorama image dimensions.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("The selected panorama image could not be decoded.");
  }

  const { width, height } = bitmap;
  bitmap.close();
  if (width <= 0 || height <= 0 || width !== height * 2) {
    throw new Error("Choose a full 2:1 equirectangular panorama image.");
  }
  if (width > MAX_PANNELLUM_WIDTH) {
    throw new Error("Panorama images must be 8192 pixels wide or smaller.");
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/** Upload bytes directly to R2 and return a durable key only after server verification. */
export async function uploadPanoramaAsset({
  campusId,
  panoramaId,
  file,
  onStage,
}: UploadPanoramaAssetOptions): Promise<string> {
  onStage?.("validating");
  await validatePanoramaFile(file);

  onStage?.("signing");
  let signResponse: Response;
  try {
    signResponse = await fetch("/api/panorama-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({
        action: "sign",
        campusId,
        panoramaId,
        contentType: file.type,
        byteSize: file.size,
      }),
    });
  } catch {
    throw new Error("Could not request a secure panorama upload.");
  }
  if (!signResponse.ok) throw new Error("Panorama upload authorization failed.");

  const signed = await readJson(signResponse);
  const key = typeof signed.key === "string" ? signed.key : "";
  const uploadUrl = typeof signed.uploadUrl === "string" ? signed.uploadUrl : "";
  const registeredIdentity = parsePanoramaKey(key);
  let uploadOrigin = "";
  try {
    const parsedUrl = new URL(uploadUrl);
    if (parsedUrl.protocol === "https:") uploadOrigin = parsedUrl.origin;
  } catch {
    // The controlled error below avoids surfacing a signed URL or response body.
  }
  if (
    signed.ok !== true ||
    !registeredIdentity ||
    registeredIdentity.campusId !== campusId ||
    registeredIdentity.panoramaId !== panoramaId ||
    !uploadOrigin ||
    signed.requiredContentType !== file.type ||
    typeof signed.maxBytes !== "number" ||
    file.size > signed.maxBytes
  ) {
    throw new Error("The upload service returned an invalid panorama upload target.");
  }

  onStage?.("uploading");
  let putResponse: Response;
  try {
    putResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
      credentials: "omit",
      cache: "no-store",
    });
  } catch {
    throw new Error("Panorama upload failed. Your scene was not changed.");
  }
  if (!putResponse.ok) throw new Error("Panorama upload failed. Your scene was not changed.");

  onStage?.("verifying");
  let completeResponse: Response;
  try {
    completeResponse = await fetch("/api/panorama-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ action: "complete", key }),
    });
  } catch {
    throw new Error("The uploaded panorama could not be verified. Your scene was not changed.");
  }
  if (!completeResponse.ok) {
    throw new Error("The uploaded panorama could not be verified. Your scene was not changed.");
  }

  const completed = await readJson(completeResponse);
  if (
    completed.ok !== true ||
    completed.key !== key ||
    completed.byteSize !== file.size ||
    completed.contentType !== file.type
  ) {
    throw new Error("The uploaded panorama could not be verified. Your scene was not changed.");
  }
  return key;
}
