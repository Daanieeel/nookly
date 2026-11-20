import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/// `text-ui` is a size, not a colour, and the `shadow-*` names are our elevations: without
/// this, merging would drop `text-ui` next to a text colour and treat our shadows as unknown.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["ui"] }],
      shadow: [{ shadow: ["control", "card", "popover", "dialog", "primary", "solid"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
