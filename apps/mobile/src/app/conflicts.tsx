import { useRouter } from "expo-router";
import { MergeEditor } from "../screens/MergeEditor.tsx";
import { useIsTablet } from "../ui/pane.tsx";
import { RouteSheet } from "../ui/sheet/Sheet.tsx";

export default function Route() {
  const tablet = useIsTablet();
  const router = useRouter();
  // A tablet's is the desktop's extra large Review Changes dialog over the window (6.15).
  if (tablet) {
    return (
      <RouteSheet
        title="Review Changes"
        kind="focus"
        onClosed={() => router.canGoBack() && router.back()}
      >
        <MergeEditor />
      </RouteSheet>
    );
  }
  return <MergeEditor />;
}
