import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import {
  SuggestionList,
  type SuggestionListHandle,
  type SuggestionListItem,
} from "./suggestion-list";

/// Wires one `SuggestionList` popup into `@tiptap/suggestion`'s render lifecycle
/// (§ notes rewrite) — shared by the "/" block-type menu and the "@" mention menu,
/// which differ only in what `toItem` turns each raw item into.
export function createSuggestionRender<I>(
  toItem: (item: I) => SuggestionListItem,
  {
    hideWhenEmpty = false,
    footer,
  }: {
    hideWhenEmpty?: boolean;
    /// A hint shown under the list for the current items and query.
    footer?: (items: I[], query: string) => string | undefined;
  } = {},
): NonNullable<SuggestionOptions<I>["render"]> {
  return () => {
    let component: ReactRenderer<SuggestionListHandle>;
    let unmount: (() => void) | undefined;

    /// Shows the popup, or with `hideWhenEmpty` hides it while nothing matches.
    function sync(props: SuggestionProps<I>) {
      if (hideWhenEmpty && props.items.length === 0) {
        unmount?.();
        unmount = undefined;
      } else if (!unmount) {
        unmount = props.mount(component.element);
      }
    }

    function listProps(props: SuggestionProps<I>) {
      return {
        items: props.items.map(toItem),
        footer: footer?.(props.items, props.query),
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
