import {
  type FileKindId,
  type FileRecord,
  addFile,
  addFileLink,
  fileKindOf,
  isDownloading,
  isLinkOnly,
  isTextFile,
} from "@nookly/shared/data";
import {
  IconBrandDropbox,
  IconCalendarEvent,
  IconCode,
  IconFile,
  IconFileSpreadsheet,
  IconFileText,
  IconFileTypePdf,
  IconFileZip,
  IconLink,
  IconMovie,
  IconMusic,
  IconPhoto,
  IconPresentation,
  type Icon,
} from "@tabler/icons-react-native";
import { useQuery } from "@tanstack/react-query";
import { File } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Image, Linking, Pressable, ScrollView, TextInput, View } from "react-native";
import { CARD_CLASSES } from "@nookly/ui/classes";
import { IconArrowUp } from "@tabler/icons-react-native";
import { useLocalWrite } from "../data/context.tsx";
import { storePicked } from "../data/files.ts";
import { useFile, useFiles } from "../data/queries.ts";
import { Button, IconButton, statusOf } from "../ui/Button.tsx";
import { Chip, ChipGroup } from "../ui/Chips.tsx";
import { cn } from "../ui/classes.ts";
import { Grid } from "../ui/Grid.tsx";
import { ListTitle } from "../ui/ListBar.tsx";
import { DetailsPart, MainPart } from "../ui/parts.tsx";
import { PropertyList } from "../ui/Property.tsx";
import { InfoRow } from "../ui/property-rows.tsx";
import { dayLabel } from "./dates.ts";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { useRouter } from "expo-router";

const KIND_ICONS = {
  image: IconPhoto,
  pdf: IconFileTypePdf,
  document: IconFileText,
  sheet: IconFileSpreadsheet,
  slides: IconPresentation,
  archive: IconFileZip,
  audio: IconMusic,
  video: IconMovie,
  code: IconCode,
  other: IconFile,
} satisfies Record<FileKindId, Icon>;

const KIND_LABELS = {
  image: "Image",
  pdf: "PDF",
  document: "Document",
  sheet: "Spreadsheet",
  slides: "Slides",
  archive: "Archive",
  audio: "Audio",
  video: "Video",
  code: "Code",
  other: "File",
} satisfies Record<FileKindId, string>;

const nameOf = (file: FileRecord) => file.originalFilename ?? file.entity.title;

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

function FileTile({ file }: { file: FileRecord }) {
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={() => router.push(`/entity/${file.entity.id}`)}
      className="gap-2 active:opacity-80"
    >
      <View className="aspect-square items-center justify-center overflow-hidden rounded-xl bg-muted">
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

/// A Space's files as tiles, newest first, filtered by kind, with a bar under them to add a
/// link or choose files.
export function FileRows({ spaceId }: { spaceId: string }) {
  const { data: files = [] } = useFiles(spaceId);
  const [kind, setKind] = useState<string>("all");
  const kindOf = (f: FileRecord) => (isLinkOnly(f) ? "link" : fileKindOf(nameOf(f)));
  const kinds = [...new Set(files.map(kindOf))];
  const shown = files.filter((f) => kind === "all" || kindOf(f) === kind);
  return (
    <View className="gap-4">
      <ListTitle title="Files" count={files.length} />
      {kinds.length > 1 ? (
        <ChipGroup label="Kind" scroll>
          <Chip label="All" selected={kind === "all"} onPress={() => setKind("all")} />
          {kinds.map((k) => (
            <Chip
              key={k}
              label={k === "link" ? "Links" : KIND_LABELS[k as FileKindId]}
              selected={kind === k}
              onPress={() => setKind(k)}
            />
          ))}
        </ChipGroup>
      ) : null}
      {files.length === 0 ? (
        <Text tone="muted" className="p-4 text-center">
          No files yet. Paste a link or choose files below.
        </Text>
      ) : (
        <Grid min={140} max={6}>
          {shown.map((file) => (
            <FileTile key={file.entity.id} file={file} />
          ))}
        </Grid>
      )}
      <AddBar spaceId={spaceId} />
    </View>
  );
}

/// Whatever the file is, shown as far as the phone can: an image as it is, text as
/// text, anything else offered to the system's own viewers.
function Preview({ file }: { file: FileRecord }) {
  const path = file.localPath ?? file.sourcePath;
  const name = nameOf(file);
  const kind = fileKindOf(name);
  const text = useQuery({
    queryKey: ["file-text", path],
    enabled: Boolean(path) && isTextFile(name),
    queryFn: async () => (path ? (await new File(path).text()).slice(0, 200_000) : ""),
  });
  if (!path) return null;
  if (kind === "image") {
    return (
      <Image
        accessibilityLabel={name}
        source={{ uri: path }}
        resizeMode="contain"
        className="aspect-[4/3] w-full rounded-lg bg-muted"
      />
    );
  }
  if (isTextFile(name)) {
    return (
      <ScrollView horizontal className="max-h-96 rounded-lg border border-border">
        <Text className="p-3 font-mono text-sm" selectable>
          {text.data ?? "Reading…"}
        </Text>
      </ScrollView>
    );
  }
  return null;
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
              icon={<IconFile size={20} color={muted} />}
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
