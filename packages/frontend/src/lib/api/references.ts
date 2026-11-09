import { invoke } from "@tauri-apps/api/core";
import type { ReferenceStatus } from "./types";

/// Looks at where a File points now, on this device: a file on disk, or a link. What it finds
/// is kept as the last known result; the state itself is never stored.
export function checkReference(entityId: string): Promise<ReferenceStatus> {
  return invoke("check_reference", { entityId });
}
