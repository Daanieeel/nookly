import {
  agenda,
  entityLabels,
  getAssignment,
  getCourse,
  getDeck,
  getExam,
  listAssignments,
  listCards,
  listCourses,
  listDecks,
  listExams,
  listLabels,
  relatedItems,
  getEntity,
  courseSemester,
  getFile,
  linkedItems,
  mentionedIn,
  mentionsOf,
  listViews,
  listUnrefinedJots,
  labelIdsByEntity,
  listAllLabels,
  getSemester,
  getSession,
  getStudyBlock,
  gradeReport,
  getRecipe,
  getTask,
  listBlocks,
  listBookmarks,
  listEntities,
  listFiles,
  listIngredients,
  listRecipeTags,
  listRecipes,
  listSemesters,
  listSessions,
  listSteps,
  listStudyBlocks,
  listSpaces,
  listStatuses,
  listSubtasks,
  listTasks,
  pinned,
  recents,
  search,
  spaceModules,
  subtaskProgress,
} from "@nookly/shared/data";
import { useQuery } from "@tanstack/react-query";
import { useDb } from "./context.tsx";
import { keys } from "./keys.ts";

/// Reads of the phone's data. Every one sits under `keys.local`, refreshed on each
/// local write and on every sync that brought changes.

export const useSpaces = () => {
  const db = useDb();
  return useQuery({ queryKey: keys.spaces, queryFn: () => listSpaces(db) });
};

export const useSpaceModules = (spaceId: string) => {
  const db = useDb();
  return useQuery({ queryKey: keys.modules(spaceId), queryFn: () => spaceModules(db, spaceId) });
};

export const useEntities = (spaceId: string | null, types: string[], trash = false) => {
  const db = useDb();
  return useQuery({
    queryKey: keys.entities(spaceId, types, trash),
    queryFn: () => listEntities(db, { spaceId: spaceId ?? undefined, types, trash }),
  });
};

export const useEntity = (id: string) => {
  const db = useDb();
  return useQuery({ queryKey: keys.entity(id), queryFn: () => getEntity(db, id) });
};

export const useTasks = (spaceId: string | null) => {
  const db = useDb();
  return useQuery({
    queryKey: keys.tasks(spaceId),
    queryFn: () => listTasks(db, spaceId ?? undefined),
  });
};

export const useTask = (id: string) => {
  const db = useDb();
  return useQuery({ queryKey: keys.task(id), queryFn: () => getTask(db, id) });
};

export const useStatuses = () => {
  const db = useDb();
  return useQuery({
    queryKey: keys.statuses,
    queryFn: () => listStatuses(db),
    staleTime: Infinity,
  });
};

export const useBlocks = (entityId: string) => {
  const db = useDb();
  return useQuery({ queryKey: keys.blocks(entityId), queryFn: () => listBlocks(db, entityId) });
};

export const useAgenda = (from: string, to: string) => {
  const db = useDb();
  return useQuery({ queryKey: keys.agenda(from, to), queryFn: () => agenda(db, from, to) });
};

export const useBookmarks = (spaceId: string | null) => {
  const db = useDb();
  return useQuery({
    queryKey: keys.bookmarks(spaceId),
    queryFn: () => listBookmarks(db, spaceId ?? undefined),
  });
};

export const useSearch = (query: string) => {
  const db = useDb();
  return useQuery({
    queryKey: keys.search(query),
    queryFn: () => search(db, query),
    enabled: query.trim().length > 0,
  });
};

export const useRecents = () => {
  const db = useDb();
  return useQuery({ queryKey: keys.recents, queryFn: () => recents(db) });
};

export const usePinned = () => {
  const db = useDb();
  return useQuery({ queryKey: keys.pinned, queryFn: () => pinned(db) });
};

export const useCourses = (spaceId: string | null) => {
  const db = useDb();
  return useQuery({
    queryKey: keys.courses(spaceId),
    queryFn: () => listCourses(db, spaceId ?? undefined),
  });
};

export const useCourse = (id: string) => {
  const db = useDb();
  return useQuery({ queryKey: keys.course(id), queryFn: () => getCourse(db, id) });
};

export const useExams = (query: { spaceId?: string; courseId?: string }) => {
  const db = useDb();
  return useQuery({
    queryKey: keys.exams(query.spaceId ?? null, query.courseId ?? null),
    queryFn: () => listExams(db, query),
  });
};

export const useExam = (id: string) => {
  const db = useDb();
  return useQuery({ queryKey: keys.exam(id), queryFn: () => getExam(db, id) });
};

export const useAssignments = (query: { spaceId?: string; courseId?: string }) => {
  const db = useDb();
  return useQuery({
    queryKey: keys.assignments(query.spaceId ?? null, query.courseId ?? null),
    queryFn: () => listAssignments(db, query),
  });
};

export const useAssignment = (id: string) => {
  const db = useDb();
  return useQuery({ queryKey: keys.assignment(id), queryFn: () => getAssignment(db, id) });
};

export const useDecks = (spaceId: string | null) => {
  const db = useDb();
  return useQuery({
    queryKey: keys.decks(spaceId),
    queryFn: () => listDecks(db, spaceId ?? undefined),
  });
};

export const useDeck = (id: string) => {
  const db = useDb();
  return useQuery({ queryKey: keys.deck(id), queryFn: () => getDeck(db, id) });
};

export const useCards = (deckId: string) => {
  const db = useDb();
  return useQuery({ queryKey: keys.cards(deckId), queryFn: () => listCards(db, deckId) });
};

