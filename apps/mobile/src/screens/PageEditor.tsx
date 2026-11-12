import { ActivityIndicator, View } from "react-native";
import { LivePage } from "../editor/LivePage.tsx";
import { RowsPage } from "../editor/RowsPage.tsx";
import { usePageSession } from "../editor/use-page-session.ts";

/// A page's body: the live editor when this phone has the page's document, else its
/// blocks in the same editor on a document kept on this phone (`RowsPage`). Only notes and jots have a document; the
/// description of any other item is its blocks (`live` off).
export function PageEditor({
  entityId,
  readOnly,
  live = true,
}: {
  entityId: string;
  readOnly: boolean;
  live?: boolean;
}) {
  // A page is all editor, down to the bottom of the screen; an item's description is a
  // region of its page.
  return live ? (
    <LiveOrRows entityId={entityId} readOnly={readOnly} />
  ) : (
    <RowsPage entityId={entityId} editable={!readOnly} fill={false} />
  );
}

function LiveOrRows({ entityId, readOnly }: { entityId: string; readOnly: boolean }) {
  const page = usePageSession(entityId);
  if (page.state === "live") {
    return <LivePage session={page.session} editable={!readOnly && !page.session.readOnly} fill />;
  }
  if (page.state === "waiting") {
    return (
      <View className="min-h-40 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  return <RowsPage entityId={entityId} editable={!readOnly} fill />;
}
