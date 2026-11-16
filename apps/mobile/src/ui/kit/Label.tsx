import { type ColorValue, Text, type TextProps } from "react-native";
import { useScale } from "../scale.ts";
import { FACE, type SemanticName, type TypeName, semantic } from "../tokens.ts";
import { useScheme } from "./scheme.ts";

/// Text in one of iOS's text styles, in a semantic colour or a tint, growing with the
/// system's text size (Dynamic Type).
export function Label({
  type = "body",
  color = "label",
  tint,
  weight,
  style,
  ...props
}: Omit<TextProps, "style"> & {
  type?: TypeName;
  /// A semantic colour.
  color?: SemanticName;
  /// A colour of Nookly's own instead (an accent, a warning).
  tint?: ColorValue;
  /// Heavier or lighter than the text style's own.
  weight?: keyof typeof FACE;
  style?: TextProps["style"];
}) {
  const scheme = useScheme();
  const { fontWeight, ...size } = useScale().type[type];
  return (
    <Text
      maxFontSizeMultiplier={2}
      {...props}
      style={[
        size,
        { fontFamily: FACE[weight ?? fontWeight], color: tint ?? semantic(color, scheme) },
        style,
      ]}
    />
  );
}
