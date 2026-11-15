import { ListEmpty } from "../ui/ListEmpty.tsx";
import { MODULE_ICONS } from "../ui/icons.tsx";
import { ENTITY_FILTERS_NONE } from "../ui/entity-filters.tsx";
import { useRowEdge } from "../ui/row-edge.tsx";
import {
  type FileKindId,
  type FileRecord,
  addFile,
  addFileLink,
  createView,
  updateViewConfig,
  type LabelRecord,
  fileKindOf,
  isDownloading,
  isLinkOnly,
} from "@nookly/shared/data";
import { useEntityMenu } from "./entity-actions.tsx";
import { EntitySwipe } from "./EntitySwipe.tsx";
import { KIND_ICONS, KIND_LABELS, hasThumbnail, nameOf, pathOf, viewerFor } from "./file-kinds.ts";
import { useFileViewer } from "../ui/file-viewer.tsx";
import {
  IconBrandDropbox,
  IconCalendarEvent,
  IconCategory,
  IconFileText,
  IconLink,
} from "@tabler/icons-react-native";
import { useQuery } from "@tanstack/react-query";
import { File } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { type ReactNode, useState } from "react";
import { Image, Linking, Pressable, View } from "react-native";
import { IconLayoutGrid, IconList, IconTag } from "@tabler/icons-react-native";
import { useLocalWrite } from "../data/context.tsx";
import { storePicked } from "../data/files.ts";
import { useFile, useFiles, useLabels, useViews } from "../data/queries.ts";
import { UNLABELLED, labelShelf } from "@nookly/shared/label-shelf";
import { Chip, ChipGroup } from "../ui/Chips.tsx";
import { FloatingField, PASTE_BAR_MARGIN, PASTE_BAR_ROOM } from "../ui/FloatingField.tsx";
import { Presets } from "../ui/ListBar.tsx";
import {
  FILE_DEFAULT,
  FILE_GROUPINGS,
  FILE_ORDERINGS,
  type FileDisplay,
  fileDisplayFromView,
  fileDisplaySchema,
  fileViewConfig,
} from "./file-view.ts";
import { Button } from "../ui/Button.tsx";
import { Grid } from "../ui/Grid.tsx";
import { ListControls } from "../ui/ListControls.tsx";
import { useEntityFilters } from "../ui/entity-filters.tsx";
import { Section } from "../ui/Row.tsx";
import { DisplayGroup, LayoutTiles, SelectRow } from "../ui/sheet/DisplayParts.tsx";
import { useDraftPreference } from "../data/preferences.ts";
import { SaveBar } from "../ui/SaveBar.tsx";
import { labelOption } from "./option-badges.tsx";
import { AtAGlance, DetailsPart, MainPart } from "../ui/parts.tsx";
import { PropertyList } from "../ui/Property.tsx";
import { InfoRow } from "../ui/property-rows.tsx";
import { dayLabel, localDay } from "./dates.ts";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { useRouter } from "expo-router";

function state(file: FileRecord): string {
  if (isDownloading(file)) return "Downloading from your account";
  if (isLinkOnly(file)) return "Link";
  return KIND_LABELS[fileKindOf(nameOf(file))];
}

/// Picks files from the phone's Files app and stores them in the Space; sync uploads
/// them and the other devices download them.
export function useAddFiles(spaceId: string) {
  return useLocalWrite(async (db, _: undefined) => {
    const picked = await File.pickFileAsync({ multipleFiles: true });
    if (picked.canceled) return 0;
    for (const file of picked.result) {
      const stored = await storePicked(file);
      await addFile(db, spaceId, stored.name, stored.uri);
    }
    return picked.result.length;
  });
}

/// "PDF", "TXT": the type badge on a tile.
const extensionOf = (file: FileRecord) =>
  isLinkOnly(file) ? "LINK" : (nameOf(file).split(".").pop() ?? "").slice(0, 4).toUpperCase();

