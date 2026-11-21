import { useSheetSubmit } from "./layers.ts";
import { useCloseGuard } from "./close-guard.ts";
import { IconArrowUp, IconX } from "@tabler/icons-react-native";
import {
  type ComponentType,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { create } from "zustand";
import { Button } from "../Button.tsx";
import { useIsTablet } from "../pane.tsx";
import { Pressable, ScrollView, TextInput, type TextInputProps, View } from "react-native";
import { Glyph } from "../kit/Glyph.tsx";
import { useControlStyle, useScheme, useSemantic, useSemanticPair } from "../kit/scheme.ts";
import { Text } from "../Text.tsx";
import { useTheme } from "../theme.ts";
import { CORNER, FACE, PRIMARY, PRIMARY_GLOSS, RADIUS, SPACE, TYPE, tint } from "../tokens.ts";
import { MIN_TOUCH } from "../touch.ts";
import { type Option, OptionList } from "./OptionList.tsx";
import { RoundButton, Sheet, SheetFooter, SheetHeader, useSheet } from "./Sheet.tsx";

/// Linear's compose sheet (D65), for creating a jot, a task, an assignment, an entry: a
/// round close button top left, what it goes into as a pill in the middle, a round send
/// button top right that lights up once there is something to send; a big title; the body
/// below; the properties as a row of pills riding on the keyboard.

/// A tablet's send button, which sits in the footer (the desktop's Create at the bottom
/// right) while the header that knows what it sends is at the top. One compose is open at a
/// time.
const useComposeSend = create<{
  send: { label: string; canSend: boolean; onSend: () => void } | null;
}>(() => ({ send: null }));

/// The top of a compose sheet: close, context, send.
export function ComposeHeader({
  context,
  sendLabel,
  canSend,
  onSend,
}: {
  /// What it is made in (the Space), as a pill.
  context?: ReactNode;
  /// Read out for the send button: "Create Task".
  sendLabel: string;
  canSend: boolean;
  onSend: () => void;
}) {
  const sheet = useSheet();
  const theme = useTheme();
  const tablet = useIsTablet();
  // Command Return sends, in a tablet's dialog.
  useSheetSubmit(canSend ? onSend : undefined);
  const latest = useRef(onSend);
  latest.current = onSend;
  // Something written asks before the dialog goes (a phone's sheet keeps its own ways).
  useCloseGuard(tablet && canSend, () => <DiscardStep />);
  useEffect(() => {
    if (!tablet) return;
    useComposeSend.setState({
      send: { label: sendLabel, canSend, onSend: () => latest.current() },
    });
    return () => useComposeSend.setState({ send: null });
  }, [tablet, sendLabel, canSend]);
  if (tablet) {
    // The desktop's dialog: what it goes into at the start, Close at the end.
    return (
      <SheetHeader>
        <View
          testID="compose-header"
          className="flex-row items-center gap-2 px-4 pt-2"
          style={{ paddingBottom: SPACE.md }}
        >
          <View className="flex-1 items-start">{context}</View>
          <RoundButton label="Close" onPress={() => sheet?.dismiss()}>
            <IconX size={22} color={theme.colors.foreground} />
          </RoundButton>
        </View>
      </SheetHeader>
    );
  }
  return (
    <SheetHeader>
      <View
        testID="compose-header"
        className="flex-row items-center gap-2 px-4 pt-2"
        // Room between the buttons and the title under them.
        style={{ paddingBottom: SPACE.md }}
      >
        <RoundButton label="Close" onPress={() => sheet?.close()}>
          <IconX size={22} color={theme.colors.foreground} />
        </RoundButton>
        <View className="flex-1 items-center">{context}</View>
        <RoundButton label={sendLabel} tone="primary" disabled={!canSend} onPress={onSend}>
          <IconArrowUp
            size={22}
            color={canSend ? theme.colors.primaryForeground : theme.colors.mutedForeground}
          />
        </RoundButton>
      </View>
    </SheetHeader>
  );
}

/// What a half written form asks before its dialog goes: back to it, or let it go.
function DiscardStep() {
  const sheet = useSheet();
  return (
    <View style={{ gap: SPACE.lg }}>
      <Text tone="muted">What you wrote here will be lost.</Text>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: SPACE.sm }}>
        <Button label="Keep Editing" variant="ghost" onPress={() => sheet?.back()} />
        <Button label="Discard" variant="destructive" onPress={() => sheet?.close()} />
      </View>
    </View>
  );
}

/// The big title field at the top of the body.
export function ComposeTitle({
  label,
  value,
  onChangeText,
  placeholder,
  onSubmit,
  autoFocus = true,
  ref,
  input,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
  ref?: RefObject<TextInput | null>;
  /// How the keyboard types it, when it is not words (an address).
  input?: TitleInput;
}) {
  const text = useSemantic("label");
  const muted = useSemanticPair("placeholder");
  return (
    <TextInput
      ref={ref}
      accessibilityLabel={label}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={muted.color}
      autoFocus={autoFocus}
      multiline
      submitBehavior="blurAndSubmit"
      returnKeyType="next"
      onSubmitEditing={onSubmit}
      maxFontSizeMultiplier={1.6}
      {...input}
      style={{
        fontFamily: FACE["700"],
        fontSize: TYPE.title2.fontSize,
        lineHeight: TYPE.title2.lineHeight,
        color: text,
        paddingVertical: SPACE.xs,
      }}
    />
  );
}

export type TitleInput = Pick<TextInputProps, "keyboardType" | "autoCapitalize" | "autoCorrect">;

