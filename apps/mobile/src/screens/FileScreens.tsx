import {
  type FileKindId,
  type FileRecord,
  addFile,
  addFileLink,
  fileKindOf,
  isDownloading,
  isLinkOnly,
} from "@nookly/shared/data";
import { useEntityMenu } from "./entity-actions.tsx";
import { KIND_ICONS, KIND_LABELS, nameOf, pathOf, viewerFor } from "./file-kinds.ts";
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
import { useState } from "react";
import { Image, Linking, Pressable, TextInput, View } from "react-native";
import { CARD_CLASSES } from "@nookly/ui/classes";
import {
  IconArrowUp,
  IconLayoutGrid,
  IconList,
  IconTag,
} from "@tabler/icons-react-native";
import { useLocalWrite } from "../data/context.tsx";
import { storePicked } from "../data/files.ts";
import { useFile, useFiles, useLabels } from "../data/queries.ts";
import { Button, IconButton, statusOf } from "../ui/Button.tsx";
import { cn } from "../ui/classes.ts";
import { Grid } from "../ui/Grid.tsx";
import { ListControls } from "../ui/ListControls.tsx";
import { Empty, Section } from "../ui/Row.tsx";
import { DisplayGroup, LayoutTiles, SelectRow } from "../ui/sheet/DisplayParts.tsx";
import { usePreference } from "../data/preferences.ts";
import { z } from "zod";
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

function FileTile({ file, row = false }: { file: FileRecord; row?: boolean }) {
  const entityMenu = useEntityMenu();
  const router = useRouter();
  const theme = useTheme();
  const name = nameOf(file);
  const path = file.localPath ?? file.sourcePath;
  const image = !isLinkOnly(file) && fileKindOf(name) === "image" && path;
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={name}
        onPress={() => router.push(`/entity/${file.entity.id}`)}
        onLongPress={() => entityMenu(file.entity)}
        className="min-h-14 flex-row items-center gap-3 py-2 active:opacity-70"
      >
        <Glyph size={22} color={theme.colors.mutedForeground} strokeWidth={1.75} />
        <View className="flex-1">
          <Text numberOfLines={1} className="font-medium">
            {name}
          </Text>
          <Text variant="small" tone="muted" numberOfLines={1}>
            {`${state(file)} · ${added}`}
          </Text>
        </View>
      </Pressable>
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
        {image ? (
          <Image source={{ uri: path }} resizeMode="cover" className="size-full" />
        ) : (
          <Glyph size={44} color={theme.colors.mutedForeground} strokeWidth={1.5} />
        )}
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

/// What stays under the grid: a link or a file, to add to the Space.
function AddBar({ spaceId }: { spaceId: string }) {
  const theme = useTheme();
  const addFiles = useAddFiles(spaceId);
  const [link, setLink] = useState("");
  const addLink = useLocalWrite((db, url: string) => addFileLink(db, spaceId, url));
  const submit = () => link.trim() && addLink.mutate(link, { onSuccess: () => setLink("") });
  return (
    <View className={cn(CARD_CLASSES, "gap-2 p-3")}>
      <View className="flex-row items-center gap-2">
        <IconLink size={18} color={theme.colors.mutedForeground} />
        <TextInput
          accessibilityLabel="Paste a link"
          value={link}
          onChangeText={setLink}
          onSubmitEditing={submit}
          placeholder="Paste a link"
          placeholderTextColor={theme.colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          className="h-10 flex-1 font-sans text-sm text-foreground"
        />
        {link.trim() ? (
          <IconButton
            label="Add Link"
            icon={<IconArrowUp size={20} color={theme.colors.foreground} />}
            onPress={submit}
          />
        ) : null}
        <Text tone="muted">or</Text>
        <Button
          label="Choose Files"
          variant="secondary"
          size="sm"
          status={statusOf(addFiles)}
          onPress={() => addFiles.mutate(undefined)}
        />
      </View>
      {addLink.error ? <Text tone="destructive">{addLink.error.message}</Text> : null}
    </View>
  );
}

const fileDisplaySchema = z.object({
  layout: z.enum(["grid", "list"]),
  grouping: z.enum(["none", "kind", "added"]),
  ordering: z.enum(["newest", "oldest", "name"]),
  /// Kinds and labels the list is narrowed to; empty means all.
  kinds: z.array(z.string()),
  labels: z.array(z.string()),
});
type FileDisplay = z.infer<typeof fileDisplaySchema>;
const FILE_DEFAULT: FileDisplay = {
  layout: "grid",
  grouping: "none",
  ordering: "newest",
  kinds: [],
  labels: [],
};
const FILE_GROUPINGS = [
  { id: "none", label: "No grouping" },
  { id: "kind", label: "Kind" },
  { id: "added", label: "Date added" },
] as const;
const FILE_ORDERINGS = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "name", label: "Name" },
] as const;

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

/// Files in the order and groups picked, as the desktop's `file-model.ts`.
function fileGroups(files: FileRecord[], display: FileDisplay) {
  const ordered = [...files].sort((a, b) =>
    display.ordering === "name"
      ? nameOf(a).localeCompare(nameOf(b))
      : display.ordering === "oldest"
        ? a.entity.createdAt.localeCompare(b.entity.createdAt)
        : b.entity.createdAt.localeCompare(a.entity.createdAt),
  );
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

/// A Space's files as tiles or a list, filtered by kind and label, grouped and ordered as
/// on the desktop, with a bar under them to add a link or choose files.
export function FileRows({ spaceId }: { spaceId: string }) {
  const { data: files = [] } = useFiles(spaceId);
  const { data: labels = [] } = useLabels(spaceId);
  const [display, setDisplay] = usePreference<FileDisplay>(
    `files.display.${spaceId}`,
    fileDisplaySchema,
    FILE_DEFAULT,
  );
  const kinds = [...new Set(files.map(kindOf))];
  const used = labels.filter((l) => files.some((f) => f.labelIds.includes(l.id)));
  const shown = files.filter(
    (f) =>
      (display.kinds.length === 0 || display.kinds.includes(kindOf(f))) &&
      (display.labels.length === 0 || display.labels.some((id) => f.labelIds.includes(id))),
  );
  const groups = fileGroups(shown, display);
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
        ]}
        display={
          <View className="gap-3">
            <LayoutTiles
              tiles={[
                { id: "grid", label: "Grid", icon: IconLayoutGrid },
                { id: "list", label: "List", icon: IconList },
              ]}
              value={display.layout}
              onSelect={(layout) => setDisplay({ ...display, layout })}
            />
            <DisplayGroup>
              <SelectRow
                label="Grouping"
                value={display.grouping}
                options={[...FILE_GROUPINGS]}
                onChange={(grouping) => setDisplay({ ...display, grouping })}
              />
              <SelectRow
                label="Ordering"
                value={display.ordering}
                options={[...FILE_ORDERINGS]}
                onChange={(ordering) => setDisplay({ ...display, ordering })}
              />
            </DisplayGroup>
          </View>
        }
      />
      {files.length === 0 ? (
        <Text tone="muted" className="p-4 text-center">
          No files yet. Paste a link or choose files below.
        </Text>
      ) : groups.length === 0 ? (
        <Empty text="No files match these filters." />
      ) : (
        groups.map((group) => (
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
        ))
      )}
      <AddBar spaceId={spaceId} />
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
  const path = file.localPath ?? file.sourcePath;
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
