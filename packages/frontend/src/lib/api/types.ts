export interface Space {
  id: string;
  name: string;
  icon: string | null;
  color: string;
  createdAt: string;
  updatedAt: string;
  position: number;
}

export interface Entity {
  id: string;
  spaceId: string;
  type: string;
  title: string;
  icon: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  /// Short readable id, Jira style: a three letter type prefix and a number, `TSK-14`.
  key: string;
}

export interface Semester {
  entity: Entity;
  /// Approximate, cosmetic only — never used for sorting or "current"
  /// detection. `termType`/`year` are the source of truth for that.
  startDate: string | null;
  endDate: string | null;
  termType: string | null;
  year: number | null;
  isCurrent: boolean;
  manualPosition: number | null;
}

export interface SpacePatch {
  name?: string;
  icon?: string;
  color?: string;
}

export interface EntityPatch {
  title?: string;
  icon?: string;
  pinned?: boolean;
  /// Moves the entity, with everything it structurally owns, to another Space.
  spaceId?: string;
}

export interface Relationship {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  relationshipType: string;
  fromBlockId: string | null;
  toBlockId: string | null;
  createdAt: string;
}

export interface RelationshipTypeInfo {
  name: string;
  inverseLabel: string;
}

export type RelationshipDirection = "from" | "to" | "both";

export type AppError =
  | { kind: "NotFound"; message: string }
  | { kind: "UnknownRelationshipType"; message: string }
  | { kind: "CardinalityViolation"; message: string }
  | { kind: "Conflict"; message: string }
  | { kind: "Db"; message: string };

export interface SearchHit {
  entityId: string;
  spaceId: string;
  title: string;
  type: string;
  icon: string | null;
  key: string;
  /// Set when the match came from one block of a Note/Jot rather
  /// than the entity's title.
  blockId: string | null;
  /// The matching block's text around the hit, matched terms wrapped in
  /// `\u0001` / `\u0002`. Only set alongside `blockId`.
  snippet: string | null;
  /// The page the block lives in. Differs from `entityId` for notes embedded in
  /// another entity's page, where the hit resolves to that owning entity.
  blockEntityId: string | null;
}

export interface Label {
  id: string;
  spaceId: string;
  name: string;
  color: string;
  createdAt: string;
  /// How many live (not trashed) entities carry it.
  usageCount: number;
}

export interface TaskStatus {
  id: string;
  name: string;
  color: string;
  doneness: number;
  position: number;
}

export interface Task {
  entity: Entity;
  statusId: string;
  startDate: string | null;
  dueDate: string | null;
  /// Ordered by label name. Only filled by `listTasks`.
  labelIds: string[];
}

export interface TaskDueTodaySummary {
  done: number;
  total: number;
}

export interface Block {
  id: string;
  entityId: string;
  position: number;
  blockType: BlockType;
  content: string;
  /// Code block header row (filename + language) — always
  /// `null` for every other block type.
  language: string | null;
  filename: string | null;
  /// Settings of a custom block (callout `variant`, timeline `title`, ...). Always
  /// empty on the standard block types.
  attrs: BlockAttrs;
  createdAt: string;
  updatedAt: string;
}

/// One Notes list row, loaded for the whole Space in one call.
export interface PageSummary {
  entity: Entity;
  /// Raw markdown of the leading text blocks joined by `\n`, capped around 280 chars.
  preview: string;
  lastEditedAt: string;
  labelIds: string[];
  /// Jot rows only: Notes this Jot is linked to, i.e. was refined into.
  linked: Entity[];
  /// Jot rows only: the most recent related Session occurrence.
  session: SessionContext | null;
}

export interface SessionContext {
  entity: Entity;
  date: string;
  startTime: string;
  courseId: string | null;
  courseTitle: string | null;
}

export interface BlockPatch {
  content?: string;
  blockType?: BlockType;
  /// `""` clears the field; omit to leave it untouched. Only meaningful on a `code` block.
  language?: string;
  filename?: string;
  /// Merged into the block's attrs; `""` clears one.
  attrs?: BlockAttrs;
}

