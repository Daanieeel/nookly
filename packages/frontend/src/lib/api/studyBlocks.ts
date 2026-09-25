import { invoke } from "@tauri-apps/api/core";
import type { StudyBlock } from "./types";

export function createStudyBlock(
  spaceId: string,
  title: string,
  examId: string,
  date: string,
  startTime: string,
  endTime: string,
): Promise<StudyBlock> {
  return invoke("create_study_block", { spaceId, title, examId, date, startTime, endTime });
}

export function listStudyBlocks(spaceId: string): Promise<StudyBlock[]> {
  return invoke("list_study_blocks", { spaceId });
}
