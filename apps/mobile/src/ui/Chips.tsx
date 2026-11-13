import { createContext, useContext } from "react";
import { ScrollView, View } from "react-native";
import { AnimatedPressable, usePressScale } from "./press.ts";
import { cn } from "./classes.ts";
import { Label } from "./kit/Label.tsx";
import { useScheme, useSemantic } from "./kit/scheme.ts";
import { CORNER, RADIUS, SPACE, TINT } from "./tokens.ts";
import { CONTROL_SIZE, MIN_TOUCH, TOUCH_GAP, touchSlop } from "./touch.ts";

/// Whether the chips of a group share its width equally.
const Stretch = createContext(false);

/// One choice of a few: a status, a Space, a label. A capsule on the gray fill, filled with
/// the accent when chosen (D53).
export function Chip({
  label,
  selected,
  onPress,
  icon,
  multiple = false,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: React.ReactNode;
  /// One of several that can be on at once (labels), rather than one of a set.
  multiple?: boolean;
  disabled?: boolean;
}) {
  const stretch = useContext(Stretch);
  const scheme = useScheme();
  const fill = useSemantic("fill");
  const press = usePressScale();
  return (
    <AnimatedPressable
      accessibilityRole={multiple ? "checkbox" : "radio"}
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={touchSlop(CONTROL_SIZE.chip, MIN_TOUCH)}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      unstable_pressDelay={0}
      style={[
        CORNER,
        {
          height: CONTROL_SIZE.chip,
          flex: stretch ? 1 : undefined,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: SPACE.xs + 2,
          paddingHorizontal: SPACE.md + 2,
          borderRadius: RADIUS.pill,
          backgroundColor: selected ? TINT.blue[scheme] : fill,
          opacity: disabled ? 0.45 : 1,
        },
        press.style,
      ]}
    >
      {icon}
      <Label
        type="subheadline"
        weight={selected ? "600" : "500"}
        tint={selected ? "#ffffff" : undefined}
        numberOfLines={1}
      >
        {label}
      </Label>
    </AnimatedPressable>
  );
}

/// Chips that wrap onto more lines, or scroll sideways in one line when there may be
/// many (Spaces, Courses). `stretch` puts them in one line over the full width, each
/// taking an equal share (a few tabs that fit).
export function ChipGroup({
  label,
  children,
  scroll = false,
  multiple = false,
  stretch = false,
}: {
  label: string;
  children: React.ReactNode;
  scroll?: boolean;
  multiple?: boolean;
  stretch?: boolean;
}) {
  const role = multiple ? undefined : "radiogroup";
  if (scroll) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole={role}
        accessibilityLabel={label}
        contentContainerClassName="gap-2"
      >
        {children}
      </ScrollView>
    );
  }
  return (
    <Stretch.Provider value={stretch}>
      <View
        accessibilityRole={role}
        accessibilityLabel={label}
        // Wrapped lines keep their hit areas apart.
        style={{ rowGap: TOUCH_GAP }}
        className={cn("flex-row gap-2", !stretch && "flex-wrap")}
      >
        {children}
      </View>
    </Stretch.Provider>
  );
}
