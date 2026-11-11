import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { notify } from "#/components/notify.tsx";
import { useAppHotkey } from "#/hooks/use-app-hotkey.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import { qk } from "#/lib/query-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { QuickCreateTask, type TaskDraft } from "./QuickCreateTask";
import { ScopedTasksData } from "./task-controls";

/// The New task dialog the Tasks page uses, opened from anywhere: the palette's New Task
/// and the `newTask` shortcut. It starts in the Space being worked in, else the first,
/// and its Space chip picks another.
export function NewTaskDialog() {
  const newTask = useNavStore((s) => s.newTask);
  const setNewTask = useNavStore((s) => s.setNewTask);
  const activeSpaceId = useNavStore((s) => s.activeSpaceId);
  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  const fallbackSpaceId = spaces.find((s) => s.id === activeSpaceId)?.id ?? spaces[0]?.id;
  useAppHotkey("newTask", () => {
    if (fallbackSpaceId) setNewTask({ spaceId: fallbackSpaceId, title: "" });
  });
  const title = newTask?.title;
  const draft = useMemo<TaskDraft>(() => ({ title }), [title]);
  // Stays mounted while closed, in the Space it would open in, so it closes like any dialog.
  const spaceId = newTask?.spaceId ?? fallbackSpaceId;
  if (!spaceId) return null;
  return (
    <ScopedTasksData spaceId={spaceId}>
      <QuickCreateTask
        open={newTask !== null}
        draft={draft}
        spaces={spaces}
        onSpaceChange={(next) => setNewTask({ spaceId: next, title: title ?? "" })}
        onOpenChange={(open) => {
          if (!open) setNewTask(null);
        }}
        onCreated={(task) => notify.success("Task created", { entity: task.entity })}
      />
    </ScopedTasksData>
  );
}
