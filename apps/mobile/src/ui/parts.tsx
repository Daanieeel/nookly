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
