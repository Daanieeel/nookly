import type { MigrationState } from "./runtime.ts";

/// Sentences both apps say about sync, so they say the same thing. `place` is the device
/// as the person knows it: "this computer", "this iPad".

const count = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`;

/// Changes the server refused. Nothing for the person to do, so it only says they are safe.
export function heldLine(held: number, place: string): string {
  const theyAre = held === 1 ? "It's" : "They're";
  return `${plural(held, "change", "changes")} couldn't sync yet. ${theyAre} saved on ${place} and Nookly keeps trying.`;
}

/// How a first sync ended.
export function migrationSummary(m: MigrationState, place: string): string {
  const files = m.files > 0 ? ` and ${plural(m.files, "file", "files")}` : "";
  const held = m.heldItems ?? 0;
  const items =
    held > 0
      ? `${count(m.itemsSent)} of ${plural(m.items, "item", "items")}`
      : `All ${plural(m.items, "item", "items")}`;
  const summary = `${items}${files} are in your account, checked with the server.`;
  return held > 0 ? `${summary} ${heldLine(held, place)}` : summary;
}
