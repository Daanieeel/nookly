import { MODULE_ENTITY_TYPES, MODULE_LABELS, type ModuleKey } from "@nookly/shared/modules";
import { type PageAction, PageActions } from "../ui/page-actions.tsx";
import { IconCamera, IconPlus, IconWand } from "@tabler/icons-react-native";
import { useEntityMenu } from "./entity-actions.tsx";
import { EntitySwipe } from "./EntitySwipe.tsx";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useAssignments, useCourses, useDecks, useEntities, useExams } from "../data/queries.ts";
import { EntityIcon } from "../ui/icons.tsx";
import { Empty, Row, Section } from "../ui/Row.tsx";
import { MoodleModule } from "./MoodleScreens.tsx";
import { OnPage } from "../ui/kit/on-page.ts";
import { Screen } from "../ui/Screen.tsx";
import { TOOLBAR_ICONS } from "../ui/toolbar-icons.ts";
import { Text } from "../ui/Text.tsx";
import { AssignmentsScreen } from "./AssignmentsScreen.tsx";
import { BookmarkList, BookmarkPasteBar } from "./BookmarkList.tsx";
import { CalendarScreen } from "./CalendarScreen.tsx";
import { FilePasteBar, FileRows, useAddFiles } from "./FileScreens.tsx";
import { JotList, NoteList } from "./PageLists.tsx";
import { CourseGallery, DeckGrid, ExamTimeline } from "./StudyGalleries.tsx";
import { GradesScreen } from "./GradesScreen.tsx";
import { SemesterList } from "./SemesterList.tsx";
import { RecipeRows } from "./RecipeScreens.tsx";
import { ScanSheet, useScanDocument } from "./ScanSheet.tsx";
import { AssignmentRows, CourseRows, DeckRows, ExamRows } from "./StudyLists.tsx";
import { TasksScreen } from "./TasksScreen.tsx";

/// What "+" makes in a module, where the phone can make it.
/// Each module's New button: what it makes, and where its form is.
const CREATE = new Map<ModuleKey, { label: string; href: (spaceId: string) => string }>([
  ["notes", { label: "New Note", href: (spaceId) => `/new/page?spaceId=${spaceId}&type=note` }],
  ["jots", { label: "New Jot", href: (spaceId) => `/new/page?spaceId=${spaceId}&type=jot` }],
  ["bookmarks", { label: "New Bookmark", href: (spaceId) => `/new/bookmark?spaceId=${spaceId}` }],
  ["calendar", { label: "New Calendar Entry", href: (spaceId) => `/new/entry?spaceId=${spaceId}` }],
  ["courses", { label: "New Course", href: (spaceId) => `/new/course?spaceId=${spaceId}` }],
  ["exams", { label: "New Exam", href: (spaceId) => `/new/exam?spaceId=${spaceId}` }],
  [
    "assignments",
    { label: "New Assignment", href: (spaceId) => `/new/assignment?spaceId=${spaceId}` },
  ],
  ["decks", { label: "New Deck", href: (spaceId) => `/new/deck?spaceId=${spaceId}` }],
  ["recipes", { label: "New Recipe", href: (spaceId) => `/new/recipe?spaceId=${spaceId}` }],
  ["sessions", { label: "New Session", href: (spaceId) => `/new/session?spaceId=${spaceId}` }],
  ["semesters", { label: "New Semester", href: (spaceId) => `/new/semester?spaceId=${spaceId}` }],
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
          <EntitySwipe entity={entity}>
            <Row
              title={entity.title || "Untitled"}
              subtitle={entity.key}
              icon={<EntityIcon type={entity.type} icon={entity.icon} />}
              onPress={() => router.push(`/entity/${entity.id}`)}
              onLongPress={() => entityMenu(entity)}
            />
          </EntitySwipe>
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
  const { available: canScan, scan } = useScanDocument(spaceId);
  const [scanned, setScanned] = useState<string | null>(null);
  const create = CREATE.get(module);
  const actions: PageAction[] =
    module === "files"
      ? [
          ...(canScan
            ? [
                {
                  label: "Scan Document",
                  icon: IconCamera,
                  toolbarIcon: TOOLBAR_ICONS.scan,
                  onPress: () => scan.mutate(undefined, { onSuccess: (id) => setScanned(id) }),
                },
              ]
            : []),
          {
            label: "Add Files",
            icon: IconPlus,
            toolbarIcon: TOOLBAR_ICONS.plus,
            onPress: () => addFiles.mutate(undefined),
            primary: true,
          },
        ]
      : create
        ? [
            ...(module === "semesters"
              ? [
                  {
                    label: "Set Up Semesters",
                    icon: IconWand,
                    toolbarIcon: TOOLBAR_ICONS.wand,
                    onPress: () => router.push(`/new/semester-setup?spaceId=${spaceId}`),
                  },
                ]
              : []),
            {
              label: create.label,
              icon: IconPlus,
              toolbarIcon: TOOLBAR_ICONS.plus,
              onPress: () => router.push(create.href(spaceId)),
              primary: true,
            },
          ]
        : [];
  return (
    <>
      <Stack.Screen options={{ title: MODULE_LABELS[module] }} />
      <Screen wide={GALLERIES.includes(module)}>
        {/* A gallery's cards sit one step off the plain page, as Home's do. */}
        <OnPage.Provider value={GALLERIES.includes(module)}>
          <PageActions actions={actions} />
          {module === "courses" ? (
            <CourseGallery spaceId={spaceId} />
          ) : module === "exams" ? (
            <ExamTimeline spaceId={spaceId} />
          ) : module === "decks" ? (
            <DeckGrid spaceId={spaceId} />
          ) : module === "notes" ? (
            <NoteList spaceId={spaceId} />
          ) : module === "jots" ? (
            <JotList spaceId={spaceId} />
          ) : module === "bookmarks" ? (
            <BookmarkList spaceId={spaceId} />
          ) : module === "files" ? (
            <>
              {scan.error ? <Text tone="destructive">{scan.error.message}</Text> : null}
              <FileRows spaceId={spaceId} />
              <ScanSheet id={scanned} spaceId={spaceId} onClose={() => setScanned(null)} />
            </>
          ) : module === "recipes" ? (
            <RecipeRows spaceId={spaceId} />
          ) : module === "semesters" ? (
            <SemesterList spaceId={spaceId} />
          ) : module === "moodle" ? (
            <MoodleModule spaceId={spaceId} />
          ) : STUDY.includes(module) ? (
            <>
              <StudyList spaceId={spaceId} module={module} />
            </>
          ) : (
            <EntityList spaceId={spaceId} module={module} />
          )}
        </OnPage.Provider>
      </Screen>
      {module === "bookmarks" ? <BookmarkPasteBar spaceId={spaceId} /> : null}
      {module === "files" ? <FilePasteBar spaceId={spaceId} /> : null}
    </>
  );
}
