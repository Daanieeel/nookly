import { type ReactNode, createContext, useContext } from "react";

/// An item's page has two parts, as on the desktop: what is in the middle (the title, the
/// text, its lists) and what is on the side (every property and setting). A screen for an
/// item marks each piece of it with `MainPart` or `DetailsPart`, and shows the same screen
/// twice: in the page with `main`, in the details with `details`. Where nothing says which
/// (a test, a bare screen), both show.
export type Part = "main" | "details" | "all";

const PartContext = createContext<Part>("all");
export const PartProvider = PartContext.Provider;
export const usePart = () => useContext(PartContext);

export function MainPart({ children }: { children: ReactNode }) {
  return usePart() === "details" ? null : <>{children}</>;
}

export function DetailsPart({ children }: { children: ReactNode }) {
  return usePart() === "main" ? null : <>{children}</>;
}

/// Whether the item's details wait behind the page (a phone), so the page itself shows the
/// main properties at a glance under the title.
const GlanceContext = createContext(false);
export const GlanceProvider = GlanceContext.Provider;

/// Properties at a glance: in the page, as a row of chips, only where the details are not
/// already beside the page. Tapping a chip opens the same picker as the details' row.
export function AtAGlance({ children }: { children: ReactNode }) {
  const part = usePart();
  const glance = useContext(GlanceContext);
  if (part !== "main" || !glance) return null;
  return <PropertyLookProvider value="chip">{children}</PropertyLookProvider>;
}

/// How a property draws: a row of a `PropertyList`, or a chip at a glance.
export type PropertyLook = "row" | "chip";
const PropertyLookContext = createContext<PropertyLook>("row");
const PropertyLookProvider = PropertyLookContext.Provider;
export const usePropertyLook = () => useContext(PropertyLookContext);
