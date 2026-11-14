import { type ColorValue, useColorScheme } from "react-native";
import { useInSheet } from "../sheet/in-sheet.ts";
import { type Scheme, type SemanticName, semantic, semanticHex } from "../tokens.ts";

/// The scheme the phone shows now (the user's Appearance choice or the system's).
export function useScheme(): Scheme {
  return useColorScheme() === "dark" ? "dark" : "light";
}

/// A semantic colour for the scheme shown now.
export function useSemantic(name: SemanticName) {
  return semantic(name, useScheme());
}

export interface ColorPair {
  color: ColorValue;
  hex: string;
}

/// A semantic colour for the scheme shown now, both as the system colour and as a plain
/// hex for a fallback icon.
export function useSemanticPair(name: SemanticName): ColorPair {
  const scheme = useScheme();
  return { color: semantic(name, scheme), hex: semanticHex(name, scheme) };
}

/// A grouped surface (a section, a field's row, a card): one step up from a page, and on a
/// sheet lighter than the sheet's material (D68), so it always reads as raised.
export function useSurface() {
  return useSemantic(useInSheet() ? "sheetCard" : "surface");
}
