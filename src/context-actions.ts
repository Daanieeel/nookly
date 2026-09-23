// Every context menu registration, loaded once at startup. A module with its own
// right-click actions adds its file here, the same way it adds its schema to the
// backend build; nothing else in the app changes.
import "@/components/context-menu/text-actions";
import "@/components/context-menu/app-actions";
import "@/components/context-menu/entity-actions";
import "@/features/tasks/context-actions";
import "@/features/notes/context-actions";
import "@/features/files/context-actions";
import "@/features/bookmarks/context-actions";
import "@/features/sessions/context-actions";
import "@/features/courses/context-actions";
import "@/features/exams/context-actions";
import "@/features/assignments/context-actions";
import "@/components/sidebar/context-actions";