/// A picture of the file for the list, as the desktop draws one: the image itself, a PDF's
/// first page, a frame of a video, an Office document's own picture, made by the system.
/// Without one, nothing: the caller shows the kind's icon.
function FileThumb({
  file,
  size,
  fallback,
}: {
  file: FileRecord;
  size: number;
  fallback: ReactNode;
}) {
  const viewer = useFileViewer();
  const path = pathOf(file);
  const name = nameOf(file);
  const shown = hasThumbnail(file);
  const thumbnail = useQuery({
    queryKey: ["file-thumbnail", path, size],
    enabled: shown && Boolean(path),
    queryFn: async () => (path ? await viewer.thumbnail(path, name, size) : null),
  });
  const picture = thumbnail.data ?? (shown && fileKindOf(name) === "image" ? path : null);
  if (!picture) return fallback;
  return (
    <Image
      testID="file-thumb"
      source={{ uri: picture }}
      resizeMode="cover"
      className="size-full"
      accessibilityIgnoresInvertColors
    />
  );
}

function FileTile({ file, row = false }: { file: FileRecord; row?: boolean }) {
  const entityMenu = useEntityMenu();
  const router = useRouter();
  const theme = useTheme();
  const edge = useRowEdge({ inSwipeRow: true });
  const name = nameOf(file);
  const Glyph = isLinkOnly(file)
    ? file.provider === "dropbox"
      ? IconBrandDropbox
      : IconLink
    : KIND_ICONS[fileKindOf(name)];
  const added = new Date(file.entity.createdAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
  if (row) {
    return (
      <EntitySwipe entity={file.entity}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={name}
          onPress={() => router.push(`/entity/${file.entity.id}`)}
          onLongPress={() => entityMenu(file.entity)}
          style={edge}
          className="min-h-14 flex-row items-center gap-3 py-2 active:opacity-70"
        >
          <View className="size-10 items-center justify-center overflow-hidden rounded-lg border border-border bg-secondary">
            <FileThumb
              file={file}
              size={120}
              fallback={<Glyph size={22} color={theme.colors.mutedForeground} strokeWidth={1.75} />}
            />
          </View>
          <View className="flex-1">
            <Text numberOfLines={1} className="font-medium">
              {name}
            </Text>
            <Text variant="small" tone="muted" numberOfLines={1}>
              {`${state(file)} · ${added}`}
            </Text>
          </View>
        </Pressable>
      </EntitySwipe>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={() => router.push(`/entity/${file.entity.id}`)}
      onLongPress={() => entityMenu(file.entity)}
      className="gap-2 active:opacity-80"
    >
      <View className="aspect-square items-center justify-center overflow-hidden rounded-xl border border-border bg-secondary">
        <FileThumb
          file={file}
          size={400}
          fallback={<Glyph size={44} color={theme.colors.mutedForeground} strokeWidth={1.5} />}
        />
        <View className="absolute bottom-2 left-2 rounded bg-background/80 px-1.5 py-0.5">
          <Text variant="small" className="font-medium">
            {extensionOf(file)}
          </Text>
        </View>
      </View>
      <View className="gap-0.5 px-0.5">
        <Text numberOfLines={2} className="font-medium leading-tight">
          {name}
        </Text>
        <Text variant="small" tone="muted" numberOfLines={1}>
          {`${state(file)} · ${added}`}
        </Text>
      </View>
    </Pressable>
  );
}

/// The bar to paste a link to a file kept elsewhere, floating at the bottom of the Files page
/// as on Bookmarks; files themselves come from the + at the top.
export function FilePasteBar({ spaceId }: { spaceId: string }) {
  const [link, setLink] = useState("");
  const addLink = useLocalWrite((db, url: string) => addFileLink(db, spaceId, url));
  const submit = () => link.trim() && addLink.mutate(link, { onSuccess: () => setLink("") });
  return (
    <FloatingField
      label="Paste a link to add it"
      sendLabel="Add Link"
      value={link}
      onChangeText={setLink}
      onSubmit={submit}
      error={addLink.error?.message}
    />
  );
}

const kindOf = (f: FileRecord): FileKindId | "link" =>
  isLinkOnly(f) ? "link" : fileKindOf(nameOf(f));
const kindLabel = (k: FileKindId | "link") => (k === "link" ? "Links" : KIND_LABELS[k]);

/// "Today", "This week", "This month", "Earlier": when a file was added, by whole days.
function addedGroup(f: FileRecord, today = localDay()): string {
  const days = Math.round(
    (Date.parse(today) - Date.parse(localDay(new Date(f.entity.createdAt)))) / 86_400_000,
  );
  return days <= 0 ? "Today" : days <= 6 ? "This week" : days <= 30 ? "This month" : "Earlier";
}

/// Files in the order and groups picked, as the desktop's `file-model.ts`. By label, a file
/// shows under each of its labels, in the labels' order, and those with none last.
function fileGroups(files: FileRecord[], display: FileDisplay, labels: LabelRecord[]) {
  const ordered = [...files].sort((a, b) =>
    display.ordering === "name"
      ? nameOf(a).localeCompare(nameOf(b))
      : display.ordering === "oldest"
        ? a.entity.createdAt.localeCompare(b.entity.createdAt)
        : b.entity.createdAt.localeCompare(a.entity.createdAt),
  );
  if (display.grouping === "label") {
    return [
      ...labels.map((label) => ({
        title: label.name,
        items: ordered.filter((f) => f.labelIds.includes(label.id)),
      })),
      { title: "No label", items: ordered.filter((f) => f.labelIds.length === 0) },
    ].filter((g) => g.items.length > 0);
  }
  const key =
    display.grouping === "kind"
      ? (f: FileRecord) => kindLabel(kindOf(f))
      : display.grouping === "added"
        ? (f: FileRecord) => addedGroup(f)
        : () => "";
  const groups = new Map<string, FileRecord[]>();
  for (const f of ordered) groups.set(key(f), [...(groups.get(key(f)) ?? []), f]);
  return [...groups.entries()].map(([title, items]) => ({ title, items }));
}

/// The labels the Space's files carry, most used first, to browse by (D74): a picked one
/// narrows to its files and the shelf then offers what those also carry. While some files
/// have none, a quiet Unlabelled chip lists them.
function Shelf({
  shelf,
  picked,
  labels,
  onChange,
}: {
  shelf: ReturnType<typeof labelShelf<FileRecord>>;
  picked: string[];
  labels: LabelRecord[];
  onChange: (picked: string[]) => void;
}) {
  const nameOf = (id: string) =>
    id === UNLABELLED ? "Unlabelled" : (labels.find((l) => l.id === id)?.name ?? id);
  const live = picked.filter((id) => id === UNLABELLED || labels.some((l) => l.id === id));
  const unlabelled = live.length === 0 && shelf.unlabelled > 0;
  if (live.length === 0 && shelf.labels.length === 0 && !unlabelled) return null;
  return (
    <View className="gap-2">
      <ChipGroup label="Browse by label" scroll multiple>
        {live.map((id) => (
          <Chip
            key={id}
            label={`${nameOf(id)} ×`}
            multiple
            selected
            onPress={() => onChange(live.filter((x) => x !== id))}
          />
        ))}
        {shelf.labels.map(({ id, count }) => (
          <Chip
            key={id}
            label={`${nameOf(id)} ${count}`}
            multiple
            selected={false}
            onPress={() => onChange([...live, id])}
          />
        ))}
        {unlabelled ? (
          <Chip
            label={`Unlabelled ${shelf.unlabelled}`}
            multiple
            selected={false}
            onPress={() => onChange([UNLABELLED])}
          />
        ) : null}
      </ChipGroup>
      {live.includes(UNLABELLED) ? (
        <Text variant="small" tone="muted">
          Give these a label and they turn up on the shelf, under every label they carry.
        </Text>
      ) : null}
    </View>
  );
}

/// A Space's files as tiles or a list, filtered by kind and label, grouped and ordered as
/// on the desktop; the bar to paste a link floats over its end (`FilePasteBar`).
export function FileRows({ spaceId }: { spaceId: string }) {
  const { data: files = [] } = useFiles(spaceId);
  const { data: labels = [] } = useLabels(spaceId);
  const { data: views = [] } = useViews({ spaceId, module: "files" });
  const draft = useDraftPreference<FileDisplay>(
    `files.display.${spaceId}`,
    fileDisplaySchema,
    FILE_DEFAULT,
  );
  const display = draft.value;
  const setDisplay = draft.set;
  const view = draft.viewId ?? "all";
  const [note, setNote] = useState<string | null>(null);
  const kinds = [...new Set(files.map(kindOf))];
  const used = labels.filter((l) => files.some((f) => f.labelIds.includes(l.id)));
  const own = useEntityFilters(display, (next) => setDisplay({ ...display, ...next }));
  const shelf = labelShelf(
    files,
    (f) => f.labelIds,
    display.shelf,
    (id) => labels.find((l) => l.id === id)?.name ?? id,
  );
  const shown = shelf.shown.filter(
    (f) =>
      (display.kinds.length === 0 || display.kinds.includes(kindOf(f))) &&
      (display.labels.length === 0 || display.labels.some((id) => f.labelIds.includes(id))) &&
      own.passes(f.entity),
  );
  const groups = fileGroups(shown, display, used);
  const saveView = useLocalWrite((db, id: string) =>
    updateViewConfig(db, id, fileViewConfig(display)),
  );
  const saveAsView = useLocalWrite((db, title: string) =>
    createView(db, spaceId, { title, module: "files", config: fileViewConfig(display) }),
  );
  const openView = (id: string) => {
    setNote(null);
    if (id === "all") return draft.open(null);
    const saved = views.find((v) => v.entity.id === id);
    if (!saved) return;
    const opened = fileDisplayFromView(saved.config, {
      labelIds: labels.map((l) => l.id),
      kinds,
    });
    draft.open({ id, value: opened.display });
    if (opened.ignored.length > 0) {
      setNote(
        `This view also uses ${opened.ignored.join(", ")}, which the phone doesn't show yet.`,
      );
    }
  };
  return (
    <View className="gap-4">
      <ListControls
        title="Files"
        count={files.length}
        filters={[
          {
            label: "Kind",
            icon: IconCategory,
            values: display.kinds,
            options: kinds.map((k) => ({ id: k, label: kindLabel(k) })),
            onChange: (next) => setDisplay({ ...display, kinds: next }),
          },
          {
            label: "Labels",
            icon: IconTag,
            values: display.labels,
            options: used.map(labelOption),
            onChange: (next) => setDisplay({ ...display, labels: next }),
          },
          ...own.fields,
        ]}
        display={<FileDisplayPanel display={display} onChange={setDisplay} />}
      />
      {views.length > 0 ? (
        <Presets
          label="Views"
          value={view}
          onChange={openView}
          options={[
            { id: "all", label: "All" },
            ...views.map((v) => ({ id: v.entity.id, label: v.entity.title || "Untitled" })),
          ]}
        />
      ) : null}
      <Shelf
        shelf={shelf}
        picked={display.shelf}
        labels={labels}
        onChange={(picked) => setDisplay({ ...display, shelf: picked })}
      />
      {note ? (
        <Text variant="small" tone="muted">
          {note}
        </Text>
      ) : null}
      <ListEmpty
        glyph={MODULE_ICONS.files}
        total={files.length}
        shown={groups.length}
        nothingYet={{ title: "No Files", message: "Tap + to add some, or paste a link below." }}
        onClear={() =>
          setDisplay({ ...display, kinds: [], labels: [], shelf: [], ...ENTITY_FILTERS_NONE })
        }
      />
      {groups.length === 0
        ? null
        : groups.map((group) => (
            <Section key={group.title || "all"} title={group.title || undefined}>
              {display.layout === "grid" ? (
                <Grid min={140} max={6}>
                  {group.items.map((file) => (
                    <FileTile key={file.entity.id} file={file} />
                  ))}
                </Grid>
              ) : (
                group.items.map((file) => <FileTile key={file.entity.id} file={file} row />)
              )}
            </Section>
          ))}
      {/* Room for the paste bar floating over the end of the list. */}
      <View style={{ height: PASTE_BAR_ROOM }} />
      <SaveBar
        dirty={draft.dirty}
        above={PASTE_BAR_ROOM - PASTE_BAR_MARGIN}
        onDiscard={draft.discard}
        onSave={async () => {
          if (draft.viewId) {
            await saveView.mutateAsync(draft.viewId);
            draft.commit();
          } else draft.save();
        }}
        onSaveAsView={
          draft.viewId
            ? undefined
            : async (title) => {
                const id = await saveAsView.mutateAsync(title);
                draft.open({ id, value: display });
              }
        }
      />
    </View>
  );
}

/// Layout, grouping and ordering; the save bar keeps a change or makes it a View.
function FileDisplayPanel({
  display,
  onChange,
}: {
  display: FileDisplay;
  onChange: (next: FileDisplay) => void;
}) {
  return (
    <View className="gap-3">
      <LayoutTiles
        tiles={[
          { id: "grid", label: "Grid", icon: IconLayoutGrid },
          { id: "list", label: "List", icon: IconList },
        ]}
        value={display.layout}
        onSelect={(layout) => onChange({ ...display, layout })}
      />
      <DisplayGroup>
        <SelectRow
          label="Grouping"
          value={display.grouping}
          options={[...FILE_GROUPINGS]}
          onChange={(grouping) => onChange({ ...display, grouping })}
        />
        <SelectRow
          label="Ordering"
          value={display.ordering}
          options={[...FILE_ORDERINGS]}
          onChange={(ordering) => onChange({ ...display, ordering })}
        />
      </DisplayGroup>
    </View>
  );
}

/// The file on its page: a picture of its first page (or the image itself, or the start of
/// its text) that opens it full screen in the viewer.
function Preview({ file }: { file: FileRecord }) {
  const router = useRouter();
  const theme = useTheme();
  const path = pathOf(file);
  const name = nameOf(file);
  const kind = viewerFor(file);
  const viewer = useFileViewer();
  const thumbnail = useQuery({
    queryKey: ["file-thumbnail", path],
    enabled: Boolean(path) && kind !== "text" && kind !== "none",
    queryFn: async () => (path ? await viewer.thumbnail(path, name, 600) : null),
  });
  const text = useQuery({
    queryKey: ["file-text-start", path],
    enabled: Boolean(path) && kind === "text",
    queryFn: async () => (path ? (await new File(path).text()).slice(0, 4000) : ""),
  });
  if (!path || kind === "none") return null;
  const picture = thumbnail.data ?? (fileKindOf(name) === "image" ? path : null);
  const Glyph = KIND_ICONS[fileKindOf(name)];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${name}`}
      onPress={() => router.push(`/file/${file.entity.id}`)}
      className="overflow-hidden rounded-xl border border-border bg-secondary active:opacity-80"
    >
      {kind === "text" ? (
        <Text numberOfLines={14} className="p-3 font-mono text-sm">
          {text.data ?? ""}
        </Text>
      ) : picture ? (
        <Image source={{ uri: picture }} resizeMode="contain" className="aspect-[4/3] w-full" />
      ) : (
        <View className="aspect-[4/3] w-full items-center justify-center">
          <Glyph size={56} color={theme.colors.mutedForeground} strokeWidth={1.5} />
        </View>
      )}
    </Pressable>
  );
}

/// A file's own page: the file in the page, as far as the phone can show it; what it is
/// and where it came from in the details.
export function FileDetail({ id }: { id: string }) {
  const theme = useTheme();
  const muted = theme.colors.mutedForeground;
  const { data: file } = useFile(id);
  if (!file) return null;
  const path = pathOf(file);
  const link = file.url;
  const name = nameOf(file);
  const open = async () => {
    if (path && (await Sharing.isAvailableAsync())) await Sharing.shareAsync(path);
  };
  return (
    <>
      <AtAGlance>
        <PropertyList>
          <InfoRow
            icon={<IconCategory size={20} color={muted} />}
            label="Kind"
            value={KIND_LABELS[fileKindOf(name)]}
          />
          <InfoRow
            icon={<IconCalendarEvent size={20} color={muted} />}
            label="Added"
            value={dayLabel(file.entity.createdAt.slice(0, 10))}
          />
        </PropertyList>
      </AtAGlance>
      <MainPart>
        <View className="gap-4">
          <Preview file={file} />
          {path ? (
            <Button label="Open In…" variant="secondary" onPress={() => void open()} />
          ) : null}
          {isLinkOnly(file) && link ? (
            <Button
              label="Open Link"
              variant="secondary"
              onPress={() => void Linking.openURL(link)}
            />
          ) : null}
          {isDownloading(file) ? (
            <Text tone="muted">
              The contents are in your account. They arrive when this phone has synced.
            </Text>
          ) : null}
        </View>
      </MainPart>
      <DetailsPart>
        <View className="gap-3">
          <Text tone="muted">{state(file)}</Text>
          <PropertyList>
            <InfoRow
              icon={<IconCategory size={20} color={muted} />}
              label="Kind"
              value={KIND_LABELS[fileKindOf(name)]}
            />
            <InfoRow
              icon={<IconFileText size={20} color={muted} />}
              label="File name"
              value={name}
            />
            <InfoRow
              icon={<IconLink size={20} color={muted} />}
              label={link ? "Source" : "Location"}
              value={link ?? file.sourcePath ?? "In Nookly"}
            />
            <InfoRow
              icon={<IconCalendarEvent size={20} color={muted} />}
              label="Added"
              value={dayLabel(file.entity.createdAt.slice(0, 10))}
            />
          </PropertyList>
        </View>
      </DetailsPart>
    </>
  );
}
