import { IconArrowUp, IconX } from "@tabler/icons-react-native";
import { type ReactNode, type RefObject, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useSemantic, useSemanticPair } from "../kit/scheme.ts";
import { Text } from "../Text.tsx";
import { useTheme } from "../theme.ts";
import { CORNER, FACE, SPACE, TYPE } from "../tokens.ts";
import { MIN_TOUCH } from "../touch.ts";
import { type Option, OptionList } from "./OptionList.tsx";
import { RoundButton, Sheet, SheetFooter, SheetHeader, useSheet } from "./Sheet.tsx";

/// Linear's compose sheet (D65), for creating a jot, a task, an assignment, an entry: a
/// round close button top left, what it goes into as a pill in the middle, a round send
/// button top right that lights up once there is something to send; a big title; the body
/// below; the properties as a row of pills riding on the keyboard.

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
  return (
    <SheetHeader>
      <View className="flex-row items-center gap-2 px-4 pb-1 pt-2">
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

/// The big title field at the top of the body.
export function ComposeTitle({
  label,
  value,
  onChangeText,
  placeholder,
  onSubmit,
  autoFocus = true,
  ref,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
  ref?: RefObject<TextInput | null>;
}) {
  const text = useSemantic("label");
  const muted = useSemanticPair("tertiaryLabel");
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
  return (
    <SheetFooter>
      {children ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
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
}: {
  label: string;
  icon?: ReactNode;
  /// What is set, or null for nothing yet.
  value: string | null;
  onPress: () => void;
}) {
  const fill = useSemantic("fill");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value ?? "None"}`}
      onPress={onPress}
      style={({ pressed }) => [
        CORNER,
        {
          minHeight: MIN_TOUCH,
          borderRadius: MIN_TOUCH / 2,
          paddingHorizontal: SPACE.lg,
          flexDirection: "row",
          alignItems: "center",
          gap: SPACE.sm,
          backgroundColor: fill,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      {icon}
      <Text numberOfLines={1} tone={value === null ? "muted" : "default"} style={{ maxWidth: 180 }}>
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
  placeholder,
}: {
  label: string;
  icon?: ReactNode;
  value: Id | null;
  options: Option<Id>[];
  onChange: (id: Id) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value);
  return (
    <>
      <Pill
        label={label}
        icon={current?.icon ?? icon}
        value={current?.label ?? null}
        onPress={() => setOpen(true)}
      />
      <Sheet open={open} onOpenChange={setOpen} title={label} presentation="card">
        <OptionList
          label={label}
          options={options}
          value={value}
          onChange={onChange}
          searchPlaceholder={placeholder}
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
