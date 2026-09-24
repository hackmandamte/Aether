/**
 * Multi-task orchestration for ETA.
 *
 * USER → (optional STT) → planTasks → task graph → concurrent/dependent
 * execution → structured results → synthesized reply.
 *
 * Phone actions stay on the native pipeline. Info tasks (date/time/location/
 * weather/nearby) are first-class. Weather and nearby use real providers
 * (Open-Meteo, Nominatim) — never invented data.
 */

import { formatDateMessage, formatTimeMessage, getLocalDateTime } from "./datetime";
import { getQuietLocation, getUserLocation } from "./location";
import { fetchNearbyPlaces } from "./places";
import type {
  PhoneAction,
  PhoneActionName,
  Task,
  TaskResult,
  TaskStatus,
} from "./types";
import { MAX_CONCURRENT_TASKS, MAX_TASKS_PER_TURN } from "./types";
import { fetchWeather } from "./weather";

async function runPhoneAction(action: import("./types").PhoneAction) {
  const { runPhoneAction: run } = await import("./native");
  return run(action);
}

export type PlanOptions = {
  language?: string;
};

export type RunOptions = {
  shouldContinue?: () => boolean;
  onStep?: (message: string) => void;
  onTask?: (task: Task) => void;
};

const ACTION_KEYWORDS: Array<{
  re: RegExp;
  action: PhoneActionName;
  value?: string;
  targetFrom?: (m: RegExpMatchArray, text: string) => string | undefined;
}> = [
  { re: /\b(turn\s+on|enable|switch\s+on)\s+(the\s+)?(flash\s*light|torch)\b/i, action: "flashlight_on" },
  { re: /\b(turn\s+off|disable|switch\s+off)\s+(the\s+)?(flash\s*light|torch)\b/i, action: "flashlight_off" },
  { re: /\b(flash\s*light|torch)\s+on\b/i, action: "flashlight_on" },
  { re: /\b(flash\s*light|torch)\s+off\b/i, action: "flashlight_off" },
  {
    re: /\b(turn\s+on|enable|switch\s+on)\s+(the\s+)?(wi-?fi|wifi)\b/i,
    action: "wifi",
    value: "on",
  },
  {
    re: /\b(turn\s+off|disable|switch\s+off)\s+(the\s+)?(wi-?fi|wifi)\b/i,
    action: "wifi",
    value: "off",
  },
  {
    re: /\b(turn\s+on|enable|switch\s+on)\s+(the\s+)?bluetooth\b/i,
    action: "bluetooth",
    value: "on",
  },
  {
    re: /\b(turn\s+off|disable|switch\s+off)\s+(the\s+)?bluetooth\b/i,
    action: "bluetooth",
    value: "off",
  },
  {
    re: /\b(turn\s+on|enable|switch\s+on)\s+(the\s+)?hotspot\b/i,
    action: "hotspot",
    value: "on",
  },
  {
    re: /\b(turn\s+off|disable|switch\s+off)\s+(the\s+)?hotspot\b/i,
    action: "hotspot",
    value: "off",
  },
  {
    re: /\bopen\s+(?:the\s+)?(?:app\s+)?([a-z0-9][\w\s.-]{0,40}?)(?:\s|$|,|\.|and)/i,
    action: "open_app",
    targetFrom: (m) => m[1]?.trim(),
  },
  {
    re: /\b(volume|brightness)\s+(?:to\s+)?(\d{1,3})\b/i,
    action: "volume",
    targetFrom: (m) => m[2],
  },
];

function newId(prefix: string, n: number): string {
  return `${prefix}_${n}`;
}

function wantsDate(text: string): boolean {
  return /\b(today'?s?\s+date|what(?:'?s| is)\s+(?:the\s+)?date|current\s+date|tell\s+me\s+(?:the\s+)?date)\b/i.test(
    text,
  );
}

