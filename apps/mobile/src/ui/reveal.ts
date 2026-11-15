import { createContext, useContext } from "react";
import type { View } from "react-native";

/// Lets what sits in a screen's scrolling page ask for a point of its own to be in
/// view: the editor, for the line being typed in. A sheet scrolls itself, so what it
/// holds has none (`RevealProvider value={null}`), even when the sheet is declared in a page.
export const RevealContext = createContext<((anchor: View, y: number) => void) | null>(null);

export const useReveal = () => useContext(RevealContext);
export const RevealProvider = RevealContext.Provider;
