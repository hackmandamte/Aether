/**
 * Tool router — routes info tools vs phone_action to the right implementation.
 * Application remains the execution authority.
 */

import type { PhoneAction, ToolCall, ToolName, ToolResult } from "./types";
import { TOOL_TIMEOUT_MS } from "./types";
import { etaLog } from "./log";

export type RouterOptions = {
  shouldContinue?: () => boolean;
  signal?: AbortSignal;
};

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function routeTool(call: ToolCall, opts: RouterOptions = {}): Promise<ToolResult> {
  if (opts.shouldContinue && !opts.shouldContinue()) {
    return { ok: false, tool: call.tool, callId: call.id, error: "Cancelled.", retryable: false };
  }
  if (opts.signal?.aborted) {
    return { ok: false, tool: call.tool, callId: call.id, error: "Cancelled.", retryable: false };
  }

  etaLog(`Tool ${call.tool}`, { callId: call.id });

  try {
    const result = await withTimeout(dispatch(call), TOOL_TIMEOUT_MS, call.tool);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Tool failed.";
    return {
      ok: false,
      tool: call.tool,
      callId: call.id,
      error: msg,
      retryable: /timeout|network|unavailable|reach/i.test(msg),
    };
  }
}

async function dispatch(call: ToolCall): Promise<ToolResult> {
  switch (call.tool) {
    case "get_date": {
      const { formatDateMessage, getLocalDateTime } = await import("./datetime");
      const info = getLocalDateTime();
      return {
        ok: true,
        tool: "get_date",
        callId: call.id,
        message: formatDateMessage(info),
        data: { date: info.dateLabel, timezone: info.timezone, iso: info.iso },
      };
    }
    case "get_time": {
      const { formatTimeMessage, getLocalDateTime } = await import("./datetime");
      const info = getLocalDateTime();
      return {
        ok: true,
        tool: "get_time",
        callId: call.id,
        message: formatTimeMessage(info),
        data: { time: info.timeLabel, timezone: info.timezone, iso: info.iso },
      };
    }
    case "get_location": {
      const { getUserLocation } = await import("./location");
      const fix = await getUserLocation();
      if (!fix.ok) {
        return {
          ok: false,
          tool: "get_location",
          callId: call.id,
          error: fix.message,
          retryable: true,
        };
      }
      return {
        ok: true,
        tool: "get_location",
        callId: call.id,
        message: fix.message,
        data: { approx: fix.approx, lat: fix.lat, lng: fix.lng },
      };
    }
    case "get_weather": {
      const { fetchWeather } = await import("./weather");
      const lat = Number(call.args?.lat);
      const lng = Number(call.args?.lng);
      const approx = typeof call.args?.approx === "string" ? call.args.approx : undefined;
      const result = await fetchWeather(lat, lng, { locationLabel: approx });
      if (!result.ok) {
        return {
          ok: false,
          tool: "get_weather",
          callId: call.id,
          error: result.message,
          retryable: true,
        };
      }
      return {
        ok: true,
        tool: "get_weather",
        callId: call.id,
        message: result.message,
        data: {
          temperatureC: result.snapshot.temperatureC,
          condition: result.snapshot.condition,
          source: result.snapshot.source,
        },
      };
    }
    case "search_nearby": {
      const { fetchNearbyPlaces } = await import("./places");
      const lat = Number(call.args?.lat);
      const lng = Number(call.args?.lng);
      const query = String(call.args?.query ?? "places");
      const result = await fetchNearbyPlaces(lat, lng, query);
      if (!result.ok) {
        return {
          ok: false,
          tool: "search_nearby",
          callId: call.id,
          error: result.message,
          retryable: true,
        };
      }
      return {
        ok: true,
        tool: "search_nearby",
        callId: call.id,
        message: result.message,
        data: {
          query: result.query,
          names: result.places.map((p) => p.name),
          topName: result.places[0]?.name,
          topDistanceM: result.places[0]?.distanceM,
          topLat: result.places[0]?.lat,
          topLng: result.places[0]?.lng,
          places: result.places.slice(0, 5).map((p) => ({
            name: p.name,
            distanceM: p.distanceM,
            category: p.category,
          })),
        },
      };
    }
    case "phone_action": {
      if (!call.phoneAction) {
        return {
          ok: false,
          tool: "phone_action",
          callId: call.id,
          error: "Missing phone action.",
          retryable: false,
        };
      }
      const { runPhoneAction } = await import("./native");
      const res = await runPhoneAction(call.phoneAction);
      return {
        ok: res.ok,
        tool: "phone_action",
        callId: call.id,
        message: res.message,
        error: res.ok ? undefined : res.message,
        data: { action: call.phoneAction.action },
        retryable: !res.ok,
      };
    }
    default:
      return {
        ok: false,
        tool: call.tool,
        callId: call.id,
        error: `Unknown tool: ${call.tool}`,
        retryable: false,
      };
  }
}

export function toolForTaskType(type: string): ToolName | undefined {
  switch (type) {
    case "date":
      return "get_date";
    case "time":
      return "get_time";
    case "location":
      return "get_location";
    case "weather":
      return "get_weather";
    case "nearby":
      return "search_nearby";
    case "phone_action":
      return "phone_action";
    default:
      return undefined;
  }
}

export function phoneActionCall(id: string, action: PhoneAction): ToolCall {
  return { id, tool: "phone_action", phoneAction: action };
}