function wantsTime(text: string): boolean {
  return /\b(current\s+time|what(?:'?s| is)\s+(?:the\s+)?time|tell\s+me\s+(?:the\s+)?time|what\s+time\s+is\s+it)\b/i.test(
    text,
  );
}

function wantsLocation(text: string): boolean {
  return /\b(where\s+am\s+i|my\s+(?:current\s+)?location|current\s+location|tell\s+me\s+(?:my\s+)?location)\b/i.test(
    text,
  );
}

function wantsWeather(text: string): boolean {
  return /\b(weather|temperature|forecast|how\s+(?:hot|cold|warm)\s+is\s+it)\b/i.test(text);
}

function wantsNearby(text: string): { query: string } | null {
  const m = text.match(
    /\b(?:nearest|nearby|close(?:st)?|around\s+me)\s+([a-z0-9][\w\s-]{0,40}?)(?:\s|$|,|\.|and)/i,
  );
  if (m) return { query: m[1].trim() };
  if (/\b(shops|stores|pharmacies|restaurants|cafes?|atms?|hospitals?)\s+(?:near|around|close)/i.test(text)) {
    const q = text.match(/\b(shops|stores|pharmacies|restaurants|cafes?|atms?|hospitals?)\b/i);
    return { query: q?.[1] ?? "places" };
  }
  if (/\b(find|show)\s+(?:me\s+)?(?:the\s+)?(?:nearest|nearby)\b/i.test(text)) {
    return { query: "places" };
  }
  return null;
}

function wantsNavigateToNearby(text: string): { query: string } | null {
  const m = text.match(
    /\b(?:take\s+me\s+to|navigate\s+(?:me\s+)?to|directions?\s+to)\s+(?:the\s+)?(?:nearest|nearby)\s+([a-z0-9][\w\s-]{0,40}?)(?:\s|$|,|\.)/i,
  );
  if (m) return { query: m[1].trim() };
  return null;
}

export function planTasks(userText: string, _opts: PlanOptions = {}): Task[] {
  const text = userText.trim();
  if (!text) return [];

  const tasks: Task[] = [];
  let n = 0;
  const push = (partial: Omit<Task, "id" | "status">): Task => {
    const t: Task = { id: newId("t", ++n), status: "pending", ...partial };
    tasks.push(t);
    return t;
  };

  if (wantsDate(text)) {
    push({ type: "date", label: "Getting today's date" });
  }
  if (wantsTime(text)) {
    push({ type: "time", label: "Getting the current time" });
  }

  const needLoc = wantsLocation(text);
  const weather = wantsWeather(text);
  const nearby = wantsNearby(text);
  const navNearby = wantsNavigateToNearby(text);

  let locTask: Task | undefined;
  if (needLoc || weather || nearby || navNearby) {
    locTask = push({
      type: "location",
      label: "Getting your location",
    });
  }

  if (weather) {
    push({
      type: "weather",
      label: "Checking weather",
      dependsOn: locTask ? [locTask.id] : undefined,
    });
  }

  let nearbyTask: Task | undefined;
  if (nearby || navNearby) {
    const q = (nearby ?? navNearby)!.query;
    nearbyTask = push({
      type: "nearby",
      label: `Finding nearby ${q}`,
      input: { query: q },
      dependsOn: locTask ? [locTask.id] : undefined,
    });
  }

  if (navNearby && nearbyTask) {
    push({
      type: "phone_action",
      label: `Navigating to nearest ${navNearby.query}`,
      phoneAction: { action: "navigate", target: navNearby.query },
      dependsOn: [nearbyTask.id],
      input: { useNearbyResult: true },
    });
  }

  if (!navNearby) {
    const nav = text.match(/\bnavigate\s+(?:me\s+)?(?:to\s+)?(.+?)(?:\.|$)/i);
    if (nav && nav[1] && !/\bnearest|nearby\b/i.test(nav[1])) {
      push({
        type: "phone_action",
        label: `Navigating to ${nav[1].trim().slice(0, 40)}`,
        phoneAction: { action: "navigate", target: nav[1].trim() },
      });
    }
  }

  for (const rule of ACTION_KEYWORDS) {
    const m = text.match(rule.re);
    if (!m) continue;
    let action = rule.action;
    let value = rule.value;
    let target = rule.targetFrom?.(m, text);

    if (/\bbrightness\b/i.test(m[0] ?? "") || (m[1] && /brightness/i.test(m[1]))) {
      action = "brightness";
    } else if (/\bvolume\b/i.test(m[0] ?? "") || (m[1] && /volume/i.test(m[1]))) {
      action = "volume";
    }

    if (action === "open_app" && target && /^(maps?|weather)$/i.test(target) && (nearby || weather)) {
      continue;
    }

    const phoneAction: PhoneAction = { action };
    if (value !== undefined) phoneAction.value = value;
    if (target) phoneAction.target = target;
    if (action === "volume" || action === "brightness") {
      phoneAction.value = target ?? value;
      phoneAction.target = undefined;
    }

    if (
      tasks.some(
        (t) =>
          t.type === "phone_action" &&
          t.phoneAction?.action === phoneAction.action &&
          String(t.phoneAction?.value ?? "") === String(phoneAction.value ?? "") &&
          String(t.phoneAction?.target ?? "") === String(phoneAction.target ?? ""),
      )
    ) {
      continue;
    }

    push({
      type: "phone_action",
      label: `Doing: ${action.replace(/_/g, " ")}`,
      phoneAction,
    });
  }

  if (tasks.length > MAX_TASKS_PER_TURN) {
    return tasks.slice(0, MAX_TASKS_PER_TURN);
  }

  if (tasks.length === 0) return [];
  return tasks;
}

function formatDate(): TaskResult {
  const info = getLocalDateTime();
  return {
    ok: true,
    message: formatDateMessage(info),
    data: {
      date: info.dateLabel,
      iso: info.iso,
      timezone: info.timezone,
      timestamp: info.timestamp,
    },
  };
}

function formatTime(): TaskResult {
  const info = getLocalDateTime();
  return {
    ok: true,
    message: formatTimeMessage(info),
    data: {
      time: info.timeLabel,
      iso: info.iso,
      timezone: info.timezone,
      timestamp: info.timestamp,
    },
  };
}

async function runLocation(_explicit: boolean): Promise<TaskResult> {
  const fix = await getUserLocation();
  if (!fix.ok) {
    return { ok: false, message: fix.message };
  }
  return {
    ok: true,
    message: fix.message,
    data: {
      lat: fix.lat,
      lng: fix.lng,
      approx: fix.approx,
    },
  };
}

function coordsFromDeps(deps: Map<string, Task>): { lat?: number; lng?: number; approx?: string } {
  for (const t of deps.values()) {
    if (t.type === "location" && t.result?.ok && t.result.data) {
      return {
        lat: t.result.data.lat as number | undefined,
        lng: t.result.data.lng as number | undefined,
        approx: t.result.data.approx as string | undefined,
      };
    }
  }
  return {};
}

async function runWeather(deps: Map<string, Task>): Promise<TaskResult> {
  const { lat, lng, approx } = coordsFromDeps(deps);
  if (lat == null || lng == null) {
    return { ok: false, message: "Couldn't check the weather without a location." };
  }
  const result = await fetchWeather(lat, lng, { locationLabel: approx });
  if (!result.ok) {
    return { ok: false, message: result.message };
  }
  return {
    ok: true,
    message: result.message,
    data: {
      temperatureC: result.snapshot.temperatureC,
      condition: result.snapshot.condition,
      source: result.snapshot.source,
    },
  };
}

async function runNearby(task: Task, deps: Map<string, Task>): Promise<TaskResult> {
  const query =
    (task.input && typeof task.input === "object" && "query" in task.input
      ? String((task.input as { query: string }).query)
      : "places") || "places";

  const { lat, lng } = coordsFromDeps(deps);
  if (lat == null || lng == null) {
    return { ok: false, message: `Couldn't search for nearby ${query} without a location.` };
  }

  const result = await fetchNearbyPlaces(lat, lng, query);
  if (!result.ok) {
    return { ok: false, message: result.message, data: { query } };
  }

  const top = result.places[0];
  return {
    ok: true,
    message: result.message,
    data: {
      query: result.query,
      count: result.places.length,
      names: result.places.map((p) => p.name),
      topName: top?.name,
      topLat: top?.lat,
      topLng: top?.lng,
      topDistanceM: top?.distanceM,
    },
  };
}

async function runNavigateFromNearby(
  task: Task,
  byId: Map<string, Task>,
): Promise<TaskResult> {
  let target = task.phoneAction?.target;
  for (const depId of task.dependsOn ?? []) {
    const dep = byId.get(depId);
    if (dep?.type === "nearby" && dep.result?.ok && dep.result.data?.topName) {
      const name = String(dep.result.data.topName);
      const lat = dep.result.data.topLat as number | undefined;
      const lng = dep.result.data.topLng as number | undefined;
      if (lat != null && lng != null) {
        target = `${lat},${lng}`;
      } else {
        target = name;
      }
      break;
    }
  }
  if (!target) {
    return { ok: false, message: "Nowhere to navigate to." };
  }
  const res = await runPhoneAction({ action: "navigate", target });
  return {
    ok: res.ok,
    message: res.ok ? `Navigating to ${target.includes(",") ? "that place" : target}.` : res.message,
  };
}

async function executeOne(task: Task, byId: Map<string, Task>): Promise<Task> {
  const next: Task = { ...task, status: "running" };
  try {
    let result: TaskResult;
    switch (task.type) {
      case "date":
        result = formatDate();
        break;
      case "time":
        result = formatTime();
        break;
      case "location":
        result = await runLocation(true);
        break;
      case "weather":
        result = await runWeather(byId);
        break;
      case "nearby":
        result = await runNearby(task, byId);
        break;
      case "phone_action":
        if (!task.phoneAction) {
          result = { ok: false, message: "Missing phone action." };
        } else if (
          task.phoneAction.action === "navigate" &&
          task.input &&
          typeof task.input === "object" &&
          "useNearbyResult" in (task.input as object)
        ) {
          result = await runNavigateFromNearby(task, byId);
        } else {
          const res = await runPhoneAction(task.phoneAction);
          result = { ok: res.ok, message: res.message };
        }
        break;
      default:
        result = { ok: false, message: "Unknown task type." };
    }
    next.result = result;
    next.status = result.ok ? "completed" : "failed";
    if (!result.ok) next.error = result.message;
  } catch (err) {
    next.status = "failed";
    next.error = err instanceof Error ? err.message : "Task failed.";
    next.result = { ok: false, message: next.error };
  }
  return next;
}

function depsSatisfied(task: Task, byId: Map<string, Task>): "ready" | "blocked" | "wait" {
  if (!task.dependsOn?.length) return "ready";
  for (const id of task.dependsOn) {
    const dep = byId.get(id);
    if (!dep) return "blocked";
    if (dep.status === "failed" || dep.status === "blocked") return "blocked";
    if (dep.status !== "completed") return "wait";
  }
  return "ready";
}

export async function runTaskGraph(tasks: Task[], opts: RunOptions = {}): Promise<Task[]> {
  const byId = new Map(tasks.map((t) => [t.id, { ...t, status: "pending" as TaskStatus }]));
  const remaining = new Set(byId.keys());

  opts.onStep?.("Planning tasks\u2026");

  while (remaining.size > 0) {
    if (opts.shouldContinue && !opts.shouldContinue()) break;

    const ready: Task[] = [];
    for (const id of remaining) {
      const t = byId.get(id)!;
      if (t.status !== "pending") continue;
      const state = depsSatisfied(t, byId);
      if (state === "blocked") {
        const blocked: Task = {
          ...t,
          status: "blocked",
          error: "Blocked because a required step failed.",
          result: { ok: false, message: "Blocked because a required step failed." },
        };
        byId.set(id, blocked);
        remaining.delete(id);
        opts.onTask?.(blocked);
      } else if (state === "ready") {
        ready.push(t);
      }
    }

    if (ready.length === 0) {
      if ([...remaining].every((id) => byId.get(id)?.status === "pending")) {
        for (const id of [...remaining]) {
          const t = byId.get(id)!;
          const blocked: Task = {
            ...t,
            status: "blocked",
            error: "Could not run this step.",
            result: { ok: false, message: "Could not run this step." },
          };
          byId.set(id, blocked);
          remaining.delete(id);
        }
      }
      break;
    }

    const batch = ready.slice(0, MAX_CONCURRENT_TASKS);
    for (const t of batch) {
      opts.onStep?.(t.label ?? `Running ${t.type}`);
      opts.onTask?.({ ...t, status: "running" });
    }

    const settled = await Promise.all(batch.map((t) => executeOne(t, byId)));
    for (const done of settled) {
      byId.set(done.id, done);
      remaining.delete(done.id);
      opts.onTask?.(done);
    }
  }

  return tasks.map((t) => byId.get(t.id) ?? t);
}

export function synthesizeReply(tasks: Task[]): string {
  const parts: string[] = [];
  const failures: string[] = [];

  for (const t of tasks) {
    if (t.status === "completed" && t.result?.ok && t.result.message) {
      parts.push(t.result.message);
    } else if (t.status === "failed" || t.status === "blocked") {
      const label =
        t.type === "weather"
          ? "weather"
          : t.type === "nearby"
            ? "nearby places"
            : t.type === "location"
              ? "location"
              : t.type === "date"
                ? "date"
                : t.type === "time"
                  ? "time"
                  : t.phoneAction?.action?.replace(/_/g, " ") ?? t.type;
      failures.push(label);
    }
  }

  if (failures.length) {
    if (failures.length === 1) {
      parts.push(`I couldn't get the ${failures[0]}.`);
    } else {
      parts.push(`I couldn't get: ${failures.join(", ")}.`);
    }
  }

  if (!parts.length) {
    return "I couldn't complete that request.";
  }
  return parts.join(" ");
}

export function shouldUseOrchestrator(tasks: Task[]): boolean {
  if (tasks.length === 0) return false;
  if (tasks.length >= 2) return true;
  const t = tasks[0];
  return (
    t.type === "date" ||
    t.type === "time" ||
    t.type === "location" ||
    t.type === "weather" ||
    t.type === "nearby"
  );
}

export function collectPhoneActions(tasks: Task[]): PhoneAction[] {
  const out: PhoneAction[] = [];
  for (const t of tasks) {
    if (t.type === "phone_action" && t.phoneAction && t.status === "completed") {
      out.push(t.phoneAction);
    }
    if (t.type === "location" && t.status === "completed") {
      out.push({ action: "location" });
    }
  }
  return out;
}

export function isSafeExternalContent(text: string): boolean {
  void text;
  return true;
}
