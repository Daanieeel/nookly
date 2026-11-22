import { useIsTablet } from "./pane.tsx";
import { IconEye, IconEyeOff } from "@tabler/icons-react-native";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import {
  type ColorValue,
  type LayoutChangeEvent,
  Pressable,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { Label } from "./kit/Label.tsx";
import { haptic } from "./haptics.ts";
import { useRaised, useScheme, useSemantic } from "./kit/scheme.ts";
import { useRevealWhileTyping } from "./Screen.tsx";
import { useSectionRadius } from "./sheet/in-sheet.ts";
import {
  CORNER,
  FACE,
  GUTTER,
  PRIMARY,
  SPACE,
  TINT,
  TYPE,
  elevation,
  focusDepth,
} from "./tokens.ts";
import { MIN_TOUCH } from "./touch.ts";

/// A field's name above what it holds, for the few places that lay a control out on their
/// own (a list of labels to tick).
export function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  const scheme = useScheme();
  return (
    <View style={{ paddingHorizontal: GUTTER, paddingBottom: SPACE.xs }}>
      <Label type="footnote" color="secondaryLabel">
        {label.toUpperCase()}
        {required ? <Text style={{ color: TINT.red[scheme] }}> *</Text> : null}
      </Label>
    </View>
  );
}

/// Text typed into a form. On its own it is a raised box with a hairline edge, as the
/// desktop's input, its name small above it; focused, the edge and the name take the accent,
/// and an error turns the edge red with the message under it. As a row of a `FormSection` it
/// is an iOS form row with its name above the text. Either way an icon may stand for the
/// name, and a tap anywhere on it puts the cursor in it.
export function Field({
  label,
  required,
  error,
  invalid = false,
  multiline,
  icon,
  showName = false,
  className: _className,
  style,
  onFocus,
  onBlur,
  secureTextEntry,
  ...props
}: TextInputProps & {
  label: string;
  required?: boolean;
  error?: string;
  /// Drawn as wrong, red edge and all, with no message of its own: one is shown elsewhere.
  invalid?: boolean;
  className?: string;
  /// Stands for the name at the start of the row; the name is still read out.
  icon?: ReactNode;
  /// Keep the name drawn above the field beside its icon, for a form where every field is named.
  showName?: boolean;
}) {
  const text = useSemantic("label");
  const muted = useSemantic("placeholder");
  const controlEdge = useSemantic("controlEdge");
  const raised = useRaised();
  const scheme = useScheme();
  const radius = useSectionRadius();
  const [focused, setFocused] = useState(false);
  // A locked field (a form being sent) is faded.
  const locked = props.editable === false;
  const wrong = Boolean(error) || invalid;
  // A buzz as the field turns wrong, not for one that opens wrong nor for a new message.
  const wasWrong = useRef(wrong);
  useEffect(() => {
    if (wrong && !wasWrong.current) haptic("error");
    wasWrong.current = wrong;
  }, [wrong]);
  // A tablet's field is the desktop's, at the touch minimum (3.8).
  const tablet = useIsTablet();
  const field = useRef<TextInput>(null);
  // What the page keeps above the keyboard while typing: the whole field, its name too.
  const box = useRef<View>(null);
  const boxHeight = useRef(0);
  useRevealWhileTyping(box, focused, () => boxHeight.current);
  const measured = (event: LayoutChangeEvent) => {
    boxHeight.current = event.nativeEvent.layout.height;
  };
  const accent = TINT.blue[scheme];
  const name =
    icon && !showName ? null : (
      <Label
        type="footnote"
        weight="500"
        color="secondaryLabel"
        tint={focused ? accent : undefined}
        style={{ paddingHorizontal: SPACE.xs }}
      >
        {label}
        {required ? <Text style={{ color: TINT.red[scheme] }}> *</Text> : null}
      </Label>
    );
  const input = (
    <TextInput
      ref={field}
      accessibilityLabel={label}
      aria-invalid={wrong}
      multiline={multiline}
      placeholderTextColor={muted}
      {...props}
      secureTextEntry={secureTextEntry}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[
        {
          flex: 1,
          minHeight: multiline ? 88 : MIN_TOUCH,
          fontFamily: FACE["400"],
          fontSize: TYPE.body.fontSize,
          lineHeight: multiline ? TYPE.body.lineHeight : undefined,
          color: text,
          paddingVertical: multiline ? SPACE.sm : 0,
        },
        style,
      ]}
      textAlignVertical={multiline ? "top" : "center"}
    />
  );
  const ring = wrong ? TINT.red[scheme] : PRIMARY;
  const border = wrong || focused ? ring : controlEdge;
  return (
    <Pressable
      ref={box}
      testID={`field-${label}`}
      onLayout={measured}
      accessible={false}
      onPress={() => field.current?.focus()}
      style={{ flexDirection: "column", gap: SPACE.xs + 2, opacity: locked ? 0.5 : 1 }}
    >
      {name}
      <View
        testID="field-box"
        style={[
          CORNER,
          {
            flexDirection: "row",
            alignItems: multiline ? "flex-start" : "center",
            gap: SPACE.md,
            paddingHorizontal: SPACE.md + 2,
            minHeight: tablet ? MIN_TOUCH : MIN_TOUCH + 6,
            borderRadius: radius,
            borderWidth: 1,
            borderColor: border,
            backgroundColor: raised,
          },
          // The desktop's focus ring: the edge in the accent and a faint halo round it.
          focused || wrong ? focusDepth(ring, scheme) : elevation("control", scheme),
        ]}
      >
        {icon ? <View style={{ paddingTop: multiline ? SPACE.md : 0 }}>{icon}</View> : null}
        {input}
        {secureTextEntry ? <RevealEye input={field} locked={locked} color={muted} /> : null}
      </View>
      {error ? (
        <Label
          type="footnote"
          tint={TINT.red[scheme]}
          accessibilityLiveRegion="polite"
          style={{ paddingHorizontal: SPACE.xs }}
        >
          {error}
        </Label>
      ) : null}
    </Pressable>
  );
}

/// The eye of a password field: it shows the typed password or hides it again. It changes the
/// input in place and draws only itself, so the field (and what is being typed in it) is not
/// rendered again.
function RevealEye({
  input,
  locked,
  color,
}: {
  input: RefObject<TextInput | null>;
  locked: boolean;
  color: ColorValue;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={revealed ? "Hide password" : "Show password"}
      accessibilityState={{ disabled: locked }}
      disabled={locked}
      hitSlop={8}
      onPress={() => {
        // A click as the text is shown, a lighter tick as it is hidden again.
        haptic(revealed ? "select" : "toggle");
        input.current?.setNativeProps({ secureTextEntry: revealed });
        setRevealed(!revealed);
      }}
      style={{
        minWidth: 28,
        minHeight: MIN_TOUCH,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {revealed ? <IconEyeOff size={20} color={color} /> : <IconEye size={20} color={color} />}
    </Pressable>
  );
}
