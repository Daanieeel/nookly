import { MODULE_ENTITY_TYPES, MODULE_LABELS, type ModuleKey } from "@nookly/shared/modules";
import { IconPlus } from "@tabler/icons-react-native";
import { Stack, useRouter } from "expo-router";
import { View } from "react-native";
import {
  useAssignments,
  useBookmarks,
  useCourses,
  useDecks,
  useEntities,
  useExams,
} from "../data/queries.ts";
import { IconButton } from "../ui/Button.tsx";
import { EntityIcon } from "../ui/icons.tsx";
import { Empty, Row, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { useTheme } from "../ui/theme.ts";
import { FileRows, useAddFiles } from "./FileScreens.tsx";
import { RecipeRows } from "./RecipeScreens.tsx";
import { AssignmentRows, CourseRows, DeckRows, ExamRows } from "./StudyLists.tsx";
import { TasksScreen } from "./TasksScreen.tsx";

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

const STUDY: ModuleKey[] = ["courses", "exams", "assignments", "decks"];

function EntityList({ spaceId, module }: { spaceId: string; module: ModuleKey }) {
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
          />
        </View>
      ))}
    </Section>
  );
}

function BookmarkList({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const { data: bookmarks = [] } = useBookmarks(spaceId);
  return (
    <Section>
      {bookmarks.length === 0 ? <Empty text="No bookmarks yet." /> : null}
      {bookmarks.map((b) => (
        <View key={b.entity.id}>
          <Row
            title={b.entity.title}
            subtitle={b.url}
            icon={<EntityIcon type="bookmark" icon={b.entity.icon} />}
            onPress={() => router.push(`/entity/${b.entity.id}`)}
          />
        </View>
      ))}
    </Section>
  );
}

/// One module of one Space.
export function ModuleScreen({ spaceId, module }: { spaceId: string; module: ModuleKey }) {
  const theme = useTheme();
  const router = useRouter();
  if (module === "tasks") {
    return (
      <>
        <Stack.Screen options={{ title: MODULE_LABELS.tasks }} />
        <TasksScreen spaceId={spaceId} />
      </>
    );
  }
  const addFiles = useAddFiles(spaceId);
  const create = CREATE.get(module);
  return (
    <>
      <Stack.Screen
        options={{
          title: MODULE_LABELS[module],
          headerRight:
            module === "files"
              ? () => (
                  <IconButton
                    label="Add Files"
                    icon={<IconPlus size={22} color={theme.colors.foreground} />}
                    onPress={() => addFiles.mutate(undefined)}
                  />
                )
              : create
                ? () => (
                    <IconButton
                      label={`New in ${MODULE_LABELS[module]}`}
                      icon={<IconPlus size={22} color={theme.colors.foreground} />}
                      onPress={() => router.push(create(spaceId))}
                    />
                  )
                : undefined,
        }}
      />
      <Screen>
        {module === "bookmarks" ? (
          <BookmarkList spaceId={spaceId} />
        ) : module === "files" ? (
          <FileRows spaceId={spaceId} />
        ) : module === "recipes" ? (
          <RecipeRows spaceId={spaceId} />
        ) : STUDY.includes(module) ? (
          <StudyList spaceId={spaceId} module={module} />
        ) : (
          <EntityList spaceId={spaceId} module={module} />
        )}
      </Screen>
    </>
  );
}
