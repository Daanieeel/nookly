import { createContext, useContext } from "react";

/// Lets the page open and close the details behind it (the bar's info button, the "more"
/// menu); the page slides aside with the drawer's own animation.
const DetailsHandle = createContext<{ open: boolean; show(): void; hide(): void } | null>(null);
export const DetailsHandleProvider = DetailsHandle.Provider;
export const useDetails = () => useContext(DetailsHandle);
