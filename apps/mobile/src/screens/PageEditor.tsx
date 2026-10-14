import {
  type BlockRecord,
  TEXT_BLOCK_TYPES,
  addBlock,
  deleteBlock,
  updateBlock,
} from "@nookly/shared/data";
import { useEffect, useState } from "react";
import { ActionSheetIOS, Alert, Platform, TextInput, View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import { useBlocks } from "../data/queries.ts";
import { IconDots } from "@tabler/icons-react-native";
import { Button, IconButton } from "../ui/Button.tsx";
import { Text } from "../ui/Text.tsx";
import { FONT, useTheme } from "../ui/theme.ts";

const KINDS: { type: string; label: string }[] = [
  { type: "paragraph", label: "Text" },
  { type: "heading1", label: "Heading" },
  { type: "heading2", label: "Subheading" },
  { type: "bulleted_list", label: "Bulleted list" },
  { type: "numbered_list", label: "Numbered list" },
  { type: "quote", label: "Quote" },
];

const LIST_MARK = new Map([
  ["bulleted_list", "•"],
  ["numbered_list", "1."],
]);

/// Asks what to do with a block: turn it into another kind, or delete it.
function chooseAction(onKind: (type: string) => void, onDelete: () => void) {
  const options = [...KINDS.map((k) => k.label), "Delete block", "Cancel"];
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      { options, destructiveButtonIndex: KINDS.length, cancelButtonIndex: KINDS.length + 1 },
      (index) => {
        if (index < KINDS.length) onKind(KINDS[index].type);
        else if (index === KINDS.length) onDelete();
      },
    );
    return;
  }
  Alert.alert("Block", undefined, [
    ...KINDS.map((k) => ({ text: k.label, onPress: () => onKind(k.type) })),
    { text: "Delete block", style: "destructive" as const, onPress: onDelete },
    { text: "Cancel", style: "cancel" as const },
  ]);
}

function BlockField({ block, readOnly }: { block: BlockRecord; readOnly: boolean }) {
  const theme = useTheme();
  const [text, setText] = useState(block.content);
  const [focused, setFocused] = useState(false);
  // A change from elsewhere (sync) shows unless this block is being typed in.
  useEffect(() => {
    if (!focused) setText(block.content);
  }, [block.content, focused]);
  const save = useLocalWrite((db, input: { content: string; type?: string }) =>
    updateBlock(db, block.id, input.content, input.type),
  );
  const remove = useLocalWrite((db) => deleteBlock(db, block.id));
  const editable = !readOnly && TEXT_BLOCK_TYPES.includes(block.blockType);
  const heading = block.blockType.startsWith("heading");
  const style = {
    fontFamily: heading ? FONT.heading : block.blockType === "code" ? "Menlo" : FONT.regular,
    fontSize:
      block.blockType === "heading1" ? theme.text.xl : heading ? theme.text.lg : theme.text.sm,
    color: block.blockType === "quote" ? theme.colors.mutedForeground : theme.colors.foreground,
    padding: 0,
    flex: 1,
  };
  if (!editable && !TEXT_BLOCK_TYPES.includes(block.blockType)) {
    return (
      <View
        style={{
          padding: theme.space(2),
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.muted,
        }}
      >
        <Text variant="small" tone="muted" style={{ fontFamily: "Menlo" }}>
          {block.content || block.blockType}
        </Text>
      </View>
    );
  }
  return (
    <View
      style={{
        flexDirection: "row",
        gap: theme.space(2),
        borderLeftWidth: block.blockType === "quote" ? 2 : 0,
        borderLeftColor: theme.colors.border,
        paddingLeft: block.blockType === "quote" ? theme.space(3) : 0,
      }}
    >
      {LIST_MARK.has(block.blockType) ? (
        <Text tone="muted">{LIST_MARK.get(block.blockType)}</Text>
      ) : null}
      <TextInput
        accessibilityLabel={`${KINDS.find((k) => k.type === block.blockType)?.label ?? "Text"} block`}
        value={text}
        editable={editable}
        multiline
        placeholder={editable ? "Write something" : undefined}
        placeholderTextColor={theme.colors.mutedForeground}
        onFocus={() => setFocused(true)}
        onChangeText={setText}
        onEndEditing={() => {
          setFocused(false);
          if (text !== block.content) save.mutate({ content: text });
        }}
        style={style}
      />
      {editable ? (
        <IconButton
          label="Block Options"
          icon={<IconDots size={18} color={theme.colors.mutedForeground} />}
          onPress={() =>
            chooseAction(
              (type) => save.mutate({ content: text, type }),
              () => remove.mutate(undefined),
            )
          }
        />
      ) : null}
    </View>
  );
}

/// A page's blocks, one text field each, in order. Text blocks edit as markdown like
/// on the desktop; tables, math and custom blocks show as they are and stay untouched.
export function PageEditor({ entityId, readOnly }: { entityId: string; readOnly: boolean }) {
  const theme = useTheme();
  const { data: blocks = [] } = useBlocks(entityId);
  const add = useLocalWrite((db) => addBlock(db, entityId, "paragraph", ""));
  return (
    <View style={{ gap: theme.space(3) }}>
      {blocks.map((block) => (
        <BlockField key={block.id} block={block} readOnly={readOnly} />
      ))}
      {!readOnly ? (
        <Button label="Add Block" variant="ghost" onPress={() => add.mutate(undefined)} />
      ) : null}
    </View>
  );
}
