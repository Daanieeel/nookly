import type { TextStyle } from "react-native";
import { FACE, TYPE, type TypeName } from "../tokens.ts";

/// The text of a one line field beside an icon: the text style's size and face, and no line
/// height or padding, so iOS centres the text and its placeholder on the icon's middle. A
/// line height (Tailwind's `text-base` sets one) pushes both below it.
export function lineInput(type: TypeName = "body", weight: keyof typeof FACE = "400"): TextStyle {
  return { fontFamily: FACE[weight], fontSize: TYPE[type].fontSize, paddingVertical: 0 };
}
