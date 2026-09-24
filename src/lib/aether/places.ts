/**
 * Nearby places via OpenStreetMap Nominatim (no API key).
 * Results are real search hits — never invented businesses or distances.
 * Exact coordinates stay in structured data; spoken text uses names/distances only.
 */

export type PlaceHit = {
  name: string;
  category?: string;
  address?: string;
  /** Meters from query point when available */
  distanceM?: number;
  /** Internal only — do not put in model prompts */
  lat?: number;
  lng?: number;
};

export type PlacesResult =
  | { ok: true; places: PlaceHit[]; message: string; query: string }
  | { ok: false; message: string; query: string };

const QUERY_ALIASES: Record<string, string> = {
  shops: "shop",
  stores: "shop",
  shop: "shop",
  pharmacies: "pharmacy",
  pharmacy: "pharmacy",
  restaurants: "restaurant",
  restaurant: "restaurant",
  cafes: "cafe",
  cafe: "cafe",
  atms: "atm",
  atm: "atm",
  hospitals: "hospital",
  hospital: "hospital",
  places: "shop",
};

function normalizeQuery(raw: string): string {
  const key = raw.trim().toLowerCase();
  return QUERY_ALIASES[key] ?? (key || "shop");
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function formatMessage(query: string, places: PlaceHit[]): string {
  if (!places.length) {
    return `I couldn't find nearby ${query}.`;
  }
  const top = places.slice(0, 3);
  const bits = top.map((p, i) => {
    const dist = p.distanceM != null ? ` (${formatDistance(p.distanceM)})` : "";
    return `${i + 1}. ${p.name}${dist}`;
  });
  const nearest = places[0];
  const head =
    nearest.distanceM != null
      ? `Nearest ${query}: ${nearest.name}, about ${formatDistance(nearest.distanceM)}.`
      : `Nearby ${query}: ${nearest.name}.`;
  if (top.length === 1) return head;
  return `${head} Also: ${bits.slice(1).map((b) => b.replace(/^\d+\.\s*/, "")).join("; ")}.`;
}

export async function fetchNearbyPlaces(
  lat: number,
  lng: number,
  rawQuery: string,
  opts: { limit?: number; fetchImpl?: typeof fetch } = {},
): Promise<PlacesResult> {
  const query = normalizeQuery(rawQuery);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      ok: false,
      query,
      message: `Couldn't search for nearby ${query} without a location.`,
    };
  }

  const limit = Math.min(5, Math.max(1, opts.limit ?? 5));
  const fetchFn = opts.fetchImpl ?? fetch;
  const delta = 0.05;
  const left = lng - delta;
  const top = lat + delta;
  const right = lng + delta;
  const bottom = lat - delta;
  const viewbox = `${left},${top},${right},${bottom}`;

  const url =
    "https://nominatim.openstreetmap.org/search" +
    `?q=${encodeURIComponent(query)}` +
    `&format=json` +
    `&limit=${limit}` +
    `&viewbox=${encodeURIComponent(viewbox)}` +
    `&bounded=1` +
    `&addressdetails=1`;

  try {
    const res = await fetchFn(url, {
      signal: AbortSignal.timeout(12_000),
      headers: {
        Accept: "application/json",
        "User-Agent": "ETA-EverydayTasksAssistant/1.0 (local-assistant; not-for-bulk)",
      },
    });
    if (!res.ok) {
      return {
        ok: false,
        query,
        message: `Couldn't search for nearby ${query} right now.`,
      };
    }
    const json = (await res.json()) as Array<{
      display_name?: string;
      name?: string;
      lat?: string;
      lon?: string;
      type?: string;
      class?: string;
    }>;
    if (!Array.isArray(json) || json.length === 0) {
      return {
        ok: false,
        query,
        message: `I couldn't find nearby ${query}.`,
      };
    }

    const places: PlaceHit[] = [];
    for (const row of json) {
      const plat = row.lat != null ? Number(row.lat) : NaN;
      const plng = row.lon != null ? Number(row.lon) : NaN;
      const name =
        (row.name && row.name.trim()) ||
        (row.display_name ? row.display_name.split(",")[0]?.trim() : "") ||
        "Unknown place";
      const hit: PlaceHit = {
        name,
        category: row.type || row.class,
        address: row.display_name,
      };
      if (Number.isFinite(plat) && Number.isFinite(plng)) {
        hit.lat = plat;
        hit.lng = plng;
        hit.distanceM = Math.round(haversineM(lat, lng, plat, plng));
      }
      places.push(hit);
    }
    places.sort((a, b) => (a.distanceM ?? 1e12) - (b.distanceM ?? 1e12));

    return {
      ok: true,
      query,
      places,
      message: formatMessage(query, places),
    };
  } catch {
    return {
      ok: false,
      query,
      message: `Couldn't reach the places service for ${query}.`,
    };
  }
}

export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  return haversineM(lat1, lon1, lat2, lon2);
}
