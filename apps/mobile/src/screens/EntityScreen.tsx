import {
  DUPLICATE_TYPES,
  PORTABLE_TYPES,
  type EntityRecord,
  exportNooklyFile,
  nooklyFileNoun,
  duplicateEntity,
  markOpened,
  renameEntity,
  restoreEntity,
  setPinned,
  trashEntity,
} from "@nookly/shared/data";
import { SHAREABLE_TYPES, isSharedSpace } from "@nookly/shared/api";
import { IconChevronLeft, IconDots, IconInfoCircle } from "@tabler/icons-react-native";
import { File, Paths } from "expo-file-system";
import { Stack, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EditorToolbar } from "../editor/EditorToolbar.tsx";
import { useAppData, useLocalWrite, useSyncState } from "../data/context.tsx";
import { useEntity, useSpaces } from "../data/queries.ts";
import { Badge, SpaceDot } from "../ui/Badge.tsx";
import { useTheme } from "../ui/theme.ts";
import { IconButton } from "../ui/Button.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { ConflictBadge } from "./ConflictBadge.tsx";
import { DetailsDrawer, useDetails } from "../shell/DetailsDrawer.tsx";
import { useSplit } from "../shell/split-context.ts";
import { useInspectorShown, useIsTablet } from "../ui/pane.tsx";
import { PartProvider } from "../ui/parts.tsx";
import { ItemParts } from "./ItemParts.tsx";
import { useReadOnly } from "./useReadOnly.ts";
import { useClipboard } from "../ui/clipboard.tsx";
import { type MenuItem, useMenu } from "../ui/menu.tsx";

function TitleField({ entity, readOnly }: { entity: EntityRecord; readOnly: boolean }) {
  const [title, setTitle] = useState(entity.title);
  useEffect(() => setTitle(entity.title), [entity.title]);
  const rename = useLocalWrite((db, next: string) => renameEntity(db, entity.id, next));
  return (
    <TextInput
      accessibilityLabel="Title"
      value={title}
      editable={!readOnly}
      placeholder="Untitled"
      onChangeText={setTitle}
      onEndEditing={() => title !== entity.title && rename.mutate(title.trim())}
      multiline
      className="p-0 font-heading text-xl text-foreground placeholder:text-muted-foreground"
    />
  );
}

/// What the "more" button of an open item offers: pin, share, move, duplicate, save, trash;
/// or restore for an item in the Trash.
function useEntityMenu(entity: EntityRecord): MenuItem[] {
  const router = useRouter();
  const details = useDetails();
  const split = useSplit();
  const clipboard = useClipboard();
  const signedIn = useSyncState((s) => s.user !== null);
  const shareable =
    SHAREABLE_TYPES.some((t) => t === entity.type) && !isSharedSpace(entity.spaceId);
  const pin = useLocalWrite((db, next: boolean) => setPinned(db, entity.id, next));
  const trash = useLocalWrite((db) => trashEntity(db, entity.id));
  const restore = useLocalWrite((db) => restoreEntity(db, entity.id));
  const copy = useLocalWrite((db) => duplicateEntity(db, entity.id));
  const saveFile = useLocalWrite(async (db, _: undefined) => {
    const { filename, text } = await exportNooklyFile(db, entity.id);
    const file = new File(Paths.cache, filename);
    if (file.exists) file.delete();
    file.create();
    file.write(text);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: filename });
    }
  });
  if (entity.deletedAt) {
    return [{ label: "Restore", onPress: () => restore.mutate(undefined) }];
  }
  const items: MenuItem[] = [];
  if (details) items.push({ label: "Show Details", onPress: () => details.show() });
  if (split) {
    items.push({ label: "Open Beside", onPress: () => split.show(`/entity/${entity.id}`) });
  }
  if (signedIn && shareable) {
    items.push({ label: "Share", onPress: () => router.push(`/new/share?entityId=${entity.id}`) });
  }
  // As the desktop copies it: pasted into a page, it becomes a mention of this item.
  items.push({
    label: "Copy Link",
    onPress: () => void clipboard.copy(`[${entity.title || entity.key}](mention:${entity.id})`),
  });
  items.push({ label: entity.pinned ? "Unpin" : "Pin", onPress: () => pin.mutate(!entity.pinned) });
  items.push({
    label: "Change Icon",
    onPress: () =>
      router.push({ pathname: "/pick/icon", params: { kind: "entity", id: entity.id } }),
  });
  if (entity.type !== "sub_task" && !isSharedSpace(entity.spaceId)) {
    items.push({
      label: "Move to Space",
      onPress: () => router.push(`/new/move?entityId=${entity.id}`),
    });
  }
  if (DUPLICATE_TYPES.includes(entity.type) && !isSharedSpace(entity.spaceId)) {
    items.push({
      label: "Duplicate",
      onPress: () => copy.mutate(undefined, { onSuccess: (id) => router.replace(`/entity/${id}`) }),
    });
  }
  if (PORTABLE_TYPES.includes(entity.type)) {
    items.push({
      label: `Save as Nookly ${nooklyFileNoun(entity.type)}`,
      onPress: () => saveFile.mutate(undefined),
    });
  }
  items.push({ label: "Move to Trash", destructive: true, onPress: () => trash.mutate(undefined) });
  return items;
}

