import type { ComponentType, SVGProps } from "react";
import type { AiApp } from "#/lib/api/ai-apps.ts";
import { ClaudeLogo, CursorLogo, OpenAiLogo, VsCodeLogo } from "./ai-app-logos.tsx";

/// The logo of every app the backend can find (`commands/ai_apps.rs`), by its id. An app the
/// backend finds that has no logo here is left out until it gets one.
const LOGOS = new Map<string, ComponentType<SVGProps<SVGSVGElement>>>([
  ["claude", ClaudeLogo],
  ["chatgpt", OpenAiLogo],
  ["cursor", CursorLogo],
  ["vscode", VsCodeLogo],
]);

export function aiAppLogo(id: string): ComponentType<SVGProps<SVGSVGElement>> | undefined {
  return LOGOS.get(id);
}

/// The apps to offer: the last used one first, the rest in the order the backend found them.
export function orderAiApps(found: AiApp[], lastUsed: string | null): AiApp[] {
  const known = found.filter((app) => LOGOS.has(app.id));
  const last = known.find((app) => app.id === lastUsed);
  return last ? [last, ...known.filter((app) => app !== last)] : known;
}
