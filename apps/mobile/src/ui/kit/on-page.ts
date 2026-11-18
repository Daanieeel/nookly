import { createContext, useContext } from "react";

/// Whether surfaces sit on a plain page (Home, Settings) instead of a grouped background: a
/// grouped section's colour is the page's own there, so they take a card's tone (`pageCard`).
export const OnPage = createContext(false);
export const useOnPage = () => useContext(OnPage);
