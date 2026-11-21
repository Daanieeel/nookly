import { type ColorValue, useColorScheme } from "react-native";
import { useInSheet } from "../sheet/in-sheet.ts";
import { useOnPage } from "./on-page.ts";
import {
  type ElevationName,
  type Scheme,
  type SemanticName,
  elevation,
  semantic,
  semanticHex,
} from "../tokens.ts";

/// The scheme the phone shows now (the user's Appearance choice or the system's).
export function useScheme(): Scheme {
  return useColorScheme() === "dark" ? "dark" : "light";
}

/// What a control stands on (a field, a chosen segment): the raised fill on a page, and on a
/// sheet the lighter card tone, so it never sinks into the sheet's material.
export function useRaised() {
  return useSemantic(useInSheet() ? "sheetCard" : "raised");
}

/// A depth (the desktop's elevations) for the scheme shown now.
export function useElevation(name: ElevationName) {
  return elevation(name, useScheme());
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
/// sheet lighter than the sheet's material (D68), so it always reads as raised; on a plain
/// page a card's tone, a step off the page in both schemes.
export function useSurface() {
  const inSheet = useInSheet();
  const onPage = useOnPage();
  return useSemantic(inSheet ? "sheetCard" : onPage ? "pageCard" : "surface");
}

/// What a small control wears (a pill, a chip, a round button): the raised fill (the lighter
/// card tone on a sheet), a hairline edge and the control depth.
export function useControlStyle() {
  const scheme = useScheme();
  return {
    backgroundColor: useRaised(),
    borderWidth: 1,
    borderColor: semantic("controlEdge", scheme),
    ...elevation("control", scheme),
  } as const;
}
