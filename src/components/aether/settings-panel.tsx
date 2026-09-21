import { LANGUAGES, VOICES } from "@/lib/aether/types";
import { useAether } from "@/lib/aether/store";
import { isNativeBridge } from "@/lib/aether/native";
import { Button } from "@/components/ui/button";

export function SettingsPanel() {
  const settings = useAether((s) => s.settings);
  const setVoice = useAether((s) => s.setVoice);
  const setLanguage = useAether((s) => s.setLanguage);
  const setWakeEnabled = useAether((s) => s.setWakeEnabled);
  return <div className="flex flex-1 flex-col gap-6 overflow-y-auto pb-6">
    <header><p className="text-xs font-medium uppercase tracking-[0.14em] text-faint">Aether</p><h2 className="mt-1 font-display text-2xl font-medium">Settings</h2></header>
    <section className="space-y-3"><h3 className="text-xs font-medium uppercase tracking-[0.14em] text-faint">Voice</h3><div className="flex flex-wrap gap-2">{VOICES.map((voice) => <Button key={voice.id} size="sm" variant={settings.voice === voice.id ? "primary" : "quiet"} onClick={() => setVoice(voice.id)}>{voice.label}</Button>)}</div></section>
    <section className="space-y-3"><h3 className="text-xs font-medium uppercase tracking-[0.14em] text-faint">Language</h3><div className="flex flex-wrap gap-2">{LANGUAGES.map((language) => <Button key={language.id} size="sm" variant={settings.language === language.id ? "primary" : "quiet"} onClick={() => setLanguage(language.id)}>{language.label}</Button>)}</div></section>
    <section className="flex items-center justify-between rounded-[20px] bg-elevated p-4 shadow-[var(--shadow-border)]"><div><p className="text-sm font-medium">Wake behavior</p><p className="mt-1 text-xs text-muted">Use Aether from the assistant gesture.</p></div><Button size="sm" variant={settings.wakeEnabled ? "primary" : "quiet"} onClick={() => setWakeEnabled(!settings.wakeEnabled)}>{settings.wakeEnabled ? "On" : "Off"}</Button></section>
    <section className="rounded-[20px] bg-elevated p-4 text-sm shadow-[var(--shadow-border)]"><p className="font-medium">Connection</p><p className="mt-1 text-muted">{isNativeBridge() ? "Connected to the Aether Android app." : "Using the browser connection."}</p></section>
  </div>;
}
