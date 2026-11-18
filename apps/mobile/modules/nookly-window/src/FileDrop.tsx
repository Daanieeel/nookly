import { requireNativeView } from "expo";
import type { ComponentType, ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { windowModuleAvailable } from "./index.ts";

export interface DroppedFile {
  uri: string;
  name: string;
}

interface NativeProps extends ViewProps {
  onFilesDropped: (event: { nativeEvent: { files: DroppedFile[] } }) => void;
  onDropActive: (event: { nativeEvent: { active: boolean } }) => void;
  children?: ReactNode;
}

/// Where nothing can be dragged in, a plain view: its two handlers are never called (a test
/// calls them as the native view would).
function Plain(props: NativeProps) {
  return <View {...props} />;
}

const Native: ComponentType<NativeProps> = windowModuleAvailable
  ? requireNativeView<NativeProps>("NooklyWindow", "NooklyFileDropView")
  : Plain;

/// Children that take files dragged in from another app, each copied into the app's
/// temporary folder first; a plain view where nothing can be dragged in.
export function FileDrop({
  onFiles,
  onActive,
  ...props
}: ViewProps & {
  onFiles: (files: DroppedFile[]) => void;
  onActive?: (active: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <Native
      {...props}
      onFilesDropped={(e) => onFiles(e.nativeEvent.files)}
      onDropActive={(e) => onActive?.(e.nativeEvent.active)}
    />
  );
}
