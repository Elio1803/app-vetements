import { describe, expect, it } from "vitest";
import { computeNormalizedDimensions, findVisibleBounds, softenCutoutEdges } from "./photo-cutout";

function transparentPixels(width: number, height: number): Uint8ClampedArray {
  return new Uint8ClampedArray(width * height * 4);
}

function setPixel(pixels: Uint8ClampedArray, width: number, x: number, y: number, alpha: number) {
  const index = (y * width + x) * 4;
  pixels[index] = 10;
  pixels[index + 1] = 20;
  pixels[index + 2] = 30;
  pixels[index + 3] = alpha;
}

describe("computeNormalizedDimensions", () => {
  it("leaves an image smaller than the max dimension unchanged", () => {
    expect(computeNormalizedDimensions(800, 600, 2200)).toEqual({ width: 800, height: 600 });
  });

  it("scales down a landscape image larger than the max dimension, preserving aspect ratio", () => {
    expect(computeNormalizedDimensions(4400, 2200, 2200)).toEqual({ width: 2200, height: 1100 });
  });

  it("scales down a portrait image larger than the max dimension, preserving aspect ratio", () => {
    expect(computeNormalizedDimensions(2200, 4400, 2200)).toEqual({ width: 1100, height: 2200 });
  });
});

describe("findVisibleBounds", () => {
  it("returns the full canvas when every pixel is transparent", () => {
    const pixels = transparentPixels(10, 10);
    expect(findVisibleBounds(pixels, 10, 10)).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });

  it("includes a one-pixel-thin protrusion right at the edge of the image", () => {
    const width = 20;
    const height = 20;
    const pixels = transparentPixels(width, height);
    for (let y = 5; y < 15; y++) {
      for (let x = 5; x < 15; x++) {
        setPixel(pixels, width, x, y, 255);
      }
    }
    // A thin strap poking out right at the top edge of the image (row 0).
    setPixel(pixels, width, 10, 0, 255);

    const bounds = findVisibleBounds(pixels, width, height);
    expect(bounds.y).toBe(0);
    expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(15);
  });

  it("adds a safety margin around the detected garment so real edges are never clipped", () => {
    const width = 300;
    const height = 300;
    const pixels = transparentPixels(width, height);
    for (let y = 50; y < 250; y++) {
      for (let x = 50; x < 250; x++) {
        setPixel(pixels, width, x, y, 255);
      }
    }

    const bounds = findVisibleBounds(pixels, width, height);
    expect(bounds.x).toBeLessThan(50);
    expect(bounds.y).toBeLessThan(50);
    expect(bounds.x + bounds.width).toBeGreaterThan(250);
    expect(bounds.y + bounds.height).toBeGreaterThan(250);
  });
});

describe("softenCutoutEdges", () => {
  it("zeroes out fully transparent pixels", () => {
    const pixels = transparentPixels(1, 1);
    setPixel(pixels, 1, 0, 0, 5);
    softenCutoutEdges(pixels);
    expect(pixels[3]).toBe(0);
  });

  it("zeroes out pixels at the transparency threshold boundary", () => {
    const pixels = transparentPixels(1, 1);
    setPixel(pixels, 1, 0, 0, 12);
    softenCutoutEdges(pixels);
    expect(pixels[3]).toBe(0);
  });

  it("preserves partially transparent anti-aliased edge pixels instead of forcing them opaque", () => {
    const pixels = transparentPixels(1, 1);
    setPixel(pixels, 1, 0, 0, 180);
    softenCutoutEdges(pixels);
    expect(pixels[3]).toBe(180);
  });

  it("leaves fully opaque pixels untouched", () => {
    const pixels = transparentPixels(1, 1);
    setPixel(pixels, 1, 0, 0, 255);
    softenCutoutEdges(pixels);
    expect(pixels[3]).toBe(255);
  });
});
