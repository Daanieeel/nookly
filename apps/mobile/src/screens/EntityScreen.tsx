import { type EntityRecord, markOpened, renameEntity } from "@nookly/shared/data";
import { IconDots } from "@tabler/icons-react-native";
import { Stack } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, TextInput, View } from "react-native";
import { EditorToolbar } from "../editor/EditorToolbar.tsx";
import { useAppData, useLocalWrite } from "../data/context.tsx";
import { useEntity, useSpaces } from "../data/queries.ts";
import { Badge, SpaceDot } from "../ui/Badge.tsx";
import { useTheme } from "../ui/theme.ts";
import { IconButton } from "../ui/Button.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { ConflictBadge } from "./ConflictBadge.tsx";
import { useDetails, useDetailsFor } from "../shell/DetailsDrawer.tsx";
import { useInspectorShown, useIsTablet } from "../ui/pane.tsx";
import { PartProvider } from "../ui/parts.tsx";
import { ItemParts } from "./ItemParts.tsx";
import { TaskStepper } from "./TaskDetail.tsx";
import { useReadOnly } from "./useReadOnly.ts";
import { type MenuEntry, useMenu } from "../ui/menu.tsx";
import { TOOLBAR_ICONS } from "../ui/toolbar-icons.ts";
import { useEntityActions } from "./entity-actions.tsx";

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
  return <OpenEntity entity={entity} embedded={embedded} details={!inspector} />;
}

/// What the native bar over an item on a phone carries on its right: the details and
/// the more menu. Back is the system's own button.
function BarActions({ entity, menu }: { entity: EntityRecord; menu: MenuEntry[] }) {
  const present = useMenu();
  const details = useDetails();
  return (
    <Stack.Toolbar placement="right">
      {details ? (
        <Stack.Toolbar.Button
          icon={details.open ? TOOLBAR_ICONS.hideDetails : TOOLBAR_ICONS.showDetails}
          iconRenderingMode="template"
          accessibilityLabel={details.open ? "Hide Details" : "Show Details"}
          onPress={() => (details.open ? details.hide() : details.show())}
        />
      ) : null}
      {menu.length > 0 ? (
        <Stack.Toolbar.Button
          icon={TOOLBAR_ICONS.more}
          iconRenderingMode="template"
          accessibilityLabel="More"
          onPress={() => present.show(entity.title || entity.key, menu)}
        />
      ) : null}
    </Stack.Toolbar>
  );
}

function OpenEntity({
  entity,
  embedded,
  details,
}: {
  entity: EntityRecord;
  embedded: boolean;
  /// Whether its details wait behind the app (a phone), not beside the page.
  details: boolean;
}) {
  const { data: spaces = [] } = useSpaces();
  const readOnly = useReadOnly(entity);
  const theme = useTheme();
  const present = useMenu();
  const menu = useEntityActions()(entity, "more");
  // The details' own more button opens the menu as it is now, without registering the
  // item again on every render.
  const latestMore = useRef(() => {});
  useEffect(() => {
    latestMore.current = () => present.show(entity.title || entity.key, menu);
  });
  const more = useCallback(() => latestMore.current(), []);
  useDetailsFor(details ? { id: entity.id, more: menu.length > 0 ? more : undefined } : null);
  const tablet = useIsTablet();
  const space = spaces.find((s) => s.id === entity.spaceId);
  // On a phone the system's bar over the page carries back, the details and the more
  // menu; beside the details pane (tablet, split view) they sit in the page's first row.
  const bar = !embedded && !tablet;
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1"
    >
      {bar ? <BarActions entity={entity} menu={menu} /> : null}
      <Screen>
        <View className="gap-2">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text variant="small" tone="muted">
              {entity.key}
            </Text>
            {space ? <SpaceDot color={space.color} /> : null}
            <Text variant="small" tone="muted">
              {space?.name ?? ""}
            </Text>
            {entity.deletedAt ? <Badge label="In Trash" variant="destructive" /> : null}
            {readOnly && !entity.deletedAt ? <Badge label="View only" /> : null}
            {entity.type === "task" ? (
              <TaskStepper id={entity.id} spaceId={entity.spaceId} />
            ) : null}
            <ConflictBadge entityId={entity.id} />
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
