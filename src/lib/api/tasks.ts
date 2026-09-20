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

export function listTasks(spaceId: string): Promise<Task[]> {
  return invoke("list_tasks", { spaceId });
}

export function updateTaskStatus(entityId: string, statusId: string): Promise<void> {
  return invoke("update_task_status", { entityId, statusId });
}

export function countTasksDueToday(): Promise<TaskDueTodaySummary> {
  return invoke("count_tasks_due_today");
}

export function updateTaskDates(
  entityId: string,
  startDate: string | null,
  dueDate: string | null,
): Promise<void> {
  return invoke("update_task_dates", { entityId, startDate, dueDate });
}
