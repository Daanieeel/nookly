import { createContext, useContext } from "react";

/// Whether something sits on a sheet: a page laid out for a screen (`Screen`) lets the sheet
/// scroll for it, and a surface on a sheet is drawn lighter than the sheet (D68).
export const InSheet = createContext(false);
export const useInSheet = () => useContext(InSheet);
