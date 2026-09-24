import { getAccessCode } from "./access";
import { askAether, hearAether, speakAether, toChatPayload } from "./ai";
import { runLocalOrRules } from "./brain";
import { getLocalDateTime, formatDateMessage, formatTimeMessage } from "./datetime";
import { MAX_AGENT_ROUNDS, type ToolOutcome } from "./agent";
import { getNativeAccessCode, runPhoneAction, runPhoneActions } from "./native";
import {
  collectPhoneActions,
  planTasks,
  runTaskGraph,
  shouldUseOrchestrator,
  synthesizeReply,
} from "./orchestrator";
import { createVad } from "./silence";
import { useAether } from "./store";
import { resolveVoiceId, type PhoneAction } from "./types";
import { hasOnDeviceStt, recognizeOnce } from "./device-stt";
import {
  base64ToAudioUrl,
  blobToBase64,
  pickRecorderMime,
  playAudioUrl,
  speakWithDevice,
  stopAudio,
  stopDeviceVoice,
} from "./voice";

function withToolResults(
  messages: { role: "user" | "assistant"; text: string }[],
  outcomes: ToolOutcome[],
  finalize: boolean,
): { role: "user" | "assistant"; text: string }[] {
  if (!outcomes.length) return messages;
  const lines = outcomes.slice(0, 16).map((o, i) => {
    const safe: Record<string, unknown> = { ok: o.ok, message: o.message.slice(0, 400) };
    if (o.action) {
      safe.action = o.action.action;
      if (o.action.target) safe.target = String(o.action.target).slice(0, 80);
    }
    if (o.data) {
      const d = { ...o.data };
      for (const k of Object.keys(d)) {
        if (/lat|lng|latitude|longitude|coord/i.test(k)) delete d[k];
      }
      safe.data = d;
    }
    return `Tool ${i + 1}: ${JSON.stringify(safe)}`;
  });
  const note = finalize
    ? "Using only these tool results, write a short natural reply for the user. Do not invent facts."
    : "Tool results follow. Continue with more tools if needed, or answer.";
  return [
    ...messages,
    { role: "assistant" as const, text: `${note}\n${lines.join("\n")}`.slice(0, 6000) },
  ];
}

const DIDNT_HEAR = "I didn't catch that. Tap the orb and try again.";
const OFFLINE = "I couldn't reach the cloud right now. Check your connection and try again.";

let runId = 0;
let mediaStream: MediaStream | null = null;
let mediaRecorder: MediaRecorder | null = null;
let chunks: BlobPart[] = [];

function store() {
  return useAether.getState();
}

function step(msg: string) {
  store().pushStep(msg);
}

function fail(message: string) {
  store().setError(message);
  store().setListen("idle");
  store().addMessage({
    id: crypto.randomUUID(),
    role: "assistant",
    text: message,
    at: Date.now(),
  });
}

async function accessCode(): Promise<string> {
  try {
    const native = await getNativeAccessCode();
    if (native) return native;
  } catch {
    /* fall through */
  }
  return getAccessCode() ?? "";
}

async function speak(text: string, id: number) {
  if (id !== runId) return;
  store().setListen("speaking");
  const s = store();
  try {
    if (s.settings.preferOnDeviceSpeech) {
      await speakWithDevice(text, s.settings.language, Math.max(0.3, s.device.volume / 15), resolveVoiceId(s.settings.voice));
    } else {
      const audio = await speakAether({
        data: { accessCode: await accessCode(), text, language: s.settings.language, voice: resolveVoiceId(s.settings.voice) },
      });
      if (audio.ok && audio.audioBase64) {
        const url = base64ToAudioUrl(audio.audioBase64, audio.mimeType ?? "audio/mpeg");
        await playAudioUrl(url);
      } else {
        await speakWithDevice(text, s.settings.language, Math.max(0.3, s.device.volume / 15), resolveVoiceId(s.settings.voice));
      }
    }
  } catch {
    try {
      await speakWithDevice(text, s.settings.language, Math.max(0.3, s.device.volume / 15), resolveVoiceId(s.settings.voice));
    } catch {
      /* ignore */
    }
  } finally {
    if (id === runId) store().setListen("idle");
  }
}

