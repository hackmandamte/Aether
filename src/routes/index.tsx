import { createFileRoute } from "@tanstack/react-router";
import { AetherShell } from "@/components/aether/shell";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <AetherShell />;
}
