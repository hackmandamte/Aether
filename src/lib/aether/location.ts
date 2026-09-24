/**
 * Location helpers for ETA orchestration.
 *
 * Prefers native bridge when available; falls back to browser geolocation.
 * For dependency chains (weather/nearby), uses a quiet read that does not
 * open the maps app. Exact coordinates stay in structured data only.
 */

export type LocationFix = {
  ok: true;
  lat: number;
  lng: number;
  /** Coarse string for speech — rounded, not full precision */
  approx: string;
  message: string;
  native: boolean;
};

export type LocationFailure = {
  ok: false;
  message: string;
  native: boolean;
};

export type LocationResult = LocationFix | LocationFailure;

/**
 * Quiet coordinates for weather/nearby deps — no maps UI.
 */
export async function getQuietLocation(): Promise<LocationResult> {
  if (typeof navigator !== "undefined" && navigator.geolocation) {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15_000,
          maximumAge: 60_000,
        });
      });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const approx = `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
      return {
        ok: true,
        lat,
        lng,
        approx,
        message: `You're around ${approx}.`,
        native: false,
      };
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? Number((err as GeolocationPositionError).code)
          : 0;
      if (code === 1) {
        return {
          ok: false,
          native: false,
          message: "Location permission denied. Allow it, then try again.",
        };
      }
      if (code === 2) {
        return { ok: false, native: false, message: "Location is unavailable right now." };
      }
      if (code === 3) {
        return { ok: false, native: false, message: "Location timed out. Try again outdoors." };
      }
    }
  }

  try {
    const { runPhoneAction } = await import("./native");
    const res = await runPhoneAction({ action: "location" });
    const coord = res.message.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
    if (res.ok && coord) {
      const lat = Number(coord[1]);
      const lng = Number(coord[2]);
      const approx = `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
      return {
        ok: true,
        lat,
        lng,
        approx,
        message: `You're around ${approx}.`,
        native: res.native,
      };
    }
    return {
      ok: false,
      native: res.native,
      message: res.message || "Couldn't get your location.",
    };
  } catch {
    return {
      ok: false,
      native: false,
      message: "Couldn't get your location.",
    };
  }
}

/**
 * User-facing location request — same fix, may open maps via native path.
 */
export async function getUserLocation(): Promise<LocationResult> {
  return getQuietLocation();
}

/** Sanitize for any text that might reach a model: never exact GPS. */
export function locationForModel(fix: LocationFix): { approx: string } {
  return { approx: fix.approx };
}
