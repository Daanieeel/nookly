import {
  type BlockRecord,
  TEXT_BLOCK_TYPES,
  addBlock,
  deleteBlock,
  updateBlock,
} from "@nookly/shared/data";
import { useEffect, useState } from "react";
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, TextInput, View } from "react-native";
import { LivePage } from "../editor/LivePage.tsx";
import { usePageSession } from "../editor/use-page-session.ts";
import { useLocalWrite } from "../data/context.tsx";
import { useBlocks } from "../data/queries.ts";
import { IconDots } from "@tabler/icons-react-native";
import { Button, IconButton } from "../ui/Button.tsx";
import { Text } from "../ui/Text.tsx";
import { EDITOR_BLOCK_CLASSES } from "@nookly/frontend/classes";
import { cn, splitText } from "../ui/classes.ts";
import { useTheme } from "../ui/theme.ts";

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
  const blockClasses = isStyledBlock(block.blockType)
    ? EDITOR_BLOCK_CLASSES[block.blockType]
    : EDITOR_BLOCK_CLASSES.paragraph;
  const quote = block.blockType === "quote";
  const { box, text: textClasses } = splitText(blockClasses);
  if (!editable && !TEXT_BLOCK_TYPES.includes(block.blockType)) {
    return (
      <View className={splitText(EDITOR_BLOCK_CLASSES.code).box}>
        <Text variant="small" tone="muted" className="font-mono">
          {block.content || block.blockType}
        </Text>
      </View>
    );
  }
  return (
    <View className={cn("flex-row gap-2", quote && box)}>
      {LIST_MARK.has(block.blockType) ? (
        <Text tone="muted">{LIST_MARK.get(block.blockType)}</Text>
      ) : null}
      <TextInput
        accessibilityLabel={`${KINDS.find((k) => k.type === block.blockType)?.label ?? "Text"} block`}
        value={text}
        editable={editable}
        multiline
        placeholder={editable ? "Write something" : undefined}
        onFocus={() => setFocused(true)}
        onChangeText={setText}
        onEndEditing={() => {
          setFocused(false);
          if (text !== block.content) save.mutate({ content: text });
        }}
        className={cn(
          "flex-1 p-0 font-sans text-foreground placeholder:text-muted-foreground",
          heading && "font-heading",
          !quote && box,
          textClasses,
        )}
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

function isStyledBlock(type: string): type is keyof typeof EDITOR_BLOCK_CLASSES {
  return Object.keys(EDITOR_BLOCK_CLASSES).includes(type);
}

/// A page's blocks, one text field each, in order: how a page edits while it has no
/// live document (signed out, or offline and never opened). Text blocks edit as
/// markdown; tables, math and custom blocks show as they are and stay untouched.
function RowsEditor({ entityId, readOnly }: { entityId: string; readOnly: boolean }) {
  const { data: blocks = [] } = useBlocks(entityId);
  const add = useLocalWrite((db) => addBlock(db, entityId, "paragraph", ""));
  return (
    <View className="gap-3">
      {blocks.map((block) => (
        <BlockField key={block.id} block={block} readOnly={readOnly} />
      ))}
      {!readOnly ? (
        <Button label="Add Block" variant="ghost" onPress={() => add.mutate(undefined)} />
      ) : null}
    </View>
  );
}

/// A page's body: the live editor when this phone has the page's document, else its
/// blocks as text fields (DECISIONS.md D6). Only notes and jots have a document; the
/// description of any other item is its blocks (`live` off).
export function PageEditor({
  entityId,
  readOnly,
  live = true,
}: {
  entityId: string;
  readOnly: boolean;
  live?: boolean;
}) {
  return live ? (
    <LiveOrRows entityId={entityId} readOnly={readOnly} />
  ) : (
    <RowsEditor entityId={entityId} readOnly={readOnly} />
  );
}

function LiveOrRows({ entityId, readOnly }: { entityId: string; readOnly: boolean }) {
  const page = usePageSession(entityId);
  if (page.state === "live") {
    return <LivePage session={page.session} editable={!readOnly && !page.session.readOnly} />;
  }
  if (page.state === "waiting") {
    return (
      <View className="min-h-40 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  return <RowsEditor entityId={entityId} readOnly={readOnly} />;
}
