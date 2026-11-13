import { type FileRecord, fileKindOf } from "@nookly/shared/data";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react-native";
import { useQuery } from "@tanstack/react-query";
import { File } from "expo-file-system";
import { Stack } from "expo-router";
import * as Sharing from "expo-sharing";
import { useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import type { FileViewHandle } from "../../modules/nookly-file-viewer/src/index.tsx";
import { useFileViewer } from "../ui/file-viewer.tsx";
import { useFile } from "../data/queries.ts";
import { barButton } from "../ui/bar.ts";
import { IconButton } from "../ui/Button.tsx";
import { EmptyState, LoadingState } from "../ui/kit/States.tsx";
import { SearchField } from "../ui/kit/SearchField.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { TOOLBAR_ICONS } from "../ui/toolbar-icons.ts";
import { KIND_ICONS, nameOf, pathOf, viewerFor } from "./file-kinds.ts";

/// Hands the stored file to other apps (Files, Mail, Books), the system's share sheet.
async function shareFile(path: string) {
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path);
}

/// Text and code as text, selectable, on the page's own background.
function TextFile({ path, code }: { path: string; code: boolean }) {
  const text = useQuery({
    queryKey: ["file-text", path],
    queryFn: async () => (await new File(path).text()).slice(0, 2_000_000),
  });
  if (text.isPending) return <LoadingState label="Reading the file" />;
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="p-4">
      <ScrollView horizontal={code} contentContainerStyle={code ? undefined : { flexGrow: 1 }}>
        <Text selectable className={code ? "font-mono text-sm" : undefined}>
          {text.data ?? ""}
        </Text>
      </ScrollView>
    </ScrollView>
  );
}

/// The PDF's search: a field, which match of how many, and the way to the others, as the
/// desktop's PDF search.
function PdfSearch({
  query,
  onQuery,
  result,
  viewer,
}: {
  query: string;
  onQuery: (query: string) => void;
  result: { count: number; index: number } | null;
  viewer: () => FileViewHandle | null;
}) {
  const theme = useTheme();
  const muted = theme.colors.mutedForeground;
  return (
    <View className="flex-row items-center gap-1 border-b border-border px-3 py-2">
      <View className="flex-1">
        <SearchField
          label="Search the PDF"
          placeholder="Search"
          value={query}
          onChangeText={onQuery}
          onSubmit={() => viewer()?.findNext()}
          autoFocus
        />
      </View>
      {query.trim() && result ? (
        <Text variant="small" tone="muted" className="px-1">
          {result.count === 0 ? "No matches" : `${result.index} of ${result.count}`}
        </Text>
      ) : null}
      <IconButton
        label="Previous Match"
        icon={<IconChevronLeft size={22} color={muted} />}
        onPress={() => viewer()?.findNext(true)}
      />
      <IconButton
        label="Next Match"
        icon={<IconChevronRight size={22} color={muted} />}
        onPress={() => viewer()?.findNext()}
      />
    </View>
  );
}

function Viewer({ file }: { file: FileRecord }) {
  const name = nameOf(file);
  const path = pathOf(file);
  const kind = viewerFor(file);
  const { available, View: FileView } = useFileViewer();
  const viewer = useRef<FileViewHandle>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ count: number; index: number } | null>(null);
  const [page, setPage] = useState<{ page: number; count: number } | null>(null);
  const shown = kind === "text" || ((kind === "pdf" || kind === "system") && available);
  const canSearch = kind === "pdf" && available;
  const bar = () => [
    ...(canSearch
      ? [
          barButton({
            label: "Search",
            icon: TOOLBAR_ICONS.search,
            onPress: () => {
              setSearching((on) => !on);
              setQuery("");
            },
          }),
        ]
      : []),
    ...(path
      ? [
          barButton({
            label: "Share",
            icon: TOOLBAR_ICONS.share,
            onPress: () => void shareFile(path),
          }),
        ]
      : []),
  ];
  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: name, unstable_headerRightItems: bar }} />
      {!path || !shown ? (
        <EmptyState
          glyph={KIND_ICONS[fileKindOf(name)]}
          title={path ? "Open it in another app" : "Not on this phone yet"}
          message={
            path
              ? "This phone cannot show this kind of file itself."
              : "The contents arrive when this phone has synced."
          }
          action={path ? { label: "Open In…", onPress: () => void shareFile(path) } : undefined}
        />
      ) : kind === "text" ? (
        <TextFile path={path} code={fileKindOf(name) === "code"} />
      ) : (
        <>
          {searching ? (
            <PdfSearch
              query={query}
              onQuery={setQuery}
              result={result}
              viewer={() => viewer.current}
            />
          ) : null}
          <FileView
            ref={viewer}
            accessibilityLabel={name}
            uri={path}
            name={name}
            query={searching ? query : ""}
            onPageChange={setPage}
            onSearchResult={setResult}
            style={{ flex: 1 }}
          />
          {kind === "pdf" && page && page.count > 1 ? (
            <View
              pointerEvents="none"
              className="absolute bottom-8 self-center rounded-full bg-card/90 px-3 py-1.5"
            >
              <Text variant="small">{`${page.page} of ${page.count}`}</Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

/// A file full screen: a PDF with its pages, search and zoom, Office and iWork documents,
/// images, video and sound as the system shows them, text and code as text. Anything this
/// phone cannot show is offered to other apps.
export function FileViewerScreen({ id }: { id: string }) {
  const { data: file, isPending } = useFile(id);
  if (isPending) return <LoadingState />;
  if (!file) return <EmptyState title="This file is gone" />;
  return <Viewer file={file} />;
}
