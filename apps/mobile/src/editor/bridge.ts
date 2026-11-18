import type { PluginKey } from "prosemirror-state";

/// Yjs updates cross the DOM component's bridge as base64 text.

/// What a Yjs change was made by: a marker of ours, or the editor's own binding.
export type Origin = string | PluginKey | null;

/// What an awareness update says changed.
export interface AwarenessChanges {
  added: number[];
  updated: number[];
  removed: number[];
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
