import { describe, expect, it, vi } from "vitest";
import { fetchCurrentWeather, mapWmoCode } from "./weather.js";

describe("mapWmoCode", () => {
  it("maps WMO codes to weather conditions", () => {
    expect(mapWmoCode(0)).toBe("clear");
    expect(mapWmoCode(2)).toBe("clouds");
    expect(mapWmoCode(45)).toBe("fog");
    expect(mapWmoCode(53)).toBe("drizzle");
    expect(mapWmoCode(61)).toBe("rain");
    expect(mapWmoCode(65)).toBe("heavy_rain");
    expect(mapWmoCode(82)).toBe("heavy_rain");
    expect(mapWmoCode(73)).toBe("snow");
    expect(mapWmoCode(95)).toBe("thunderstorm");
    expect(mapWmoCode(99)).toBe("thunderstorm");
  });
});

describe("fetchCurrentWeather", () => {
  it("returns the mapped condition from the Open-Meteo response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ current_weather: { weathercode: 61 } }),
    });

    const result = await fetchCurrentWeather(-3.73, -38.52, {
      fetch: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toBe("rain");
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("latitude=-3.73");
  });

  it("returns undefined on a non-ok response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    expect(
      await fetchCurrentWeather(0, 0, { fetch: fetchImpl as unknown as typeof fetch }),
    ).toBeUndefined();
  });

  it("returns undefined when the request throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    expect(
      await fetchCurrentWeather(0, 0, { fetch: fetchImpl as unknown as typeof fetch }),
    ).toBeUndefined();
  });

  it("returns undefined when the payload has no weather code", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    expect(
      await fetchCurrentWeather(0, 0, { fetch: fetchImpl as unknown as typeof fetch }),
    ).toBeUndefined();
  });
});
