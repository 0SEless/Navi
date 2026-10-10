import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadPanoramaAsset } from "../panorama-upload-client";

const CAMPUS_ID = "navi-persistence-test-1791537831751-m7ckux03";
const PANORAMA_ID = "test-panorama";
const ASSET_KEY = `panoramas/${CAMPUS_ID}/${PANORAMA_ID}/0123456789abcdef0123456789abcdef.jpg`;

function validFile(type = "image/jpeg", size = 8): File {
  const file = new File([new Uint8Array(size)], "test-panorama.jpg", { type });
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 2048, height: 1024, close: vi.fn() }));
  return file;
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("uploadPanoramaAsset", () => {
  it("signs, uploads, verifies, and returns the key only after completion", async () => {
    const stages: string[] = [];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({
        ok: true,
        key: ASSET_KEY,
        uploadUrl: "https://r2-upload.invalid/signed",
        requiredContentType: "image/jpeg",
        maxBytes: 25 * 1024 * 1024,
      }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(response({ ok: true, key: ASSET_KEY, byteSize: 8, contentType: "image/jpeg" }));
    vi.stubGlobal("fetch", fetchMock);

    const key = await uploadPanoramaAsset({
      campusId: CAMPUS_ID,
      panoramaId: PANORAMA_ID,
      file: validFile(),
      onStage: (stage) => stages.push(stage),
    });

    expect(key).toBe(ASSET_KEY);
    expect(stages).toEqual(["validating", "signing", "uploading", "verifying"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/panorama-upload");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      action: "sign",
      campusId: CAMPUS_ID,
      panoramaId: PANORAMA_ID,
      contentType: "image/jpeg",
      byteSize: 8,
    });
    expect(fetchMock.mock.calls[1][0]).toBe("https://r2-upload.invalid/signed");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "PUT", body: expect.any(File) });
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({ action: "complete", key: ASSET_KEY });
  });

  it("rejects unsupported, oversized, or non-equirectangular files before requesting a URL", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadPanoramaAsset({ campusId: CAMPUS_ID, panoramaId: PANORAMA_ID, file: validFile("image/gif") }))
      .rejects.toThrow(/JPEG, PNG, or WebP/);

    const oversized = validFile();
    Object.defineProperty(oversized, "size", { value: 26 * 1024 * 1024 });
    await expect(uploadPanoramaAsset({ campusId: CAMPUS_ID, panoramaId: PANORAMA_ID, file: oversized }))
      .rejects.toThrow(/25 MiB/);

    const nonEquirectangular = validFile();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 1600, height: 900, close: vi.fn() }));
    await expect(uploadPanoramaAsset({ campusId: CAMPUS_ID, panoramaId: PANORAMA_ID, file: nonEquirectangular }))
      .rejects.toThrow(/2:1 equirectangular/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call completion after a failed browser PUT", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ ok: true, key: ASSET_KEY, uploadUrl: "https://r2-upload.invalid/signed", requiredContentType: "image/jpeg", maxBytes: 25 * 1024 * 1024 }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadPanoramaAsset({ campusId: CAMPUS_ID, panoramaId: PANORAMA_ID, file: validFile() }))
      .rejects.toThrow(/upload failed/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not return an asset key when server verification fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ ok: true, key: ASSET_KEY, uploadUrl: "https://r2-upload.invalid/signed", requiredContentType: "image/jpeg", maxBytes: 25 * 1024 * 1024 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(response({ error: "object_validation_failed" }, 400));
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadPanoramaAsset({ campusId: CAMPUS_ID, panoramaId: PANORAMA_ID, file: validFile() }))
      .rejects.toThrow(/could not be verified/i);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