export type BlockAttrs = Record<string, string>;

export type BlockType =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "quote"
  | "code"
  | "bulleted_list"
  | "numbered_list"
  | "table"
  | "image"
  | "embed"
  | "callout"
  | "timeline"
  | "progress"
  | "tree"
  | "steps"
  | "stats"
  | "details"
  | "divider"
  | "checklist"
  | "toggle"
  | "equation"
  | "math"
  | "diagram"
  | "entity_card"
  | "video"
  | "audio"
  | "file"
  | "bookmark";

export interface SessionOccurrence {
  entity: Entity;
  templateId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  cancelled: boolean;
  location: string | null;
  notes: string | null;
  /// The linked Course's title; only filled by `listSessions`.
  courseTitle: string | null;
}

export interface BriefingSession {
  entityId: string;
  title: string;
  /// `YYYY-MM-DD`.
  date: string;
  startTime: string;
  courseId: string | null;
  courseTitle: string | null;
  spaceId: string;
}

export interface OccurrenceOverride {
  date?: string;
  startTime?: string;
  endTime?: string;
  cancelled?: boolean;
  location?: string | null;
  notes?: string | null;
}

export interface Exam {
  entity: Entity;
  examDate: string | null;
  weight: number | null;
  grade: number | null;
  status: string;
  room: string | null;
}

export type CardState = "new" | "learning" | "review" | "relearning";
export type CardRating = "again" | "hard" | "good" | "easy";

export interface IndexCard {
  id: string;
  deckEntityId: string;
  front: string;
  back: string;
  state: CardState;
  dueAt: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  lastReviewAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  /// When the card comes back after each rating, worked out by FSRS.
  next: Record<CardRating, string>;
}

export interface DeckSummary {
  entity: Entity;
  examId: string | null;
  stats: DeckStats;
}

export interface DeckStats {
  total: number;
  new: number;
  learning: number;
  due: number;
  nextDueAt: string | null;
  reviewedToday: number;
}

export interface StudyBlock {
  entity: Entity;
  date: string;
  startTime: string;
  endTime: string;
}

/// A Course's grade rolled up from its Exams and Assignments.
export interface CourseGrades {
  /// Weighted mean of the graded items, `null` until one is graded.
  grade: number | null;
  /// Share of the course's total weight that is graded, from 0 to 1.
  gradedWeight: number;
  gradedCount: number;
  itemCount: number;
}

export interface Assignment {
  entity: Entity;
  dueDate: string | null;
  status: string;
  grade: number | null;
}

export interface FileEntity {
  entity: Entity;
  localPath: string | null;
  provider: "google_drive" | "dropbox" | "icloud" | null;
  url: string | null;
  originalFilename: string | null;
  /// Where a referenced file lives on disk; set without `localPath` until it's
  /// copied into storage.
  sourcePath: string | null;
  /// Read only. True for an indexable File (pdf, png/jpg, docx, pptx, xlsx)
  /// with no search content yet — never indexed, or the last attempt found
  /// nothing.
  needsReindex: boolean;
  /// Attached Label ids, ordered by label name.
  labelIds: string[];
  /// Read only. The full extracted/OCR'd text last indexed for this File.
  /// Only populated by `getFile` (a single File); `listFiles` always returns
  /// `null` here to keep listing many Files cheap.
  indexedContent: string | null;
}

export interface Bookmark {
  entity: Entity;
  url: string;
  fetchedTitle: string | null;
  faviconUrl: string | null;
  previewImageUrl: string | null;
  description: string | null;
  metadataFetchedAt: string | null;
  /// Local snapshot of the page, the main preview; `previewImageUrl` stands in
  /// while none exists.
  screenshotPath: string | null;
  /// User override of which image wins for the card's cover, from "Compare
  /// Previews". `null` keeps the default (screenshot when present, else
  /// `previewImageUrl`).
  preferredImage: "screenshot" | "preview" | null;
  /// Attached Label ids, ordered by label name.
  labelIds: string[];
}
