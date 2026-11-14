import { createContext, useContext } from "react";
import { RADIUS } from "../tokens.ts";

/// Whether something sits on a sheet: a page laid out for a screen (`Screen`) lets the sheet
/// scroll for it, and a surface on a sheet is drawn lighter than the sheet (D68).
export const InSheet = createContext(false);
export const useInSheet = () => useContext(InSheet);

/// Whether something sits in a floating card (`presentation="card"`), whose corners are
/// rounder than a sheet's.
export const InCard = createContext(false);

/// The corners of a section or surface: following the card's inside a card, a section's
/// anywhere else.
export const useSectionRadius = () => (useContext(InCard) ? RADIUS.inCard : RADIUS.section);
