import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TourViewer } from "./TourViewer";

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  viewer: vi.fn(),
  destroy: vi.fn(),
  on: vi.fn(),
  getYaw: vi.fn(() => 0),
  getPitch: vi.fn(() => 0),
  setYaw: vi.fn(),
  setPitch: vi.fn(),
  addHotspot: vi.fn(),
  removeHotspot: vi.fn(),
}));

vi.mock("@/lib/panorama-image-resolver", () => ({ resolvePanoramaImageUrl: mocks.resolve }));

const imageAssetId = "panoramas/navi-persistence-test-1791537831751-m7ckux03/pano-1/0123456789abcdef0123456789abcdef.jpg";

afterEach(() => {
  cleanup();
  mocks.resolve.mockReset();
  mocks.viewer.mockReset();
  mocks.destroy.mockReset();
  vi.unstubAllGlobals();
});

describe("TourViewer panorama image resolution", () => {
  it("resolves a durable asset key before passing an image URL to Pannellum", async () => {
    const resolvedUrl = "https://r2-preview.invalid/short-lived-read";
    mocks.resolve.mockResolvedValue(resolvedUrl);
    mocks.viewer.mockReturnValue({
      destroy: mocks.destroy,
      getYaw: mocks.getYaw,
      getPitch: mocks.getPitch,
      setYaw: mocks.setYaw,
      setPitch: mocks.setPitch,
      addHotspot: mocks.addHotspot,
      removeHotspot: mocks.removeHotspot,
      on: mocks.on,
    });
    Object.defineProperty(window, "pannellum", {
      configurable: true,
      value: { viewer: mocks.viewer },
    });

    render(<TourViewer panoramas={[{
      id: "pano-1",
      label: "Test scene",
      imageUrl: imageAssetId,
      heading: 0,
      hotspots: [],
    }]} />);

    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith(imageAssetId));
    await waitFor(() => expect(mocks.viewer).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ panorama: resolvedUrl }),
    ));
  });
});
