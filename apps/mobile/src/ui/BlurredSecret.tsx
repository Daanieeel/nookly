import { scramble } from "@nookly/ui/lib/scramble";
import { IconCopy, IconEye, IconEyeOff } from "@tabler/icons-react-native";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useClipboard } from "./clipboard.tsx";
import { haptic } from "./haptics.ts";
import { useRaised, useSemantic } from "./kit/scheme.ts";
import { CORNER, FACE, RADIUS, SPACE } from "./tokens.ts";
import { MIN_TOUCH } from "./touch.ts";

/// A secret kept out of sight (the desktop's `BlurredSecret`): a key shown blurred, made of
/// random characters while it is, so it can't be read over a shoulder, selected or copied from
/// the screen. A tap shows it, another hides it. The copy button always copies the real one.
/// The blur is the glyphs made clear with only their shadow drawn.
export function BlurredSecret({ value, label }: { value: string; label: string }) {
  const [shown, setShown] = useState(false);
  const decoy = useMemo(() => scramble(value), [value]);
  const clipboard = useClipboard();
  const text = useSemantic("label");
  const muted = useSemantic("secondaryLabel");
  const raised = useRaised();
  const edge = useSemantic("controlEdge");
  const Eye = shown ? IconEyeOff : IconEye;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.sm }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={shown ? `Hide ${label}` : `Show ${label}`}
        accessibilityState={{ selected: shown }}
        onPress={() => {
          haptic(shown ? "select" : "toggle");
          setShown(!shown);
        }}
        style={[
          CORNER,
          {
            flex: 1,
            minHeight: MIN_TOUCH,
            flexDirection: "row",
            alignItems: "center",
            gap: SPACE.sm,
            paddingHorizontal: SPACE.md,
            borderRadius: RADIUS.control,
            borderWidth: 1,
            borderColor: edge,
            backgroundColor: raised,
          },
        ]}
      >
        <Text
          testID="secret-text"
          selectable={shown}
          style={[
            { flex: 1, fontFamily: FACE["500"], fontSize: 15, letterSpacing: 1 },
            shown
              ? { color: text }
              : {
                  color: "transparent",
                  textShadowColor: text,
                  textShadowRadius: 7,
                  textShadowOffset: { width: 0, height: 0 },
                },
          ]}
        >
          {shown ? value : decoy}
        </Text>
        <Eye size={18} color={muted} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Copy ${label}`}
        onPress={() => void clipboard.copy(value)}
        style={{
          minWidth: MIN_TOUCH,
          minHeight: MIN_TOUCH,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <IconCopy size={20} color={muted} />
      </Pressable>
    </View>
  );
}
