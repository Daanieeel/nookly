/// Mac keyboards label shortcuts with symbols, other platforms with words.
export const IS_MAC = globalThis.navigator?.userAgent.includes("Mac") ?? false;

const WORDS = new Map([
  ["⌘", "Ctrl"],
  ["⌃", "Ctrl"],
  ["⌥", "Alt"],
  ["⇧", "Shift"],
]);
const ORDER = ["Ctrl", "Alt", "Shift"];

/// Shortcut text is written with Mac symbols. Off a Mac, `⇧⌘W` reads `Ctrl+Shift+W`.
export function platformKeys(text: string, mac = IS_MAC): string {
  if (mac) return text;
  return text.replace(
    /([⌘⌃⌥⇧]+)((?: ?[A-Z][A-Za-z]*|[A-Za-z0-9[\]])?)/g,
    (_, symbols: string, key: string) => {
      const words = [...new Set([...symbols].map((s) => WORDS.get(s) ?? s))].toSorted(
        (a, b) => ORDER.indexOf(a) - ORDER.indexOf(b),
      );
      return [...words, key.trim()].filter(Boolean).join("+");
    },
  );
}
