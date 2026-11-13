import { requireNativeView, requireOptionalNativeModule } from "expo";
import { type Ref, useImperativeHandle, useRef } from "react";
import type { NativeSyntheticEvent, ViewProps } from "react-native";

interface NativeViewer {
  thumbnail(uri: string, name: string, size: number): Promise<string | null>;
}

// Missing in a build without the module (Expo Go, tests): the app then offers the file to
// other apps instead.
const native = requireOptionalNativeModule<NativeViewer>("NooklyFileViewer");

/// Whether this build can show files itself.
export const fileViewerAvailable = native !== null;

/// A picture of the file's first page or frame (a `file://` URI in the caches folder), or
/// null when the system has none for it.
export async function fileThumbnail(uri: string, name: string, size: number) {
  return native ? native.thumbnail(uri, name, size) : null;
}

export interface PageChange {
  page: number;
  count: number;
}

export interface SearchResult {
  /// Matches in the whole document.
  count: number;
  /// Which one is shown, from 1; 0 with no matches.
  index: number;
}

export interface FileViewHandle {
  findNext(backwards?: boolean): void;
  goToPage(page: number): void;
}

interface NativeHandle {
  findNext(backwards: boolean): Promise<void>;
  goToPage(page: number): Promise<void>;
}

interface NativeProps extends ViewProps {
  source: { uri: string; name: string };
  query?: string;
  onPageChange?: (event: NativeSyntheticEvent<PageChange>) => void;
  onSearchResult?: (event: NativeSyntheticEvent<SearchResult>) => void;
  ref?: Ref<NativeHandle>;
}

const NativeFileView = fileViewerAvailable
  ? requireNativeView<NativeProps>("NooklyFileViewer")
  : null;

export interface FileViewProps extends ViewProps {
  /// The stored file and its original name (which tells the system what kind it is).
  uri: string;
  name: string;
  /// Text to find in a PDF; every match is highlighted.
  query?: string;
  onPageChange?: (change: PageChange) => void;
  onSearchResult?: (result: SearchResult) => void;
  ref?: Ref<FileViewHandle>;
}

/// The file itself, full size: a PDF with its pages, search and zoom; anything else as the
/// system previews it (Office and iWork documents, images, video, audio, text).
export function FileView({
  uri,
  name,
  query,
  onPageChange,
  onSearchResult,
  ref,
  ...props
}: FileViewProps) {
  const inner = useRef<NativeHandle>(null);
  useImperativeHandle(ref, () => ({
    findNext: (backwards = false) => void inner.current?.findNext(backwards),
    goToPage: (page) => void inner.current?.goToPage(page),
  }));
  if (!NativeFileView) return null;
  return (
    <NativeFileView
      {...props}
      ref={inner}
      source={{ uri, name }}
      query={query ?? ""}
      onPageChange={(event) => onPageChange?.(event.nativeEvent)}
      onSearchResult={(event) => onSearchResult?.(event.nativeEvent)}
    />
  );
}
