import { describe, expect, it } from "vitest";
import { boundingBox, haversineKm } from "./geo.js";

describe("haversineKm", () => {
  it("is zero for the same point", () => {
    expect(haversineKm({ lat: -3.73, lng: -38.52 }, { lat: -3.73, lng: -38.52 })).toBe(0);
  });

  it("matches a known distance (Fortaleza to São Paulo, ~2350 km)", () => {
    const fortaleza = { lat: -3.7319, lng: -38.5267 };
    const saoPaulo = { lat: -23.5505, lng: -46.6333 };
    expect(haversineKm(fortaleza, saoPaulo)).toBeCloseTo(2367, -2);
  });

  it("approximates 111 km per degree of latitude near the equator", () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.19, 1);
  });

  it("is symmetric", () => {
    const a = { lat: -3.73, lng: -38.52 };
    const b = { lat: -3.75, lng: -38.49 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10);
  });

  it("orders points by increasing distance from an origin", () => {
    const origin = { lat: 0, lng: 0 };
    const near = { lat: 0, lng: 0.01 };
    const mid = { lat: 0, lng: 0.05 };
    const far = { lat: 0, lng: 0.2 };
    const distances = [far, near, mid].map((p) => haversineKm(origin, p));
    expect([...distances].sort((x, y) => x - y)).toEqual([
      haversineKm(origin, near),
      haversineKm(origin, mid),
      haversineKm(origin, far),
    ]);
  });
});

describe("boundingBox", () => {
  it("brackets the center by the latitude delta", () => {
    const box = boundingBox({ lat: 0, lng: 0 }, 111.045);
    expect(box.minLat).toBeCloseTo(-1, 6);
    expect(box.maxLat).toBeCloseTo(1, 6);
  });

  it("widens the longitude span as latitude increases", () => {
    const atEquator = boundingBox({ lat: 0, lng: 0 }, 100);
    const atSixty = boundingBox({ lat: 60, lng: 0 }, 100);
    const equatorSpan = atEquator.maxLng - atEquator.minLng;
    const sixtySpan = atSixty.maxLng - atSixty.minLng;
    expect(sixtySpan).toBeGreaterThan(equatorSpan * 1.9);
  });

  it("contains every point within the radius", () => {
    const center = { lat: -3.7319, lng: -38.5267 };
    const radiusKm = 5;
    const box = boundingBox(center, radiusKm);
    for (let bearing = 0; bearing < 360; bearing += 15) {
      const rad = (bearing * Math.PI) / 180;
      const dLat = (radiusKm / 111.045) * Math.cos(rad);
      const dLng = (radiusKm / (111.045 * Math.cos((center.lat * Math.PI) / 180))) * Math.sin(rad);
      const point = { lat: center.lat + dLat, lng: center.lng + dLng };
      expect(point.lat).toBeGreaterThanOrEqual(box.minLat);
      expect(point.lat).toBeLessThanOrEqual(box.maxLat);
      expect(point.lng).toBeGreaterThanOrEqual(box.minLng);
      expect(point.lng).toBeLessThanOrEqual(box.maxLng);
    }
  });

  it("clamps to valid coordinate ranges for a large radius", () => {
    const box = boundingBox({ lat: 80, lng: 170 }, 5000);
    expect(box.minLat).toBeGreaterThanOrEqual(-90);
    expect(box.maxLat).toBeLessThanOrEqual(90);
    expect(box.minLng).toBeGreaterThanOrEqual(-180);
    expect(box.maxLng).toBeLessThanOrEqual(180);
  });
});