export function stopEverything() {
  runId += 1;
  stopAudio();
  stopDeviceVoice();
  try {
    mediaRecorder?.stop();
  } catch {
    /* ignore */
  }
  mediaRecorder = null;
  mediaStream?.getTracks().forEach((t) => t.stop());
  mediaStream = null;
  chunks = [];
  store().setListen("idle");
}

export async function greetOnce() {
  const s = store();
  if (s.settings.onboarded) return;
  s.setOnboarded();
  const hello = "Hi, I'm ETA — your everyday tasks assistant. Tap the orb or type to get started.";
  s.addMessage({ id: crypto.randomUUID(), role: "assistant", text: hello, at: Date.now() });
  await speak(hello, runId);
}

export async function tapOrb() {
  const s = store();
  if (s.listen === "recording") {
    stopEverything();
    return;
  }
  if (s.listen === "speaking" || s.listen === "thinking") {
    stopEverything();
  }
  await startListening();
}

async function startListening() {
  const id = ++runId;
  store().setError(null);
  store().setSteps([]);
  store().setListen("recording");
  step("Listening…");

  if (store().settings.preferOnDeviceSpeech && hasOnDeviceStt()) {
    try {
      const heard = await recognizeOnce(store().settings.language);
      if (id !== runId) return;
      if (!heard?.trim()) {
        fail(DIDNT_HEAR);
        return;
      }
      await runTurn(heard.trim(), id);
      return;
    } catch {
      /* fall through to media recorder */
    }
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    fail("Microphone access is needed to talk to ETA.");
    return;
  }

  chunks = [];
  const mime = pickRecorderMime();
  mediaRecorder = new MediaRecorder(mediaStream, mime ? { mimeType: mime } : undefined);
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  mediaRecorder.start(200);

  const vad = createVad(mediaStream, {
    onSilence: () => {
      void finishRecording(id);
    },
  });
  vad.start();

  window.setTimeout(() => {
    if (id === runId && store().listen === "recording") void finishRecording(id);
  }, 12_000);
}

async function finishRecording(id: number) {
  if (id !== runId) return;
  const rec = mediaRecorder;
  mediaRecorder = null;
  if (!rec) return;
  await new Promise<void>((resolve) => {
    rec.onstop = () => resolve();
    try {
      rec.stop();
    } catch {
      resolve();
    }
  });
  mediaStream?.getTracks().forEach((t) => t.stop());
  mediaStream = null;

  const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
  chunks = [];
  if (blob.size < 800) {
    fail(DIDNT_HEAR);
    return;
  }

  step("Understanding speech…");
  store().setListen("thinking");
  try {
    const b64 = await blobToBase64(blob);
    const heard = await hearAether({
      data: {
        accessCode: await accessCode(),
        audioBase64: b64,
        mimeType: blob.type || "audio/webm",
        language: store().settings.language,
      },
    });
    if (id !== runId) return;
    if (!heard.ok || !heard.text?.trim()) {
      fail(heard.ok === false ? heard.error : DIDNT_HEAR);
      return;
    }
    await runTurn(heard.text.trim(), id);
  } catch {
    if (id === runId) fail(OFFLINE);
  }
}

export async function sendText(text: string) {
  const id = ++runId;
  store().setSteps([]);
  await runTurn(text, id);
}

/**
 * Shared turn path for typed and voice input.
 * Multi-intent → application orchestrator + model final synthesis over results.
 * Otherwise → bounded agent loop (model → tools → results → model).
 */
