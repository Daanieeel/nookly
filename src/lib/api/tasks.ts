import { invoke } from "@tauri-apps/api/core";
import type { Task, TaskDueTodaySummary, TaskStatus } from "./types";

export function listTaskStatuses(): Promise<TaskStatus[]> {
  return invoke("list_task_statuses");
}

export function createTask(
  spaceId: string,
  title: string,
  startDate: string | null,
  dueDate: string | null,
): Promise<Task> {
  return invoke("create_task", { spaceId, title, startDate, dueDate });
}

export function createSubtask(parentEntityId: string, title: string): Promise<Task> {
  return invoke("create_subtask", { parentEntityId, title });
}

export function listSubtasks(parentEntityId: string): Promise<Task[]> {
  return invoke("list_subtasks", { parentEntityId });
}

export function subtaskProgress(parentEntityId: string): Promise<number | null> {
  return invoke("subtask_progress", { parentEntityId });
}

/// One Task (or Sub-task) with its label ids, for its detail page.
export function getTask(entityId: string): Promise<Task> {
  return invoke("get_task", { entityId });
}

export function listTasks(spaceId: string): Promise<Task[]> {
  return invoke("list_tasks", { spaceId });
}

export function updateTaskStatus(entityId: string, statusId: string): Promise<void> {
  return invoke("update_task_status", { entityId, statusId });
}

export function countTasksDueToday(): Promise<TaskDueTodaySummary> {
  return invoke("count_tasks_due_today");
}

export function countOpenTasksDueOrOverdue(): Promise<number> {
  return invoke("count_open_tasks_due_or_overdue");
}

export function updateTaskDates(
  entityId: string,
  startDate: string | null,
  dueDate: string | null,
): Promise<void> {
  return invoke("update_task_dates", { entityId, startDate, dueDate });
}

/// Turns a top-level Task without Sub-tasks into a Sub-task of `parentEntityId`.
export function convertToSubtask(entityId: string, parentEntityId: string): Promise<Task> {
  return invoke("convert_to_subtask", { entityId, parentEntityId });
}
