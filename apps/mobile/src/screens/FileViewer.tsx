import { fileKindOf } from "@nookly/shared/data";
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconLayoutSidebar,
  IconSearch,
  IconShare,
} from "@tabler/icons-react-native";
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
import { Button, IconButton } from "../ui/Button.tsx";
import { useIsTablet, usePageWidth } from "../ui/pane.tsx";
import { EmptyState, LoadingState } from "../ui/kit/States.tsx";
import { SearchField } from "../ui/kit/SearchField.tsx";
import { Text } from "../ui/Text.tsx";
import { CORNER, RADIUS } from "../ui/tokens.ts";
import { useTheme } from "../ui/theme.ts";
import { TOOLBAR_ICONS } from "../ui/toolbar-icons.ts";
import { KIND_ICONS, nameOf, pathOf, type ViewerKind, viewerFor } from "./file-kinds.ts";

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

/// From this page width a PDF opens with its page strip beside it.
const THUMBNAILS_FROM = 900;

/// A tablet's file toolbar, the desktop's `pdf-toolbar` (there is no system bar over a tab):
/// the page strip's toggle, the pages, then search and share at the end. Zoom is the pinch.
function FileToolbar({
  pdf,
  page,
  pages,
  onPages,
  onPage,
  onSearch,
  onShare,
  actions,
}: {
  pdf: boolean;
  page: { page: number; count: number } | null;
  pages: boolean;
  onPages: () => void;
  onPage: (page: number) => void;
  onSearch?: () => void;
  onShare?: () => void;
  actions: ReturnType<typeof barButton>[];
}) {
  const theme = useTheme();
  const muted = theme.colors.mutedForeground;
  return (
    <View
      testID="file-toolbar"
      className="flex-row items-center gap-1 border-b border-border px-2 py-1"
    >
      {pdf ? (
        <>
          <IconButton
            label={pages ? "Hide Pages" : "Show Pages"}
            icon={<IconLayoutSidebar size={20} color={muted} />}
            onPress={onPages}
          />
          {page && page.count > 1 ? (
            <>
              <IconButton
                label="Previous Page"
                icon={<IconChevronUp size={20} color={muted} />}
                onPress={() => onPage(page.page - 1)}
              />
              <IconButton
                label="Next Page"
                icon={<IconChevronDown size={20} color={muted} />}
                onPress={() => onPage(page.page + 1)}
              />
              <Text variant="small" tone="muted" className="px-1">
                {`${page.page} of ${page.count}`}
              </Text>
            </>
          ) : null}
        </>
      ) : null}
      <View className="flex-1" />
      {actions.map((action) => (
        <Button
          key={action.label}
          label={action.label}
          variant="ghost"
          size="sm"
          onPress={action.onPress}
        />
      ))}
      {onSearch ? (
        <IconButton
          label="Search in File"
          icon={<IconSearch size={20} color={muted} />}
          onPress={onSearch}
        />
      ) : null}
      {onShare ? (
        <IconButton
          label="Share File"
          icon={<IconShare size={20} color={muted} />}
          onPress={onShare}
        />
      ) : null}
    </View>
  );
}

/// A file on this phone shown full screen, with Search for a PDF and Share in the bar, and
/// any `actions` of the page after them. `path` is null while the file is not here yet,
/// which `missing` explains.
export function FileContents({
  name,
  path,
  kind,
  missing,
  actions = [],
}: {
  name: string;
  path: string | null;
  kind: ViewerKind;
  missing: string;
  actions?: ReturnType<typeof barButton>[];
}) {
  const { available, View: FileView } = useFileViewer();
  const viewer = useRef<FileViewHandle>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ count: number; index: number } | null>(null);
  const [page, setPage] = useState<{ page: number; count: number } | null>(null);
  const shown = kind === "text" || ((kind === "pdf" || kind === "system") && available);
  const canSearch = kind === "pdf" && available;
  const tablet = useIsTablet();
  // The page strip beside a PDF's pages where the page is wide, as the desktop's (6.13).
  const [pages, setPages] = useState(usePageWidth() >= THUMBNAILS_FROM);
  const toggleSearch = () => {
    setSearching((on) => !on);
    setQuery("");
  };
  const bar = () => [
    ...(canSearch
      ? [
          barButton({
            label: "Search",
            icon: TOOLBAR_ICONS.search,
            onPress: toggleSearch,
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
    ...actions,
  ];
  return (
    <View className="flex-1 bg-background">
      {tablet ? (
        <FileToolbar
          pdf={canSearch && path !== null}
          page={page}
          pages={pages}
          onPages={() => setPages((on) => !on)}
          onPage={(to) => viewer.current?.goToPage(to)}
          onSearch={canSearch && path ? toggleSearch : undefined}
          onShare={path ? () => void shareFile(path) : undefined}
          actions={actions}
        />
      ) : (
        <Stack.Screen options={{ title: name, unstable_headerRightItems: bar }} />
      )}
      {!path || !shown ? (
        <EmptyState
          glyph={KIND_ICONS[fileKindOf(name)]}
          title={path ? "Open it in another app" : "Not on this phone yet"}
          message={path ? "This phone cannot show this kind of file itself." : missing}
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
            thumbnails={tablet && kind === "pdf" && pages}
            style={{ flex: 1 }}
          />
          {!tablet && kind === "pdf" && page && page.count > 1 ? (
            <View
              pointerEvents="none"
              className="absolute bottom-8 self-center bg-card/90 px-3 py-1.5"
              style={[CORNER, { borderRadius: RADIUS.badge }]}
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
  return (
    <FileContents
      name={nameOf(file)}
      path={pathOf(file)}
      kind={viewerFor(file)}
      missing="The contents arrive when this phone has synced."
    />
  );
}
