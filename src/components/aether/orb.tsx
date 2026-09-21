import { Mic } from "lucide-react";
import { useAether } from "@/lib/aether/store";
import { cn } from "@/lib/utils";

export function Orb({ onHoldStart, onHoldEnd }: { onHoldStart: () => void; onHoldEnd: () => void }) {
  const listen = useAether((s) => s.listen);
  const label = listen === "recording" ? "Listening" : listen === "thinking" ? "Thinking" : listen === "speaking" ? "Speaking" : "Hold to speak";
  return <button type="button" aria-label={label} onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); onHoldStart(); }} onPointerUp={onHoldEnd} onPointerCancel={onHoldEnd} onContextMenu={(e) => e.preventDefault()}
    className={cn("relative grid size-11 shrink-0 place-items-center rounded-full transition-[scale,box-shadow] duration-150", "bg-subtle text-fg focus-visible:ring-2 focus-visible:ring-ring/70", listen === "recording" && "scale-110 bg-accent text-accent-fg animate-[aether-breathe_1.8s_ease-in-out_infinite]", listen === "thinking" && "animate-pulse", listen === "speaking" && "text-accent")}>
    {listen === "speaking" ? <span className="flex h-5 items-end gap-0.5">{[0, 1, 2, 3].map((i) => <span key={i} className="w-[2px] rounded-full bg-current" style={{ height: "70%", animation: `aether-speak .9s ease-in-out ${i * .08}s infinite` }} />)}</span> : <Mic className="size-5" strokeWidth={1.8} />}
  </button>;
}
