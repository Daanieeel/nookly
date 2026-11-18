import { IconStack2 } from "@tabler/icons-react-native";
import { useEffect, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Button } from "./Button.tsx";
import { Field } from "./Field.tsx";
import { Floating } from "./floating.tsx";
import {
  PASTE_BAR_MARGIN,
  PASTE_BAR_ROOM,
  pasteBarCorners,
  screenCornerRadius,
} from "./FloatingField.tsx";
import { haptic } from "./haptics.ts";
import { Label } from "./kit/Label.tsx";
import { useScheme, useSemantic, useSemanticPair } from "./kit/scheme.ts";
import { FADE, SPRING } from "./motion.ts";
import { useReduceMotion } from "./reduce-motion.ts";
import { Sheet } from "./sheet/Sheet.tsx";
import { CORNER, DEPTH, SPACE, TINT } from "./tokens.ts";

/// How long the bar stays after saving, to say so.
const LINGER = 1200;

/// The desktop's save bar (`ViewSaveBar`) on the phone: once a page's filters or display
/// change, a pill floats at the bottom of the screen, snug in its corners like the paste bars,
/// with Discard, Save as View (only where the page has Views) and Save. Saving keeps the
/// change as what the page opens with, or in the View it shows. It stays a moment after
/// saving to say so. `above` lifts it over a paste bar. Put it at the end of the page: it keeps
/// room there for itself while it shows.
export function SaveBar({
  dirty,
  onDiscard,
  onSave,
  onSaveAsView,
  above = 0,
}: {
  dirty: boolean;
  onDiscard: () => void;
  onSave: () => void | Promise<void>;
  /// Makes a new View of what is shown, named; a page without Views leaves it out.
  onSaveAsView?: (name: string) => Promise<void>;
  above?: number;
}) {
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [naming, setNaming] = useState(false);
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), LINGER);
    return () => clearTimeout(timer);
  }, [saved]);
  const shown = dirty || saved;
  const save = async () => {
    setFailed(false);
    try {
      await onSave();
      haptic("success");
      setSaved(true);
    } catch {
      setFailed(true);
    }
  };
  return (
    <>
      {/* Room at the end of the page, so the bar never covers its last row. */}
      {shown ? <View style={{ height: PASTE_BAR_ROOM }} /> : null}
      <Floating>
        <Bar shown={shown} above={above}>
          {dirty ? <PillButton label="Discard" tone="plain" onPress={onDiscard} /> : null}
          {dirty && onSaveAsView ? (
            <PillButton
              label="Save as View"
              tone="gray"
              icon={IconStack2}
              onPress={() => setNaming(true)}
            />
          ) : null}
          <PillButton
            label={failed ? "Couldn't Save" : saved && !dirty ? "Saved" : "Save"}
            tone="accent"
            onPress={() => dirty && void save()}
          />
        </Bar>
      </Floating>
      {onSaveAsView ? (
        <NameView open={naming} onOpenChange={setNaming} onSave={onSaveAsView} />
      ) : null}
    </>
  );
}

/// The pill, rising from the bottom on a spring as it appears and sinking away after.
function Bar({
  shown,
  above,
  children,
}: {
  shown: boolean;
  above: number;
  children: React.ReactNode;
}) {
  const still = useReduceMotion();
  const card = useSemantic("sheetCard");
  const separator = useSemantic("separator");
  const corners = pasteBarCorners(screenCornerRadius(useWindowDimensions()));
  const open = useSharedValue(0);
  const [present, setPresent] = useState(shown);
  useEffect(() => {
    if (shown) setPresent(true);
    const done = (finished?: boolean) => {
      "worklet";
      if (finished && !shown) runOnJS(setPresent)(false);
    };
    open.value = still
      ? withTiming(shown ? 1 : 0, { duration: shown ? FADE.in : FADE.out }, done)
      : withSpring(shown ? 1 : 0, SPRING.sheet, done);
  }, [shown, still, open]);
  const rise = useAnimatedStyle(() => ({
    opacity: still ? open.value : Math.min(1, open.value * 2),
    transform: [{ translateY: still ? 0 : (1 - open.value) * (corners.height + SPACE.xl) }],
  }));
  if (!present) return null;
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          position: "absolute",
          left: PASTE_BAR_MARGIN,
          right: PASTE_BAR_MARGIN,
          bottom: PASTE_BAR_MARGIN + above,
        },
        rise,
      ]}
    >
      <View
        testID="save-bar"
        accessibilityLabel="Unsaved changes"
        style={[
          CORNER,
          DEPTH.floating,
          {
            height: corners.height,
            borderRadius: corners.top,
            padding: corners.button.inset,
            gap: SPACE.xs,
            flexDirection: "row",
            backgroundColor: card,
            borderWidth: 1,
            borderColor: separator,
          },
        ]}
      >
        {children}
      </View>
    </Animated.View>
  );
}

/// A button of the bar, its corners nested in the bar's.
function PillButton({
  label,
  tone,
  icon: Icon,
  onPress,
}: {
  label: string;
  tone: "plain" | "gray" | "accent";
  icon?: typeof IconStack2;
  onPress: () => void;
}) {
  const scheme = useScheme();
  const fill = useSemantic("fill");
  const text = useSemanticPair("label");
  const corners = pasteBarCorners(screenCornerRadius(useWindowDimensions()));
  const background = tone === "accent" ? TINT.blue[scheme] : tone === "gray" ? fill : undefined;
  // An icon takes a plain colour; the label the system's own.
  const color = tone === "accent" ? "#ffffff" : text.color;
  const iconColor = tone === "accent" ? "#ffffff" : text.hex;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        CORNER,
        {
          flex: tone === "plain" ? 0 : 1,
          paddingHorizontal: SPACE.lg,
          borderRadius: corners.button.top,
          backgroundColor: background,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: SPACE.xs,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      {Icon ? <Icon size={18} color={iconColor} /> : null}
      <Label type="subheadline" weight="600" tint={color} numberOfLines={1}>
        {label}
      </Label>
    </Pressable>
  );
}

/// The name of a new View, asked for in a card as the desktop's dialog does.
function NameView({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "pending" | "error">("idle");
  const submit = async () => {
    const title = name.trim();
    if (!title) return;
    setStatus("pending");
    try {
      await onSave(title);
      setName("");
      setStatus("idle");
      onOpenChange(false);
    } catch {
      setStatus("error");
    }
  };
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Save as View"
      presentation="card"
      kind="form"
    >
      <View style={{ gap: SPACE.md }}>
        <Field
          label="View name"
          placeholder="Open work"
          value={name}
          onChangeText={setName}
          autoFocus
        />
        <Button
          label="Save View"
          status={status === "pending" ? "pending" : status === "error" ? "error" : "idle"}
          errorLabel="Couldn't save"
          disabled={name.trim().length === 0}
          onPress={() => void submit()}
        />
      </View>
    </Sheet>
  );
}
