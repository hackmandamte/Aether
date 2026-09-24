import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { routeBrain } from "./router.ts";

describe("routeBrain", () => {
  it("cloud mode online → cloud", () => {
    const d = routeBrain({ text: "hello" }, { mode: "cloud", online: true });
    assert.equal(d.provider, "xai");
    assert.equal(d.needsNetwork, true);
  });

  it("cloud mode offline → offline-rules", () => {
    const d = routeBrain({ text: "turn on flashlight" }, { mode: "cloud", online: false });
    assert.equal(d.provider, "offline-rules");
  });

  it("local mode without model → offline-rules", () => {
    const d = routeBrain({ text: "turn on flashlight" }, { mode: "local", online: true });
    assert.equal(d.provider, "offline-rules");
  });

  it("hybrid complex → cloud when online", () => {
    const d = routeBrain(
      { text: "Compare three research papers and write a detailed analysis" },
      { mode: "hybrid", online: true },
    );
    assert.equal(d.provider, "xai");
  });

  it("hybrid offline simple → offline-rules when no local model", () => {
    const d = routeBrain(
      { text: "Turn on the flashlight" },
      { mode: "hybrid", online: false },
    );
    assert.equal(d.provider, "offline-rules");
  });
});