/// A short line under the title with its icon (where an entry is).
export function ComposeLine({
  label,
  icon: Icon,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  icon: ComponentType<{ size?: number; color?: string }>;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
}) {
  const text = useSemantic("label");
  const muted = useSemanticPair("placeholder");
  const theme = useTheme();
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", gap: SPACE.sm, minHeight: MIN_TOUCH }}
    >
      <Icon size={18} color={theme.colors.mutedForeground} />
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={muted.color}
        returnKeyType="next"
        maxFontSizeMultiplier={1.6}
        style={{
          flex: 1,
          fontFamily: FACE["400"],
          fontSize: TYPE.body.fontSize,
          color: text,
          paddingVertical: SPACE.xs,
        }}
      />
    </View>
  );
}

/// The body as plain text, for something whose description is a line of text rather than
/// a page (a Calendar entry).
export function ComposeText({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
}) {
  const text = useSemantic("label");
  const muted = useSemanticPair("placeholder");
  return (
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={muted.color}
      multiline
      textAlignVertical="top"
      maxFontSizeMultiplier={1.6}
      style={{
        minHeight: 120,
        fontFamily: FACE["400"],
        fontSize: TYPE.body.fontSize,
        lineHeight: TYPE.body.lineHeight,
        color: text,
        paddingVertical: SPACE.xs,
      }}
    />
  );
}

/// The bottom of a compose sheet, pinned on the keyboard: the row of property pills (it
/// scrolls sideways), and under it the editor's formatting bar on a rounded pill while the
/// body has the keyboard.
export function ComposeFooter({
  children,
  toolbar,
}: {
  children?: ReactNode;
  toolbar?: ReactNode;
}) {
  const tablet = useIsTablet();
  const send = useComposeSend((s) => s.send);
  if (tablet) {
    // The desktop's quick create: the pills wrap under the fields, then Create at the right.
    return (
      <SheetFooter>
        {children ? (
          <View
            testID="compose-pills"
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: SPACE.sm,
              paddingHorizontal: SPACE.lg,
              paddingTop: SPACE.sm,
            }}
          >
            {children}
          </View>
        ) : null}
        {toolbar}
        {send ? (
          <View
            testID="compose-actions"
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              paddingHorizontal: SPACE.lg,
              paddingVertical: SPACE.md,
            }}
          >
            <Button label={send.label} disabled={!send.canSend} onPress={send.onSend} />
          </View>
        ) : null}
      </SheetFooter>
    );
  }
  return (
    <SheetFooter>
      {children ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          // A sideways list takes the room it is given; the pills keep their own height.
          style={{ flexGrow: 0 }}
          contentContainerStyle={{
            alignItems: "center",
            gap: SPACE.sm,
            paddingHorizontal: SPACE.lg,
            paddingVertical: SPACE.sm,
          }}
        >
          {children}
        </ScrollView>
      ) : null}
      {toolbar}
    </SheetFooter>
  );
}

/// One property as a pill: its icon and its value, muted with the property's name while
/// it is empty.
export function Pill({
  label,
  icon,
  value,
  onPress,
  checked,
}: {
  label: string;
  icon?: ReactNode;
  /// What is set, or null for nothing yet.
  value: string | null;
  onPress: () => void;
  /// A switch rather than a value (All day): read out as one, tinted while on.
  checked?: boolean;
}) {
  const control = useControlStyle();
  const toggle = checked !== undefined;
  return (
    <Pressable
      accessibilityRole={toggle ? "switch" : "button"}
      accessibilityLabel={toggle ? label : `${label}, ${value ?? "None"}`}
      accessibilityState={toggle ? { checked } : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        CORNER,
        control,
        // The default badge's look: the accent with its gloss, ring and shadows.
        checked && { ...PRIMARY_GLOSS, backgroundColor: PRIMARY, borderColor: "transparent" },
        {
          minHeight: MIN_TOUCH,
          borderRadius: RADIUS.control,
          paddingHorizontal: SPACE.lg,
          flexDirection: "row",
          alignItems: "center",
          gap: SPACE.sm,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      {icon}
      <Text
        numberOfLines={1}
        tone={value === null && !checked ? "muted" : "default"}
        style={[{ maxWidth: 180 }, checked ? { color: "#ffffff" } : null]}
      >
        {value ?? label}
      </Text>
    </Pressable>
  );
}

/// A pill that opens its choices as a floating card.
export function PillSelect<Id extends string>({
  label,
  icon,
  value,
  options,
  onChange,
}: {
  label: string;
  icon?: ReactNode;
  value: Id | null;
  options: Option<Id>[];
  onChange: (id: Id) => void;
}) {
  const [open, setOpen] = useState(false);
  const scheme = useScheme();
  const muted = useTheme().colors.mutedForeground;
  const current = options.find((o) => o.id === value);
  // The chosen option's own icon, as its row in the list draws it.
  const chosen = current?.glyph ? (
    <Glyph
      icon={current.glyph}
      size={18}
      color={current.tint ? tint(current.tint, scheme) : muted}
    />
  ) : null;
  return (
    <>
      <Pill
        label={label}
        icon={current?.icon ?? chosen ?? icon}
        value={current?.label ?? null}
        onPress={() => setOpen(true)}
      />
      <Sheet open={open} onOpenChange={setOpen} title={label} presentation="card">
        <OptionList
          label={label}
          options={options}
          value={value}
          onChange={onChange}
          search={options.length > 7}
        />
      </Sheet>
    </>
  );
}

/// A pill that opens anything as a floating card (a calendar, the labels).
export function PillSheet({
  label,
  icon,
  value,
  children,
}: {
  label: string;
  icon?: ReactNode;
  value: string | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pill label={label} icon={icon} value={value} onPress={() => setOpen(true)} />
      <Sheet open={open} onOpenChange={setOpen} title={label} presentation="card">
        {children}
      </Sheet>
    </>
  );
}
