import { createAssignment } from "#/lib/api/assignments.ts";
import { createCourse, createSemester } from "#/lib/api/courses.ts";
import { createDeck } from "#/lib/api/decks.ts";
import { softDeleteEntity } from "#/lib/api/entities.ts";
import { createExam } from "#/lib/api/exams.ts";
import { createJot, createNote } from "#/lib/api/notes.ts";
import { createRecipe } from "#/lib/api/recipes.ts";
import { createRelationship } from "#/lib/api/relationships.ts";
import { qk } from "#/lib/query-keys.ts";
import type { QueryClient } from "@tanstack/react-query";
import { createTask } from "#/lib/api/tasks.ts";
import type { Entity } from "#/lib/api/types.ts";

/// A way to create one type of item from the relationship picker.
export interface PickerCreator {
  type: string;
  /// Creating it already links it to the item it was made for, so no second link is made.
  linksItself: boolean;
  /// `sourceId` is the item the new one is created for.
  create: (spaceId: string, title: string, sourceId: string) => Promise<Entity>;
}

/// Types made with nothing but a title in the Space of the item they are created for.
type Create = (spaceId: string, title: string) => Promise<Entity>;
type CreateForCourse = (spaceId: string, title: string, courseId: string) => Promise<Entity>;

const TITLE_ONLY = new Map<string, Create>([
  ["note", createNote],
  ["jot", createJot],
  ["task", (spaceId, title) => createTask(spaceId, title, null, null).then((t) => t.entity)],
  ["course", createCourse],
  ["semester", (spaceId, title) => createSemester(spaceId, title).then((s) => s.entity)],
  ["recipe", createRecipe],
  ["index_card_deck", (spaceId, title) => createDeck(spaceId, title, null)],
]);

/// Types that need a Course to exist, and are made linked to it.
const NEEDS_COURSE = new Map<string, CreateForCourse>([
  [
    "assignment",
    (spaceId, title, courseId) =>
      createAssignment(spaceId, title, courseId, null).then((a) => a.entity),
  ],
  [
    "exam",
    (spaceId, title, courseId) =>
      createExam(spaceId, title, courseId, null, null).then((e) => e.entity),
  ],
]);

/// How `targetType` can be created from the picker for an item of `sourceType`, or `null`
/// when it cannot. Only types that need nothing beyond the item being linked from qualify:
/// an Assignment or Exam needs a Course, so it is offered only from a Course and through
/// its own course link. Everything else that needs more (a Bookmark's address, a Session's
/// date and time) is left to its own page.
export function pickerCreator(
  targetType: string,
  option: { type: string; reverse: boolean },
  sourceType: string,
): PickerCreator | null {
  const plain = TITLE_ONLY.get(targetType);
  if (plain) {
    return {
      type: targetType,
      linksItself: false,
      create: (spaceId, title) => plain(spaceId, title),
    };
  }
  const withCourse = NEEDS_COURSE.get(targetType);
  if (
    withCourse &&
    sourceType === "course" &&
    option.reverse &&
    option.type === `${targetType}-course`
  ) {
    return { type: targetType, linksItself: true, create: withCourse };
  }
  return null;
}

/// Creates the item in the Space of `source` and links it in one go, the way `option` points.
/// If the link is refused the new item goes to the trash again, so nothing is left unlinked.
export async function createLinked(
  creator: PickerCreator,
  source: Pick<Entity, "id" | "spaceId">,
  title: string,
  option: { type: string; reverse: boolean },
): Promise<Entity> {
  const created = await creator.create(source.spaceId, title, source.id);
  if (creator.linksItself) return created;
  try {
    if (option.reverse) await createRelationship(created.id, source.id, option.type);
    else await createRelationship(source.id, created.id, option.type);
  } catch (error) {
    await softDeleteEntity(created.id).catch(() => {});
    throw error;
  }
  return created;
}

/// Refreshes every list a newly created item can show up in.
export async function invalidateCreated(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    [
      qk.entities.root,
      qk.tasks.root,
      qk.courses.root,
      qk.semesters.root,
      qk.assignments.root,
      qk.assignments.all,
      qk.exams.root,
      qk.exams.all,
      qk.decks.root,
      qk.decks.summaries,
      qk.recipes.root,
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}
