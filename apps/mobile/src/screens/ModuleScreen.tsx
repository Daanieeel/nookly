import { MODULE_ENTITY_TYPES, MODULE_LABELS, type ModuleKey } from "@nookly/shared/modules";
import { useEntityMenu } from "./entity-actions.tsx";
import { importDeckFile } from "@nookly/shared/data";
import { File } from "expo-file-system";
import { Stack, useRouter } from "expo-router";
import { View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import { useAssignments, useCourses, useDecks, useEntities, useExams } from "../data/queries.ts";
import { Button, statusOf } from "../ui/Button.tsx";
import { EntityIcon } from "../ui/icons.tsx";
import { Empty, Row, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { TOOLBAR_ICONS } from "../ui/toolbar-icons.ts";
import { Text } from "../ui/Text.tsx";
import { AssignmentsScreen } from "./AssignmentsScreen.tsx";
import { BookmarkList } from "./BookmarkList.tsx";
import { CalendarScreen } from "./CalendarScreen.tsx";
import { FileRows, useAddFiles } from "./FileScreens.tsx";
import { JotList, NoteList } from "./PageLists.tsx";
import { CourseGallery, DeckGrid, ExamTimeline } from "./StudyGalleries.tsx";
import { GradesScreen } from "./GradesScreen.tsx";
import { SemesterList } from "./SemesterList.tsx";
import { RecipeRows } from "./RecipeScreens.tsx";
import { AssignmentRows, CourseRows, DeckRows, ExamRows } from "./StudyLists.tsx";
import { TasksScreen } from "./TasksScreen.tsx";

/// Brings in a deck written to a file, from the phone's files.
function ImportDeckButton({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const importDeck = useLocalWrite(async (db, _: undefined) => {
    const picked = await File.pickFileAsync({ mimeTypes: ["application/json", "text/plain"] });
    if (picked.canceled) return null;
    return importDeckFile(db, spaceId, await picked.result.text());
  });
  return (
    <View className="items-start">
      <Button
        label="Import Deck File"
        variant="ghost"
        status={statusOf(importDeck)}
        successLabel="Imported"
        errorLabel="Couldn't import it"
        onPress={() =>
          importDeck.mutate(undefined, { onSuccess: (id) => id && router.push(`/entity/${id}`) })
        }
      />
      {importDeck.error ? <Text tone="destructive">{importDeck.error.message}</Text> : null}
    </View>
  );
}

/// What "+" makes in a module, where the phone can make it.
const CREATE = new Map<ModuleKey, (spaceId: string) => string>([
  ["notes", (spaceId) => `/new/page?spaceId=${spaceId}&type=note`],
  ["jots", (spaceId) => `/new/page?spaceId=${spaceId}&type=jot`],
  ["bookmarks", (spaceId) => `/new/bookmark?spaceId=${spaceId}`],
  ["calendar", (spaceId) => `/new/entry?spaceId=${spaceId}`],
  ["courses", (spaceId) => `/new/course?spaceId=${spaceId}`],
  ["exams", (spaceId) => `/new/exam?spaceId=${spaceId}`],
  ["assignments", (spaceId) => `/new/assignment?spaceId=${spaceId}`],
  ["decks", (spaceId) => `/new/deck?spaceId=${spaceId}`],
  ["recipes", (spaceId) => `/new/recipe?spaceId=${spaceId}`],
  ["sessions", (spaceId) => `/new/session?spaceId=${spaceId}`],
  ["semesters", (spaceId) => `/new/semester?spaceId=${spaceId}`],
]);

/// Modules whose items the phone lists with their own fields.
function StudyList({ spaceId, module }: { spaceId: string; module: ModuleKey }) {
  const { data: courses = [] } = useCourses(spaceId);
  const { data: exams = [] } = useExams({ spaceId });
  const { data: assignments = [] } = useAssignments({ spaceId });
  const { data: decks = [] } = useDecks(spaceId);
  const courseName = (id: string | null) => courses.find((c) => c.entity.id === id)?.entity.title;
  return (
    <Section>
      {module === "courses" ? <CourseRows courses={courses} /> : null}
      {module === "exams" ? <ExamRows exams={exams} courseName={courseName} /> : null}
      {module === "assignments" ? (
        <AssignmentRows assignments={assignments} courseName={courseName} />
      ) : null}
      {module === "decks" ? <DeckRows decks={decks} /> : null}
    </Section>
  );
}

/// Modules shown as galleries that use the whole width of a wide page.
const GALLERIES: ModuleKey[] = ["courses", "decks", "files", "recipes", "bookmarks"];

const STUDY: ModuleKey[] = ["courses", "exams", "assignments", "decks"];

function EntityList({ spaceId, module }: { spaceId: string; module: ModuleKey }) {
  const entityMenu = useEntityMenu();
  const router = useRouter();
  const { data: entities = [] } = useEntities(spaceId, [...MODULE_ENTITY_TYPES[module]]);
  const shown = entities.filter(
    (e) =>
      e.type !== "course_notes" &&
      e.type !== "session_template" &&
      e.type !== "calendar_entry_template",
  );
  return (
    <Section>
      {shown.length === 0 ? (
        <Empty text={`No ${MODULE_LABELS[module].toLowerCase()} yet.`} />
      ) : null}
      {shown.map((entity) => (
        <View key={entity.id}>
          <Row
            title={entity.title || "Untitled"}
            subtitle={entity.key}
            icon={<EntityIcon type={entity.type} icon={entity.icon} />}
            onPress={() => router.push(`/entity/${entity.id}`)}
            onLongPress={() => entityMenu(entity)}
          />
        </View>
      ))}
    </Section>
  );
}

/// One module of one Space.
export function ModuleScreen({ spaceId, module }: { spaceId: string; module: ModuleKey }) {
  if (module === "tasks") {
    return (
      <>
        <Stack.Screen options={{ title: MODULE_LABELS.tasks }} />
        <TasksScreen spaceId={spaceId} />
      </>
    );
  }
  if (module === "sessions" || module === "calendar") {
    return (
      <>
        <Stack.Screen options={{ title: MODULE_LABELS[module] }} />
        <CalendarScreen spaceId={spaceId} create={module === "sessions" ? "session" : "entry"} />
      </>
    );
  }
  if (module === "assignments") {
    return <AssignmentsScreen spaceId={spaceId} />;
  }
  if (module === "grades") {
    return (
      <>
        <Stack.Screen options={{ title: MODULE_LABELS.grades }} />
        <GradesScreen spaceId={spaceId} />
      </>
    );
  }
  return <ListModule spaceId={spaceId} module={module} />;
}

/// The modules that are a list or a gallery of the Space's items.
function ListModule({ spaceId, module }: { spaceId: string; module: ModuleKey }) {
  const router = useRouter();
  const addFiles = useAddFiles(spaceId);
  const create = CREATE.get(module);
  return (
    <>
      <Stack.Screen options={{ title: MODULE_LABELS[module] }} />
      {module === "files" ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            icon={TOOLBAR_ICONS.plus}
            iconRenderingMode="template"
            accessibilityLabel="Add Files"
            onPress={() => addFiles.mutate(undefined)}
          />
        </Stack.Toolbar>
      ) : create ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            icon={TOOLBAR_ICONS.plus}
            iconRenderingMode="template"
            accessibilityLabel={`New in ${MODULE_LABELS[module]}`}
            onPress={() => router.push(create(spaceId))}
          />
        </Stack.Toolbar>
      ) : null}
      <Screen wide={GALLERIES.includes(module)}>
        {module === "courses" ? (
          <CourseGallery spaceId={spaceId} />
        ) : module === "exams" ? (
          <ExamTimeline spaceId={spaceId} />
        ) : module === "decks" ? (
          <>
            <ImportDeckButton spaceId={spaceId} />
            <DeckGrid spaceId={spaceId} />
          </>
        ) : module === "notes" ? (
          <NoteList spaceId={spaceId} />
        ) : module === "jots" ? (
          <JotList spaceId={spaceId} />
        ) : module === "bookmarks" ? (
          <BookmarkList spaceId={spaceId} />
        ) : module === "files" ? (
          <FileRows spaceId={spaceId} />
        ) : module === "recipes" ? (
          <RecipeRows spaceId={spaceId} />
        ) : module === "semesters" ? (
          <SemesterList spaceId={spaceId} />
        ) : STUDY.includes(module) ? (
          <>
            <StudyList spaceId={spaceId} module={module} />
          </>
        ) : (
          <EntityList spaceId={spaceId} module={module} />
        )}
      </Screen>
    </>
  );
}
