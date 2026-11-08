import { invoke } from "@tauri-apps/api/core";
import type { Reference, ReferenceProvider, ReferenceStatus } from "./types";

/// A pointer to a link or a Moodle object. `title` is its name in Nookly (the target's
/// own title when the caller has it); a file on disk is added as a File instead.
export function createReference(
  spaceId: string,
  provider: Exclude<ReferenceProvider, "file">,
  remoteId: string,
  title?: string,
): Promise<Reference> {
  return invoke("create_reference", { spaceId, provider, remoteId, title: title ?? null });
}

export function getReference(entityId: string): Promise<Reference> {
  return invoke("get_reference", { entityId });
}

export function listReferences(spaceId: string): Promise<Reference[]> {
  return invoke("list_references", { spaceId });
}

/// Points a reference at another target; what was known about the old one is forgotten.
export function retargetReference(entityId: string, remoteId: string): Promise<Reference> {
  return invoke("retarget_reference", { entityId, remoteId });
}

/// Looks at the target now, on this device. Works for a reference and for a File that only
/// points elsewhere. What it finds is kept as the last known result, the state is not.
export function checkReference(entityId: string): Promise<ReferenceStatus> {
  return invoke("check_reference", { entityId });
}
