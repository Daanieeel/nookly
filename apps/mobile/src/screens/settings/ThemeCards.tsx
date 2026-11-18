import { IconCheck } from "@tabler/icons-react-native";
import { Pressable, View } from "react-native";
import { haptic } from "../../ui/haptics.ts";
import { Label } from "../../ui/kit/Label.tsx";
import { useSemantic } from "../../ui/kit/scheme.ts";
import { RADIUS, SPACE, TINT } from "../../ui/tokens.ts";
import { useScheme } from "../../ui/kit/scheme.ts";

/// How a choice looks in its preview, the desktop's `theme-cards.tsx`: `split` shows both.
/// Literal colours: a preview shows a theme, so it cannot follow the current one.
export type Tone = "light" | "dark" | "split";

const SURFACE = {
  light: { window: "#ffffff", bar: "#f4f4f5", side: "#f4f4f5", line: "#d4d4d8" },
  dark: { window: "#18181b", bar: "#27272a", side: "#27272a", line: "#52525b" },
};

/// A small window drawn in one of the two looks.
function MiniWindow({ tone }: { tone: "light" | "dark" }) {
  const s = SURFACE[tone];
  return (
    <View style={{ flex: 1, backgroundColor: s.window }}>
      <View
        style={{
          height: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 2,
          paddingHorizontal: 4,
          backgroundColor: s.bar,
        }}
      >
        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: s.line }} />
        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: s.line }} />
      </View>
      <View style={{ flex: 1, flexDirection: "row", gap: 4, padding: 4 }}>
        <View style={{ width: 12, borderRadius: 2, backgroundColor: s.side }} />
        <View style={{ flex: 1, gap: 4, paddingTop: 2 }}>
          {(["75%", "100%", "50%"] as const).map((width) => (
            <View
              key={width}
              style={{
                height: 4,
                width,
                borderRadius: 2,
                backgroundColor: s.line,
              }}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function Preview({ tone }: { tone: Tone }) {
  const border = useSemantic("separator");
  return (
    <View
      style={{
        height: 64,
        borderRadius: RADIUS.control,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: border,
        overflow: "hidden",
        flexDirection: "row",
      }}
    >
      {tone === "split" ? (
        <>
          <MiniWindow tone="light" />
          <MiniWindow tone="dark" />
        </>
      ) : (
        <MiniWindow tone={tone} />
      )}
    </View>
  );
}

/// One card per choice with a small preview of it, read as a radio group, like the
/// desktop's theme cards.
export function ThemeCards<T extends string>({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: T;
  choices: { value: T; label: string; tone: Tone }[];
  onChange: (next: T) => void;
}) {
  const scheme = useScheme();
  const accent = TINT.blue[scheme];
  const border = useSemantic("separator");
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ flexDirection: "row", gap: SPACE.sm }}
    >
      {choices.map((choice) => {
        const on = choice.value === value;
        return (
          <Pressable
            key={choice.value}
            accessibilityRole="radio"
            accessibilityLabel={choice.label}
            accessibilityState={{ checked: on }}
            onPress={() => {
              haptic("select");
              onChange(choice.value);
            }}
            style={({ pressed }) => ({
              flex: 1,
              gap: SPACE.xs,
              padding: SPACE.xs,
              borderRadius: RADIUS.control + 4,
              borderCurve: "continuous",
              borderWidth: on ? 2 : 1,
              borderColor: on ? accent : border,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <View>
              <Preview tone={choice.tone} />
              {on ? (
                <View
                  style={{
                    position: "absolute",
                    right: 4,
                    bottom: 4,
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: accent,
                  }}
                >
                  <IconCheck size={13} color="#ffffff" strokeWidth={3} />
                </View>
              ) : null}
            </View>
            <Label
              type="subheadline"
              weight="500"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={{ paddingHorizontal: 2 }}
            >
              {choice.label}
            </Label>
          </Pressable>
        );
      })}
    </View>
  );
}
