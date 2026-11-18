import { getOrCreateCourseNotes, getOrCreateSemesterNotes } from "@nookly/shared/data";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import { LivePage } from "../editor/LivePage.tsx";
import { RowsPage } from "../editor/RowsPage.tsx";
import { usePageSession } from "../editor/use-page-session.ts";

/// A page's body, or an item's description: the live editor when this phone has the
/// page's document, so it syncs as it is typed and shows who else is in it, else its
/// blocks in the same editor on a document kept on this phone (`RowsPage`). A page fills
/// the screen; a description (`embedded`) is a region of its item's page, as tall as its
/// text.
export function PageEditor({
  entityId,
  readOnly,
  embedded = false,
}: {
  entityId: string;
  readOnly: boolean;
  embedded?: boolean;
}) {
  const fill = !embedded;
  const page = usePageSession(entityId);
  if (page.state === "live") {
    return (
      <LivePage session={page.session} editable={!readOnly && !page.session.readOnly} fill={fill} />
    );
  }
  if (page.state === "waiting") {
    return (
      <View
        className={embedded ? "min-h-12 justify-center" : "min-h-40 items-center justify-center"}
      >
        <ActivityIndicator />
      </View>
    );
  }
  return <RowsPage entityId={entityId} editable={!readOnly} fill={fill} />;
}

/// The notes on a course's or a semester's page: its own notes page (a `course_notes`
/// page, or the semester's note), made on first view as the desktop does, so both apps
/// edit the same text.
export function OwnNotes({
  kind,
  ownerId,
  readOnly,
}: {
  kind: "course" | "semester";
  ownerId: string;
  readOnly: boolean;
}) {
  const [notesId, setNotesId] = useState<string | null>(null);
  const find = useLocalWrite((db, id: string) =>
    kind === "course" ? getOrCreateCourseNotes(db, id) : getOrCreateSemesterNotes(db, id),
  );
  const { mutate } = find;
  useEffect(() => {
    setNotesId(null);
    mutate(ownerId, { onSuccess: setNotesId });
  }, [ownerId, mutate]);
  if (!notesId) return null;
  return <PageEditor entityId={notesId} readOnly={readOnly} embedded />;
}
