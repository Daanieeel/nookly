import { createContext, useContext } from "react";

/// Lets a page ask for an item to be shown beside it. Only the iPad's window offers it.
const SplitContext = createContext<{ show(path: string): void } | null>(null);
export const SplitProvider = SplitContext.Provider;
export const useSplit = () => useContext(SplitContext);
