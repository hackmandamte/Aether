/**
 * Weather via Open-Meteo (no API key; coords stay on-device / this process).
 * Never invents conditions — returns failure if the request fails.
 */

export type WeatherSnapshot = {
  temperatureC: number;
  feelsLikeC?: number;
  humidityPct?: number;
  windKmh?: number;
  /** Human-readable condition from WMO code */
  condition: string;
  weatherCode: number;
  /** Coarse location label only (no exact coords in message) */
  locationLabel?: string;
  source: "open-meteo";
  fetchedAt: string;
};

export type WeatherResult =
  | { ok: true; snapshot: WeatherSnapshot; message: string }
  | { ok: false; message: string };

/** WMO Weather interpretation codes (Open-Meteo). */
function conditionFromCode(code: number): string {
  if (code === 0) return "clear";
  if (code === 1 || code === 2) return "partly cloudy";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "foggy";
  if (code >= 51 && code <= 57) return "drizzle";
  if (code >= 61 && code <= 67) return "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "rain showers";
  if (code >= 85 && code <= 86) return "snow showers";
  if (code >= 95 && code <= 99) return "thunderstorm";
  return "unknown conditions";
}

function formatMessage(s: WeatherSnapshot): string {
  const bits = [
    `It's ${Math.round(s.temperatureC)}°C and ${s.condition}`,
  ];
  if (s.feelsLikeC != null && Math.abs(s.feelsLikeC - s.temperatureC) >= 1.5) {
    bits.push(`feels like ${Math.round(s.feelsLikeC)}°C`);
  }
  if (s.humidityPct != null) bits.push(`humidity ${Math.round(s.humidityPct)}%`);
  if (s.windKmh != null) bits.push(`wind ${Math.round(s.windKmh)} km/h`);
  if (s.locationLabel) bits.push(`near ${s.locationLabel}`);
  return bits.join(", ") + ".";
}

/**
 * Fetch current weather for lat/lng. Coords are not included in the spoken message.
 */
export async function fetchWeather(
  lat: number,
  lng: number,
  opts: { locationLabel?: string; fetchImpl?: typeof fetch } = {},
): Promise<WeatherResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, message: "Couldn't check the weather without a location." };
  }

  const fetchFn = opts.fetchImpl ?? fetch;
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${encodeURIComponent(String(lat))}` +
    `&longitude=${encodeURIComponent(String(lng))}` +
    "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m" +
    "&wind_speed_unit=kmh" +
    "&timezone=auto";

  try {
    const res = await fetchFn(url, {
      signal: AbortSignal.timeout(12_000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return { ok: false, message: "Weather service is unavailable right now." };
    }
    const json = (await res.json()) as {
      current?: {
        temperature_2m?: number;
        apparent_temperature?: number;
        relative_humidity_2m?: number;
        weather_code?: number;
        wind_speed_10m?: number;
      };
    };
    const cur = json.current;
    if (!cur || typeof cur.temperature_2m !== "number") {
      return { ok: false, message: "Weather data was incomplete." };
    }
    const code = typeof cur.weather_code === "number" ? cur.weather_code : -1;
    const snapshot: WeatherSnapshot = {
      temperatureC: cur.temperature_2m,
      feelsLikeC: typeof cur.apparent_temperature === "number" ? cur.apparent_temperature : undefined,
      humidityPct:
        typeof cur.relative_humidity_2m === "number" ? cur.relative_humidity_2m : undefined,
      windKmh: typeof cur.wind_speed_10m === "number" ? cur.wind_speed_10m : undefined,
      condition: conditionFromCode(code),
      weatherCode: code,
      locationLabel: opts.locationLabel,
      source: "open-meteo",
      fetchedAt: new Date().toISOString(),
    };
    return { ok: true, snapshot, message: formatMessage(snapshot) };
  } catch {
    return { ok: false, message: "Couldn't reach the weather service." };
  }
}

/** Pure helper for tests — map WMO codes without network. */
export function weatherConditionFromCode(code: number): string {
  return conditionFromCode(code);
}
