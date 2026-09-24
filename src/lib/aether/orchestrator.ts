/**
 * Multi-task orchestration for ETA.
 *
 * USER → (optional STT) → planTasks → task graph → concurrent/dependent
 * execution → structured results → synthesized reply.
 *
 * Phone actions stay on the native pipeline. Info tasks (date/time/location/
 * weather/nearby) are first-class and do not force everything through
 * phone_action. Location/weather/nearby form a dependency chain when needed.
 */

import type {
  PhoneAction,
  PhoneActionName,
  Task,
  TaskResult,
  TaskStatus,
  TaskType,
} from "./types";
import { MAX_CONCURRENT_TASKS, MAX_TASKS_PER_TURN } from "./types";

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
    re: /\bnavigate\s+(?:me\s+)?(?:to\s+)?(.+?)(?:\.|$)/i,
    action: "navigate",
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

/**
 * Deterministic multi-intent planner.
 * Splits a single user message into tasks with dependency edges.
 * Returns [] when the message is better handled by the general LLM path.
 */
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

  let locTask: Task | undefined;
  if (needLoc || weather || nearby) {
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

  if (nearby) {
    push({
      type: "nearby",
      label: `Finding nearby ${nearby.query}`,
      input: { query: nearby.query },
      dependsOn: locTask ? [locTask.id] : undefined,
    });
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
  const d = new Date();
  const message = d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return { ok: true, message: `Today is ${message}.`, data: { date: message } };
}

function formatTime(): TaskResult {
  const d = new Date();
  const message = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return { ok: true, message: `It's ${message}.`, data: { time: message } };
}

async function runLocation(): Promise<TaskResult> {
  const res = await runPhoneAction({ action: "location" });
  const msg = res.message;
  const coord = msg.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
  const data: Record<string, unknown> = {};
  if (coord) {
    data.lat = Number(coord[1]);
    data.lng = Number(coord[2]);
    data.approx = `${Number(coord[1]).toFixed(3)}, ${Number(coord[2]).toFixed(3)}`;
  }
  return { ok: res.ok, message: msg, data };
}

async function runWeather(deps: Map<string, Task>): Promise<TaskResult> {
  let lat: number | undefined;
  let lng: number | undefined;
  for (const t of deps.values()) {
    if (t.type === "location" && t.result?.ok && t.result.data) {
      lat = t.result.data.lat as number | undefined;
      lng = t.result.data.lng as number | undefined;
    }
  }
  if (lat != null && lng != null) {
    const q = `weather near ${lat.toFixed(3)},${lng.toFixed(3)}`;
    const res = await runPhoneAction({ action: "search_web", target: q });
    return {
      ok: res.ok,
      message: res.ok
        ? "I opened a weather search for your area."
        : res.message || "Couldn't check the weather.",
      data: { via: "search" },
    };
  }
  const res = await runPhoneAction({ action: "search_web", target: "weather near me" });
  return {
    ok: res.ok,
    message: res.ok ? "I opened a weather search near you." : res.message || "Couldn't check the weather.",
  };
}

async function runNearby(task: Task, deps: Map<string, Task>): Promise<TaskResult> {
  const query =
    (task.input && typeof task.input === "object" && "query" in task.input
      ? String((task.input as { query: string }).query)
      : "places") || "places";

  let lat: number | undefined;
  let lng: number | undefined;
  for (const t of deps.values()) {
    if (t.type === "location" && t.result?.ok && t.result.data) {
      lat = t.result.data.lat as number | undefined;
      lng = t.result.data.lng as number | undefined;
    }
  }

  if (lat != null && lng != null) {
    const target = `${query} near ${lat.toFixed(4)},${lng.toFixed(4)}`;
    const res = await runPhoneAction({ action: "navigate", target });
    return {
      ok: res.ok,
      message: res.ok
        ? `Looking for nearby ${query} around you.`
        : res.message || `Couldn't find nearby ${query}.`,
      data: { query },
    };
  }

  const res = await runPhoneAction({ action: "navigate", target: `${query} near me` });
  return {
    ok: res.ok,
    message: res.ok
      ? `Looking for nearby ${query}.`
      : res.message || `Couldn't find nearby ${query}.`,
    data: { query },
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
        result = await runLocation();
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

/**
 * Execute a task graph: independent tasks run with bounded concurrency;
 * dependents wait for successful deps; failures block only their dependents.
 */
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

/** Combine task results into one coherent spoken reply. Never invent failures. */
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
  return t.type === "date" || t.type === "time" || t.type === "location" || t.type === "weather" || t.type === "nearby";
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
    if (t.type === "weather" && t.status === "completed") {
      out.push({ action: "search_web", target: "weather" });
    }
    if (t.type === "nearby" && t.status === "completed") {
      const q =
        t.input && typeof t.input === "object" && "query" in t.input
          ? String((t.input as { query: string }).query)
          : "places";
      out.push({ action: "navigate", target: q });
    }
  }
  return out;
}