export const useRelated = (entityId: string) => {
  const db = useDb();
  return useQuery({ queryKey: keys.related(entityId), queryFn: () => relatedItems(db, entityId) });
};

export const useLabels = (spaceId: string) => {
  const db = useDb();
  return useQuery({ queryKey: keys.labels(spaceId), queryFn: () => listLabels(db, spaceId) });
};

export const useEntityLabels = (entityId: string) => {
  const db = useDb();
  return useQuery({
    queryKey: keys.entityLabels(entityId),
    queryFn: () => entityLabels(db, entityId),
  });
};

export const useSubtasks = (parentId: string) => {
  const db = useDb();
  return useQuery({ queryKey: keys.subtasks(parentId), queryFn: () => listSubtasks(db, parentId) });
};

export const useSubtaskProgress = (parentId: string) => {
  const db = useDb();
  return useQuery({
    queryKey: keys.progress(parentId),
    queryFn: () => subtaskProgress(db, parentId),
  });
};

export const useFiles = (spaceId: string | null) => {
  const db = useDb();
  return useQuery({
    queryKey: keys.files(spaceId),
    queryFn: () => listFiles(db, spaceId ?? undefined),
  });
};

export const useFile = (id: string) => {
  const db = useDb();
  return useQuery({ queryKey: keys.file(id), queryFn: () => getFile(db, id) });
};

export const useRecipes = (spaceId: string | null) => {
  const db = useDb();
  return useQuery({
    queryKey: keys.recipes(spaceId),
    queryFn: () => listRecipes(db, spaceId ?? undefined),
  });
};

export const useRecipe = (id: string) => {
  const db = useDb();
  return useQuery({ queryKey: keys.recipe(id), queryFn: () => getRecipe(db, id) });
};

export const useRecipeParts = (id: string) => {
  const db = useDb();
  return useQuery({
    queryKey: keys.recipeParts(id),
    queryFn: async () => ({
      ingredients: await listIngredients(db, id),
      steps: await listSteps(db, id),
    }),
  });
};

export const useRecipeTags = () => {
  const db = useDb();
  return useQuery({
    queryKey: keys.recipeTags,
    queryFn: () => listRecipeTags(db),
    staleTime: Infinity,
  });
};

export const useSemesters = (spaceId: string | null) => {
  const db = useDb();
  return useQuery({
    queryKey: keys.semesters(spaceId),
    queryFn: () => listSemesters(db, spaceId ?? undefined),
  });
};

export const useSemester = (id: string) => {
  const db = useDb();
  return useQuery({ queryKey: keys.semester(id), queryFn: () => getSemester(db, id) });
};

export const useCourseSemester = (courseId: string) => {
  const db = useDb();
  return useQuery({
    queryKey: keys.courseSemester(courseId),
    queryFn: () => courseSemester(db, courseId),
  });
};

export const useSessions = (query: { spaceId?: string; courseId?: string } = {}) => {
  const db = useDb();
  return useQuery({
    queryKey: keys.sessions(query.spaceId ?? null, query.courseId ?? null),
    queryFn: () => listSessions(db, query),
  });
};

export const useSession = (id: string) => {
  const db = useDb();
  return useQuery({ queryKey: keys.session(id), queryFn: () => getSession(db, id) });
};

export const useStudyBlocks = (query: { spaceId?: string; examId?: string } = {}) => {
  const db = useDb();
  return useQuery({
    queryKey: keys.studyBlocks(query.spaceId ?? null, query.examId ?? null),
    queryFn: () => listStudyBlocks(db, query),
  });
};

export const useStudyBlock = (id: string) => {
  const db = useDb();
  return useQuery({ queryKey: keys.studyBlock(id), queryFn: () => getStudyBlock(db, id) });
};

export const useGradeReport = (spaceId: string) => {
  const db = useDb();
  return useQuery({ queryKey: keys.grades(spaceId), queryFn: () => gradeReport(db, spaceId) });
};

export const useAllLabels = () => {
  const db = useDb();
  return useQuery({ queryKey: keys.allLabels, queryFn: () => listAllLabels(db) });
};

/// The labels of the given tasks, by task id.
export const useTaskLabelIds = (spaceId: string | null, taskIds: string[]) => {
  const db = useDb();
  return useQuery({
    queryKey: [...keys.taskLabels(spaceId), taskIds.length],
    queryFn: () => labelIdsByEntity(db, taskIds),
  });
};

/// Jots with no note yet, oldest first.
export const useUnrefinedJots = (limit = 5) => {
  const db = useDb();
  return useQuery({
    queryKey: [...keys.unrefinedJots, limit],
    queryFn: () => listUnrefinedJots(db, { limit }),
  });
};

/// Saved Views of a module, of one Space or every Space's.
export const useViews = (query: { spaceId?: string; module?: string } = {}) => {
  const db = useDb();
  return useQuery({
    queryKey: keys.views(query.spaceId ?? null, query.module ?? null),
    queryFn: () => listViews(db, query),
  });
};

/// Every link of an item, in both directions.
export const useLinks = (entityId: string) => {
  const db = useDb();
  return useQuery({ queryKey: keys.links(entityId), queryFn: () => linkedItems(db, entityId) });
};

/// What a page mentions, and which pages mention it.
export const useMentions = (entityId: string) => {
  const db = useDb();
  return useQuery({
    queryKey: keys.mentions(entityId),
    queryFn: async () => ({
      mentions: await mentionsOf(db, entityId),
      mentionedIn: await mentionedIn(db, entityId),
    }),
  });
};
