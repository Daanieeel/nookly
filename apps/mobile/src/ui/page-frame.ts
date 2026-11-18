import { createContext, useContext } from "react";

/// What the tablet's shell tells a page drawn in one of its tabs (1.8): its title, and
/// whether the page's own header row draws it (a page without a list header of its own,
/// such as Settings or Space Settings). Null on a phone, where the system's bar does.
export interface PageFrame {
  title: string;
  header: boolean;
}

const PageFrameContext = createContext<PageFrame | null>(null);
export const PageFrameProvider = PageFrameContext.Provider;
export const usePageFrame = () => useContext(PageFrameContext);
