import {
  type FileKindId,
  type FileRecord,
  addFile,
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
import { Image, Linking, ScrollView, View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import { storePicked } from "../data/files.ts";
import { useFile, useFiles } from "../data/queries.ts";
import { Button } from "../ui/Button.tsx";
import { DetailsPart, MainPart } from "../ui/parts.tsx";
import { PropertyList } from "../ui/Property.tsx";
import { InfoRow } from "../ui/property-rows.tsx";
import { dayLabel } from "./dates.ts";
import { Empty, Row, Section } from "../ui/Row.tsx";
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

function KindIcon({ file }: { file: FileRecord }) {
  const theme = useTheme();
  if (isLinkOnly(file)) {
    const Glyph = file.provider === "dropbox" ? IconBrandDropbox : IconLink;
    return <Glyph size={20} color={theme.colors.mutedForeground} />;
  }
  const Glyph = KIND_ICONS[fileKindOf(nameOf(file))];
  return <Glyph size={20} color={theme.colors.mutedForeground} />;
}

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

/// A Space's files, newest first.
export function FileRows({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const { data: files = [] } = useFiles(spaceId);
  return (
    <Section>
      {files.length === 0 ? <Empty text="No files yet." /> : null}
      {files.map((file) => (
        <View key={file.entity.id}>
          <Row
            title={file.entity.title || "Untitled"}
            subtitle={state(file)}
            icon={<KindIcon file={file} />}
            onPress={() => router.push(`/entity/${file.entity.id}`)}
          />
        </View>
      ))}
    </Section>
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
