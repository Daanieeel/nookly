import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import {
  SuggestionList,
  type SuggestionListHandle,
  type SuggestionListItem,
} from "./suggestion-list";

/// The menus showing right now, each with what hides it. A menu's element can stay in the
/// document after it is hidden, so what is on the page says nothing about it.
const shownMenus = new Map<object, () => void>();

/// Hides every open "/" or "@" menu and says whether there was one. For a host that sees
/// Escape before the editor does (a dialog): the press that closed a menu is not also
/// meant to close the host.
export function closeEditorMenus(): boolean {
  const open = [...shownMenus.values()];
  for (const hide of open) hide();
  return open.length > 0;
}

/// Wires one `SuggestionList` popup into `@tiptap/suggestion`'s render lifecycle
/// (§ notes rewrite) — shared by the "/" block-type menu and the "@" mention menu,
/// which differ only in what `toItem` turns each raw item into.
export function createSuggestionRender<I>(
  toItem: (item: I) => SuggestionListItem,
  {
    hideWhenEmpty = false,
    footer,
    onAction,
  }: {
    hideWhenEmpty?: boolean;
    /// A hint shown under the list for the current items and query.
    footer?: (items: I[], query: string) => string | undefined;
    /// The `actionLabel` button of a row, or the right arrow on it, was used.
    onAction?: (item: I, props: SuggestionProps<I>) => void;
  } = {},
): NonNullable<SuggestionOptions<I>["render"]> {
  return () => {
    let component: ReactRenderer<SuggestionListHandle>;
    let unmount: (() => void) | undefined;
    const token = {};

    function show(props: SuggestionProps<I>) {
      const stop = props.mount(component.element);
      const hide = () => {
        stop();
        shownMenus.delete(token);
        unmount = undefined;
      };
      shownMenus.set(token, hide);
      unmount = hide;
    }

    /// Shows the popup, or with `hideWhenEmpty` hides it while nothing matches.
    function sync(props: SuggestionProps<I>) {
      if (hideWhenEmpty && props.items.length === 0) {
        unmount?.();
        unmount = undefined;
      } else if (!unmount) {
        show(props);
      }
    }

    function listProps(props: SuggestionProps<I>) {
      return {
        items: props.items.map(toItem),
        footer: footer?.(props.items, props.query),
        onAction: (index: number) => {
          const item = props.items[index];
          if (item) onAction?.(item, props);
        },
        onSelect: (index: number) => {
          const item = props.items[index];
          if (item) props.command(item);
        },
      };
    }

    return {
      onStart: (props) => {
        component = new ReactRenderer(SuggestionList, {
          props: listProps(props),
          editor: props.editor,
        });
        // Mounted on the page's body, above a dialog's overlay and still clickable inside one.
        Object.assign(component.element.style, { zIndex: "60", pointerEvents: "auto" });
        component.element.setAttribute("data-editor-popup", "");
        sync(props);
      },
      onUpdate: (props) => {
        component.updateProps(listProps(props));
        sync(props);
      },
      onKeyDown: (props) => {
        if (props.event.key === "Escape") {
          unmount?.();
          unmount = undefined;
          return true;
        }
        // A hidden popup leaves the keys to the editor.
        if (!unmount) return false;
        return component.ref?.onKeyDown(props.event) ?? false;
      },
      onExit: () => {
        unmount?.();
        // The handle is spent: left in place, the next start would think the popup is
        // still showing and never mount it.
        unmount = undefined;
        component.destroy();
      },
    };
  };
}

/// `allow` guard shared by the "/" and "@" menus: code blocks and inline code are
/// full of both characters (`//`, `</div>`, `@decorator`), so neither menu opens there.
export const allowOutsideCode: NonNullable<SuggestionOptions["allow"]> = ({ state, range }) => {
  const $from = state.doc.resolve(range.from);
  if ($from.parent.type.spec.code) return false;
  return !$from.marks().some((mark) => mark.type.spec.code);
};
