/**
 * Decides when the user has finished talking, from a stream of mic loudness readings.
 * Pure logic (no browser APIs) so it can be unit-tested.
 *
 * feed() is called ~12 times a second with the current loudness (0..1) and a clock in ms.
 *   "send"     -> they spoke and then went quiet (or we hit the time cap): send it
 *   "nothing"  -> they never said anything: give up
 *   "continue" -> keep listening
 */
export type VadVerdict = "continue" | "send" | "nothing";

export type VadOptions = {
  /** Quietest level that can count as speech. */
  minSpeechLevel: number;
  /** Quiet time after speech before we send. */
  silenceMs: number;
  /** How long we wait for the first word. */
  noSpeechMs: number;
  /** Hard cap on one recording. */
  maxMs: number;
  /** How long we measure background noise at the start. */
  calibrateMs: number;
};

export const DEFAULT_VAD: VadOptions = {
  minSpeechLevel: 0.025,
  silenceMs: 1500,
  noSpeechMs: 8000,
  maxMs: 20_000,
  calibrateMs: 500,
};

export function createVad(opts: VadOptions = DEFAULT_VAD) {
  let startedAt = -1;
  let lastVoiceAt = -1;
  let heardSpeech = false;
  // Lowest level in the first moments = background noise (robust even if they start talking at once).
  let floor = Infinity;

  return {
    get heardSpeech() {
      return heardSpeech;
    },
    feed(level: number, now: number): VadVerdict {
      if (startedAt < 0) startedAt = now;
      const elapsed = now - startedAt;

      if (elapsed <= opts.calibrateMs) floor = Math.min(floor, level);
      const noise = Number.isFinite(floor) ? floor : 0;
      // Speech must clearly beat the background, but never demand an impossible level.
      const threshold = Math.min(0.15, Math.max(opts.minSpeechLevel, noise * 3));

      if (level >= threshold && elapsed > 120) {
        heardSpeech = true;
        lastVoiceAt = now;
      }

      if (elapsed >= opts.maxMs) return heardSpeech ? "send" : "nothing";
      if (heardSpeech) {
        return now - lastVoiceAt >= opts.silenceMs ? "send" : "continue";
      }
      return elapsed >= opts.noSpeechMs ? "nothing" : "continue";
    },
  };
}
