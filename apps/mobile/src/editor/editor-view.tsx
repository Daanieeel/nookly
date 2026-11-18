import { type ComponentProps, type ComponentType, createContext, useContext } from "react";
import PageEditorDom from "./PageEditorDom.tsx";

export type PageEditorViewProps = ComponentProps<typeof PageEditorDom>;

/// The web view the page editor runs in. The phone's own; a test, which has no web view,
/// supplies a stand in.
const PageEditorViewContext = createContext<ComponentType<PageEditorViewProps>>(PageEditorDom);
export const PageEditorViewProvider = PageEditorViewContext.Provider;
export const usePageEditorView = () => useContext(PageEditorViewContext);
