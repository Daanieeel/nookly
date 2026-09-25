// Every context menu registration, loaded once at startup. A module with its own
// right-click actions adds its file here, the same way it adds its schema to the
// backend build; nothing else in the app changes.
import "#/components/context-menu/text-actions.ts";
import "#/components/context-menu/app-actions.tsx";
import "#/components/context-menu/entity-actions.tsx";
import "#/features/tasks/context-actions.tsx";
import "#/features/notes/context-actions.tsx";
import "#/features/files/context-actions.tsx";
import "#/features/bookmarks/context-actions.tsx";
import "#/features/sessions/context-actions.tsx";
import "#/features/courses/context-actions.tsx";
import "#/features/exams/context-actions.tsx";
import "#/features/assignments/context-actions.tsx";
import "#/components/sidebar/context-actions.tsx";
