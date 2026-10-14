import { PAGE_PANE_CLASSES } from "@nookly/frontend/classes";
import { cn } from "@nookly/ui/lib/utils";

/// Helpers that let the phone use the desktop's classes as they are
/// (`@nookly/ui/classes`, `@nookly/frontend/classes`).

export { cn };

/// Classes that style text. A React Native `View` doesn't pass them on to the `Text`
/// inside it as a browser does, so a component puts these on its text.
const TEXT_CLASS =
  /^(?:[a-z-]+:)*(?:text-|font-|leading-|tracking-|underline|line-through|no-underline|uppercase|lowercase|capitalize|normal-case|italic|truncate|whitespace-)/;

/// A class list split in two: what styles the box, and what styles its text.
export interface TextSplit {
  box: string;
  text: string;
}

export function splitText(className: string): TextSplit {
  const box: string[] = [];
  const text: string[] = [];
  for (const name of className.split(/\s+/).filter(Boolean)) {
    (TEXT_CLASS.test(name) ? text : box).push(name);
  }
  return { box: box.join(" "), text: text.join(" ") };
}

/// The desktop marks state with data attributes (`data-[active=true]:bg-accent`); the
/// phone knows the state itself. Classes of a state that holds lose their prefix, those
/// of one that doesn't go.
export function withState(className: string, state: Record<string, string | boolean>): string {
  return className
    .split(/\s+/)
    .flatMap((name) => {
      const match = /^data-\[([a-z-]+)=([^\]]+)\]:(.+)$/.exec(name);
      if (!match) return [name];
      return String(state[match[1]]) === match[2] ? [match[3]] : [];
    })
    .join(" ");
}

/// `flex` lays out in a row in a browser and in a column in React Native. A class
/// list written for the desktop that means a row gets `flex-row` here.
export const row = (className: string) => cn(className, "flex-row");

/// A page's background: the desktop's page pane's (`PAGE_PANE_CLASSES`), a card on the
/// window's background. Only the inset sidebar sits on the window's background itself.
export const PAGE_BACKGROUND =
  PAGE_PANE_CLASSES.split(" ").find((name) => name.startsWith("bg-")) ?? "bg-card";