async function runTurn(text: string, id: number) {
  const trimmed = text.trim();
  if (!trimmed) {
    fail(DIDNT_HEAR);
    return;
  }
  const s = store();
  s.setError(null);
  s.addMessage({ id: crypto.randomUUID(), role: "user", text: trimmed, at: Date.now() });
  s.setListen("thinking");
  step("Thinking about it");

  // Hybrid / local / offline brain path (shared for typed + voice).
  const online = typeof navigator === "undefined" ? true : navigator.onLine !== false;
  const brainMode = s.settings.brainMode ?? "hybrid";
  try {
    const localOut = await runLocalOrRules(
      { text: trimmed, language: s.settings.language, offline: !online },
      brainMode,
      online,
    );
    if (localOut && id === runId) {
      if (localOut.ok) {
        const bits: string[] = [localOut.text];
        for (const intent of localOut.intents ?? []) {
          if (intent === "flashlight_on") {
            const r = await runPhoneAction({ action: "flashlight_on" });
            bits.push(r.message);
          } else if (intent === "flashlight_off") {
            const r = await runPhoneAction({ action: "flashlight_off" });
            bits.push(r.message);
          } else if (intent === "wifi_on") {
            const r = await runPhoneAction({ action: "wifi", value: "on" });
            bits.push(r.message);
          } else if (intent === "wifi_off") {
            const r = await runPhoneAction({ action: "wifi", value: "off" });
            bits.push(r.message);
          } else if (intent === "datetime") {
            const info = getLocalDateTime();
            bits.push(`${formatDateMessage(info)} ${formatTimeMessage(info)}`);
          }
        }
        if (id !== runId) return;
        if (localOut.provider === "offline-rules" || localOut.provider === "local-qwen") {
          const spoken = bits.filter(Boolean).join(" ").trim() || localOut.text;
          store().addMessage({
            id: crypto.randomUUID(),
            role: "assistant",
            text: spoken,
            at: Date.now(),
            trace: store().steps.slice(-8),
          });
          await speak(spoken, id);
          return;
        }
      } else if (!online || brainMode === "local") {
        fail(localOut.error);
        return;
      }
    }
  } catch {
    /* fall through to orchestrator / cloud */
  }

  const planned = planTasks(trimmed, { language: s.settings.language });
  if (shouldUseOrchestrator(planned)) {
    step(
      planned.length === 1
        ? "Working on your request"
        : `Planning ${planned.length} tasks`,
    );
    const finished = await runTaskGraph(planned, {
      shouldContinue: () => id === runId,
      onStep: (msg) => step(msg),
    });
    if (id !== runId) return;

    const outcomes: ToolOutcome[] = finished.map((task) => ({
      ok: Boolean(task.result?.ok),
      message: task.result?.message ?? task.error ?? task.type,
      data: task.result?.data,
      action: task.phoneAction,
    }));

    step("Putting it together");
    let spoken = synthesizeReply(finished);
    try {
      const polished = await askAether({
        data: {
          accessCode: await accessCode(),
          language: s.settings.language,
          messages: withToolResults([{ role: "user", text: trimmed }], outcomes, true),
        },
      });
      if (id !== runId) return;
      if (polished.ok && polished.text.trim()) {
        spoken = polished.text.trim();
      }
    } catch {
      /* keep deterministic synthesis */
    }

    const actions = collectPhoneActions(finished);

    store().addMessage({
      id: crypto.randomUUID(),
      role: "assistant",
      text: spoken,
      at: Date.now(),
      actions: actions.length ? actions : undefined,
      trace: store().steps.slice(-8),
    });
    await speak(spoken, id);
    return;
  }

  const chatMessages = toChatPayload(store().messages);
  let reply: Awaited<ReturnType<typeof askAether>>;
  try {
    reply = await askAether({
      data: {
        accessCode: await accessCode(),
        messages: chatMessages,
        language: s.settings.language,
      },
    });
  } catch {
    if (id === runId) fail(OFFLINE);
    return;
  }
  if (id !== runId) return;
  if (!reply.ok) {
    fail(reply.error);
    return;
  }

  const collectedActions: PhoneAction[] = [];
  let rounds = 0;
  let current = reply;

  while (rounds < MAX_AGENT_ROUNDS && id === runId) {
    const actions = (current.actions ?? []).slice(0, 12);
    if (!actions.length) break;

    for (const action of actions) {
      if (id !== runId) return;
      step(`Doing: ${action.action}`);
      const result = await runPhoneAction(action);
      collectedActions.push(action);
      const outcomes: ToolOutcome[] = [
        {
          ok: result.ok,
          message: result.message,
          action,
        },
      ];
      try {
        current = await askAether({
          data: {
            accessCode: await accessCode(),
            language: s.settings.language,
            messages: withToolResults(chatMessages, outcomes, rounds >= MAX_AGENT_ROUNDS - 1),
          },
        });
      } catch {
        break;
      }
      if (!current.ok) break;
    }
    rounds += 1;
    if (!(current.actions ?? []).length) break;
  }

  if (id !== runId) return;
  const spoken = current.ok ? current.text.trim() : OFFLINE;
  store().addMessage({
    id: crypto.randomUUID(),
    role: "assistant",
    text: spoken || "Done.",
    at: Date.now(),
    actions: collectedActions.length ? collectedActions : undefined,
    trace: store().steps.slice(-8),
  });
  await speak(spoken || "Done.", id);
}
