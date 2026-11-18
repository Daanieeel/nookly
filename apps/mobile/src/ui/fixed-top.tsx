import { type ReactNode, createContext, useContext } from "react";
import { type SlotStore, useSlot } from "./floating.tsx";

/// The store of the page's fixed top, which its `Screen` draws above the scrolling page.
export const FixedTopContext = createContext<SlotStore | null>(null);

/// A list page's top (its title with Filter and Display, its tabs, the filters on): drawn
/// above the page so it stays put while only the list scrolls, though it is declared in the
/// page. Where nothing scrolls (a sheet) it is drawn in place.
export function FixedTop({ children }: { children: ReactNode }) {
  return useSlot(useContext(FixedTopContext), children);
}
