import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react-native";
import { StyleSheet, View } from "react-native";
import { Button } from "./Button.tsx";
import { Floating } from "./floating.tsx";
import { FloatingBar } from "./floating-bar.tsx";
import { useSemanticPair } from "./kit/scheme.ts";

/// A bar floating at the bottom of a calendar page once today has scrolled out of sight,
/// with the way back. Its arrow points where today is: left of what is shown (earlier) or
/// right of it. `floats` draws it over the page itself, for a page that is not a `Screen`
/// (which has a layer of its own for it).
export function BackToTodayBar({
  shown,
  today,
  onPress,
  floats = false,
}: {
  shown: boolean;
  /// Where today is from what is shown.
  today: "before" | "after";
  onPress: () => void;
  floats?: boolean;
}) {
  const mark = useSemanticPair("label");
  const Arrow = today === "before" ? IconChevronLeft : IconChevronRight;
  const bar = (
    <FloatingBar shown={shown} above={0} testID="back-to-today" label="Today is out of view">
      <Button
        label="Back to Today"
        variant="ghost"
        icon={<Arrow size={16} color={mark.hex} />}
        onPress={onPress}
      />
    </FloatingBar>
  );
  return floats ? (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {bar}
    </View>
  ) : (
    <Floating>{bar}</Floating>
  );
}
