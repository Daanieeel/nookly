import { type ComponentType, createContext, useContext } from "react";
import {
  FileView,
  type FileViewProps,
  fileThumbnail,
  fileViewerAvailable,
} from "../../modules/nookly-file-viewer/src/index.tsx";

/// How the phone shows a file itself: the system's viewers (PDFKit, Quick Look) through
/// `modules/nookly-file-viewer`, or a test's stand in.
export interface FileViewer {
  /// False in a build without the native viewer (Expo Go, tests): files go to other apps.
  available: boolean;
  View: ComponentType<FileViewProps>;
  /// A picture of the file's first page or frame, or null.
  thumbnail(uri: string, name: string, size: number): Promise<string | null>;
}

export const systemFileViewer: FileViewer = {
  available: fileViewerAvailable,
  View: FileView,
  thumbnail: fileThumbnail,
};

const FileViewerContext = createContext<FileViewer>(systemFileViewer);
export const FileViewerProvider = FileViewerContext.Provider;
export const useFileViewer = () => useContext(FileViewerContext);
