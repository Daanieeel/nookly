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
): NonNullable<SuggestionOptions<I>["render"]> {
  return () => {
    let component: ReactRenderer<SuggestionListHandle>;
    let unmount: (() => void) | undefined;

    function listProps(props: SuggestionProps<I>) {
      return {
        items: props.items.map(toItem),
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
        unmount = props.mount(component.element);
      },
      onUpdate: (props) => {
        component.updateProps(listProps(props));
      },
      onKeyDown: (props) => {
        if (props.event.key === "Escape") {
          unmount?.();
          return true;
        }
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
