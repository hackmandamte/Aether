/**
 * Tool router — Native Android, information tools, web, and optional MCP.
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

  const mcpName =
    typeof call.args?.mcpFullName === "string"
      ? call.args.mcpFullName
      : typeof call.args?.fullName === "string"
        ? call.args.fullName
        : null;

  etaLog(`Tool ${call.tool}`, { callId: call.id });

  try {
    if (mcpName) {
      return await withTimeout(dispatchMcp(String(mcpName), call, opts), TOOL_TIMEOUT_MS, "mcp");
    }
    return await withTimeout(dispatch(call), TOOL_TIMEOUT_MS, call.tool);
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

async function dispatchMcp(
  fullName: string,
  call: ToolCall,
  opts: RouterOptions,
): Promise<ToolResult> {
  const { invokeMcpTool, isMcpToolName } = await import("./mcp/manager");
  if (!isMcpToolName(fullName)) {
    return {
      ok: false,
      tool: call.tool,
      callId: call.id,
      error: "Invalid MCP tool name.",
      retryable: false,
    };
  }
  const args = { ...(call.args ?? {}) };
  delete args.mcpFullName;
  delete args.fullName;
  const res = await invokeMcpTool(fullName, args, { signal: opts.signal });
  if (!res.ok) {
    return {
      ok: false,
      tool: call.tool,
      callId: call.id,
      error: res.error,
      retryable: res.retryable,
      data: { source: "mcp", server: res.server, tool: res.tool },
    };
  }
  const data = res.data as { summary?: string } | undefined;
  return {
    ok: true,
    tool: call.tool,
    callId: call.id,
    message: data?.summary ?? "MCP tool completed.",
    data: { source: "mcp", server: res.server, tool: res.tool, untrusted: true },
  };
}

async function dispatch(call: ToolCall): Promise<ToolResult> {
  switch (call.tool) {
    case "get_current_datetime":
    case "get_date":
    case "get_time": {
      const { formatDateMessage, formatTimeMessage, getLocalDateTime } = await import("./datetime");
      const info = getLocalDateTime();
      if (call.tool === "get_current_datetime") {
        return {
          ok: true,
          tool: call.tool,
          callId: call.id,
          message: `${formatDateMessage(info)} ${formatTimeMessage(info)}`,
          data: {
            date: info.dateLabel,
            time: info.timeLabel,
            timezone: info.timezone,
            iso: info.iso,
            dayOfWeek: info.dateLabel.split(",")[0],
          },
        };
      }
      if (call.tool === "get_date") {
        return {
          ok: true,
          tool: call.tool,
          callId: call.id,
          message: formatDateMessage(info),
          data: { date: info.dateLabel, timezone: info.timezone, iso: info.iso },
        };
      }
      return {
        ok: true,
        tool: call.tool,
        callId: call.id,
        message: formatTimeMessage(info),
        data: { time: info.timeLabel, timezone: info.timezone, iso: info.iso },
      };
    }
    case "get_current_location":
    case "get_location": {
      const { getUserLocation } = await import("./location");
      const fix = await getUserLocation();
      if (!fix.ok) {
        return { ok: false, tool: call.tool, callId: call.id, error: fix.message, retryable: true };
      }
      return {
        ok: true,
        tool: call.tool,
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
          tool: call.tool,
          callId: call.id,
          error: result.message,
          retryable: true,
        };
      }
      return {
        ok: true,
        tool: call.tool,
        callId: call.id,
        message: result.message,
        data: {
          temperatureC: result.snapshot.temperatureC,
          feelsLikeC: result.snapshot.feelsLikeC,
          humidityPct: result.snapshot.humidityPct,
          windKmh: result.snapshot.windKmh,
          condition: result.snapshot.condition,
          source: result.snapshot.source,
        },
      };
    }
    case "search_nearby_places":
    case "search_nearby": {
      const { fetchNearbyPlaces } = await import("./places");
      const lat = Number(call.args?.lat);
      const lng = Number(call.args?.lng);
      const query = String(call.args?.query ?? "places");
      const result = await fetchNearbyPlaces(lat, lng, query);
      if (!result.ok) {
        return {
          ok: false,
          tool: call.tool,
          callId: call.id,
          error: result.message,
          retryable: true,
        };
      }
      return {
        ok: true,
        tool: call.tool,
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
            address: p.address,
          })),
        },
      };
    }
    case "web_search": {
      const { webSearch } = await import("./web-search");
      const q = String(call.args?.query ?? call.args?.q ?? "");
      const result = await webSearch(q);
      if (!result.ok) {
        return { ok: false, tool: "web_search", callId: call.id, error: result.message, retryable: true };
      }
      return {
        ok: true,
        tool: "web_search",
        callId: call.id,
        message: result.message,
        data: { query: result.query, hits: result.hits, untrusted: true },
      };
    }
    case "open_url": {
      const url = String(call.args?.url ?? call.phoneAction?.target ?? "");
      const { runPhoneAction } = await import("./native");
      const res = await runPhoneAction({ action: "open_url", target: url });
      return {
        ok: res.ok,
        tool: "open_url",
        callId: call.id,
        message: res.message,
        error: res.ok ? undefined : res.message,
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
      return "get_current_location";
    case "weather":
      return "get_weather";
    case "nearby":
      return "search_nearby_places";
    case "phone_action":
      return "phone_action";
    default:
      return undefined;
  }
}

export function phoneActionCall(id: string, action: PhoneAction): ToolCall {
  return { id, tool: "phone_action", phoneAction: action };
}
