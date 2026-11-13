import { useLocalSearchParams } from "expo-router";
import { FileViewerScreen } from "../../screens/FileViewer.tsx";

export default function FileViewerRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FileViewerScreen id={id} />;
}
