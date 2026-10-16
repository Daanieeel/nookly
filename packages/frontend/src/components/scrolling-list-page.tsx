import { type HTMLAttributes, type ReactNode, useRef } from "react";
import { useTabScroll } from "#/hooks/use-tab-scroll.ts";

/// A list page whose top (title, search and filters) stays where it is while the list
/// scrolls underneath it. The list is a scroll area of its own, which is also what a long
/// list draws only the rows of that are on screen in (`use-windowed-list.ts`). The page
/// brings its own padding, so it is one of the edge to edge views of the split view.
export function ScrollingListPage({
  top,
  children,
  ready = true,
  ...rest
}: {
  top: ReactNode;
  children: ReactNode;
  /// False while the list is still loading, so the scroll position is put back once it is there.
  ready?: boolean;
} & Omit<HTMLAttributes<HTMLDivElement>, "children">) {
  const bodyRef = useRef<HTMLDivElement>(null);
  useTabScroll(bodyRef, "list", ready);
  return (
    <div className="flex size-full min-h-0 flex-col" {...rest}>
      <div className="flex shrink-0 flex-col gap-3 px-6 pt-6 pb-3">{top}</div>
      <div
        ref={bodyRef}
        data-scroll-root=""
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-6 pb-6"
      >
        {children}
      </div>
    </div>
  );
}
