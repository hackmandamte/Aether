import {
  Bluetooth,
  Camera,
  Flashlight,
  Lock,
  MapPin,
  MessageSquare,
  Phone,
  Sun,
  Volume2,
  Wifi,
} from "lucide-react";
import { runPhoneAction } from "@/lib/aether/native";
import { useAether } from "@/lib/aether/store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Tile({
  label,
  active,
  icon: Icon,
  onClick,
}: {
  label: string;
  active?: boolean;
  icon: typeof Wifi;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-[5.5rem] flex-col items-start justify-between rounded-[20px] p-3.5 text-left shadow-[var(--shadow-border)] transition-[scale,background-color] duration-150 ease-out active:scale-[0.96]",
        active ? "bg-accent text-accent-fg" : "bg-elevated text-fg",
      )}
    >
      <Icon className="size-5" strokeWidth={1.75} />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

export function DevicePanel() {
  const device = useAether((s) => s.device);
  const lastAction = useAether((s) => s.lastAction);

  return (
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto pb-4">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-faint">
          Infinix Smart 8
        </p>
        <h2 className="mt-1 font-display text-2xl font-medium tracking-[-0.03em]">
          Device
        </h2>
      </header>

      <div className="mx-auto w-full max-w-[220px] rounded-[2rem] bg-elevated p-2 shadow-[var(--shadow-border)]">
        <div
          className="relative overflow-hidden rounded-[1.5rem] bg-bg px-4 py-6"
          style={{
            filter: `brightness(${0.45 + device.brightness / 180})`,
          }}
        >
          <div className="mx-auto mb-6 h-1.5 w-16 rounded-full bg-subtle" />
          <p className="text-center text-3xl font-medium tabular-nums tracking-tight">
            {device.volume}
            <span className="ml-1 text-sm font-normal text-muted">/ 15</span>
          </p>
          <p className="mt-1 text-center text-xs text-faint">Volume</p>
          {device.flashlight ? (
            <div className="pointer-events-none absolute inset-0 bg-accent/25" />
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Tile
          label={device.flashlight ? "Flashlight on" : "Flashlight"}
          active={device.flashlight}
          icon={Flashlight}
          onClick={() =>
            void runPhoneAction({
              action: device.flashlight ? "flashlight_off" : "flashlight_on",
            })
          }
        />
        <Tile
          label="Camera"
          active={device.cameraOpen}
          icon={Camera}
          onClick={() => void runPhoneAction({ action: "camera" })}
        />
        <Tile
          label="Wi-Fi"
          icon={Wifi}
          onClick={() => void runPhoneAction({ action: "wifi" })}
        />
        <Tile
          label="Bluetooth"
          icon={Bluetooth}
          onClick={() => void runPhoneAction({ action: "bluetooth" })}
        />
        <Tile
          label="Lock"
          icon={Lock}
          onClick={() => void runPhoneAction({ action: "lock" })}
        />
        <Tile
          label="Maps"
          icon={MapPin}
          onClick={() =>
            void runPhoneAction({ action: "navigate", target: "nearby" })
          }
        />
      </div>

      <label className="block">
        <span className="mb-2 flex items-center gap-2 text-sm text-muted">
          <Volume2 className="size-4" /> Volume
        </span>
        <input
          type="range"
          min={0}
          max={15}
          value={device.volume}
          onChange={(e) =>
            void runPhoneAction({
              action: "volume",
              value: Number(e.target.value),
            })
          }
          className="w-full accent-accent"
        />
      </label>
      <label className="block">
        <span className="mb-2 flex items-center gap-2 text-sm text-muted">
          <Sun className="size-4" /> Brightness
        </span>
        <input
          type="range"
          min={5}
          max={100}
          value={device.brightness}
          onChange={(e) =>
            void runPhoneAction({
              action: "brightness",
              value: Number(e.target.value),
            })
          }
          className="w-full accent-accent"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="quiet"
          onClick={() =>
            void runPhoneAction({ action: "call", target: "112" })
          }
        >
          <Phone className="size-4" /> Emergency
        </Button>
        <Button
          variant="quiet"
          onClick={() => void runPhoneAction({ action: "open_app", target: "messages" })}
        >
          <MessageSquare className="size-4" /> Messages
        </Button>
      </div>

      {lastAction ? (
        <p className="text-sm text-muted">{lastAction}</p>
      ) : null}
    </div>
  );
}
