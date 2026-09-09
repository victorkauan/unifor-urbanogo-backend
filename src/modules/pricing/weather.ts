import type { WeatherCondition } from "./pricing-multipliers.js";

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const DEFAULT_TIMEOUT_MS = 2000;

export function mapWmoCode(code: number): WeatherCondition {
  if (code === 0) return "clear";
  if (code <= 3) return "clouds";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if (code === 61 || code === 63 || code === 80) return "rain";
  if (code === 65 || code === 66 || code === 67 || code === 81 || code === 82) return "heavy_rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "thunderstorm";
  return "clouds";
}

export interface FetchWeatherDeps {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export async function fetchCurrentWeather(
  lat: number,
  lng: number,
  deps: FetchWeatherDeps = {},
): Promise<WeatherCondition | undefined> {
  const fetchImpl = deps.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const url = `${OPEN_METEO_URL}?latitude=${lat}&longitude=${lng}&current_weather=true`;
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) {
      return undefined;
    }

    const body = (await response.json()) as { current_weather?: { weathercode?: number } };
    const code = body.current_weather?.weathercode;
    return typeof code === "number" ? mapWmoCode(code) : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