/// One entity, as its own type shows it: a top bar (back, key, more), the title, and the
/// parts of the type that belong in the middle of the page. Everything else, the properties
/// and settings, sits in the details: beside the page on a wide iPad, else behind it, a
/// swipe or the details button away.
export function EntityScreen({ id, embedded = false }: { id: string; embedded?: boolean }) {
  const { db } = useAppData();
  const { data: entity, isLoading } = useEntity(id);
  const inspector = useInspectorShown();
  useEffect(() => {
    void markOpened(db, id);
  }, [db, id]);
  if (isLoading) return null;
  if (!entity) {
    return (
      <Screen>
        <Text tone="muted">This item isn't on this device.</Text>
      </Screen>
    );
  }
  return inspector ? (
    <OpenEntity entity={entity} embedded={embedded} />
  ) : (
    <DetailsDrawer id={entity.id}>
      <OpenEntity entity={entity} embedded={embedded} />
    </DetailsDrawer>
  );
}

/// The bar over an item on a phone, drawn inside the page so the whole page, bar included,
/// slides aside and is rounded with the details drawer: back, the item's key, and its
/// conflict badge, details and more.
function TopBar({ entity, menu }: { entity: EntityRecord; menu: MenuItem[] }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const present = useMenu();
  const details = useDetails();
  const muted = theme.colors.mutedForeground;
  return (
    <View className="flex-row items-center gap-1 px-2 pb-1" style={{ paddingTop: insets.top + 4 }}>
      <IconButton
        label="Back"
        icon={<IconChevronLeft size={24} color={theme.colors.foreground} />}
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      />
      <Text variant="small" tone="muted" className="flex-1">
        {entity.key}
      </Text>
      <ConflictBadge entityId={entity.id} />
      {details ? (
        <IconButton
          label="Show Details"
          icon={<IconInfoCircle size={22} color={muted} />}
          onPress={() => details.show()}
        />
      ) : null}
      {menu.length > 0 ? (
        <IconButton
          label="More"
          icon={<IconDots size={22} color={muted} />}
          onPress={() => present.show(entity.title || entity.key, menu)}
        />
      ) : null}
    </View>
  );
}

function OpenEntity({ entity, embedded }: { entity: EntityRecord; embedded: boolean }) {
  const { data: spaces = [] } = useSpaces();
  const readOnly = useReadOnly(entity);
  const theme = useTheme();
  const present = useMenu();
  const menu = useEntityMenu(entity);
  const tablet = useIsTablet();
  const space = spaces.find((s) => s.id === entity.spaceId);
  // On a phone the bar above the page carries the key and the actions; beside the
  // details pane (tablet, split view) they sit in the page's first row.
  const bar = !embedded && !tablet;
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1"
    >
      {embedded ? null : <Stack.Screen options={{ headerShown: false }} />}
      {bar ? <TopBar entity={entity} menu={menu} /> : null}
      <Screen>
        <View className="gap-2">
          <View className="flex-row flex-wrap items-center gap-2">
            {bar ? null : (
              <Text variant="small" tone="muted">
                {entity.key}
              </Text>
            )}
            {space ? <SpaceDot color={space.color} /> : null}
            <Text variant="small" tone="muted">
              {space?.name ?? ""}
            </Text>
            {entity.deletedAt ? <Badge label="In Trash" variant="destructive" /> : null}
            {readOnly && !entity.deletedAt ? <Badge label="View only" /> : null}
            {bar ? null : <ConflictBadge entityId={entity.id} />}
            <View className="flex-1" />
            {!bar && menu.length > 0 ? (
              <IconButton
                label="More"
                icon={<IconDots size={22} color={theme.colors.mutedForeground} />}
                onPress={() => present.show(entity.title || entity.key, menu)}
              />
            ) : null}
          </View>
          <TitleField entity={entity} readOnly={readOnly} />
        </View>
        <PartProvider value="main">
          <ItemParts entity={entity} readOnly={readOnly} />
        </PartProvider>
      </Screen>
      <EditorToolbar />
    </KeyboardAvoidingView>
  );
}
