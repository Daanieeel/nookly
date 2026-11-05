import type { QueryClient } from "@tanstack/react-query";
import { notify } from "#/components/notify.tsx";
import { getEntity } from "#/lib/api/entities.ts";
import { importFileFromBytes } from "#/lib/api/files.ts";
import { createRelationship } from "#/lib/api/relationships.ts";
import type { FileEntity } from "#/lib/api/types.ts";
import { qk } from "#/lib/query-keys.ts";
import { FILE_DROP_ATTRIBUTE } from "#/hooks/use-window-file-drop.ts";

/// Where dropped files go: into a Space, and onto a page when `entityId` is set.
export interface DropZone {
  spaceId: string;
  entityId?: string;
}

export const FILE_DROP_ENTITY_ATTRIBUTE = "data-file-drop-entity";

/// What an element marked as a drop zone says a drop on it does.
export function readDropZone(element: Element | null): DropZone | null {
  const spaceId = element?.getAttribute(FILE_DROP_ATTRIBUTE);
  if (!element || !spaceId) return null;
  const entityId = element.getAttribute(FILE_DROP_ENTITY_ATTRIBUTE);
  return entityId ? { spaceId, entityId } : { spaceId };
}

/// Files and bookmarks are what gets attached, so they have no attachments of their own.
const NOT_ATTACHABLE = new Set(["file", "bookmark", "view"]);

async function attachTarget(entityId: string | undefined): Promise<string | null> {
  if (!entityId) return null;
  try {
    const entity = await getEntity(entityId);
    return NOT_ATTACHABLE.has(entity.type) ? null : entity.id;
  } catch {
    return null;
  }
}

/// Stores each dropped file in the Space and attaches it to the page it landed on. One file
/// that fails does not stop the rest, and a file that was stored stays stored if attaching it
/// fails.
export async function importDroppedFiles(client: QueryClient, files: File[], zone: DropZone) {
  const attachTo = await attachTarget(zone.entityId);
  const stored: FileEntity[] = [];
  const failed: string[] = [];
  let unattached = 0;
  for (const file of files) {
    try {
      const imported = await importFileFromBytes(
        zone.spaceId,
        file.name,
        new Uint8Array(await file.arrayBuffer()),
      );
      stored.push(imported);
      if (attachTo) {
        await createRelationship(attachTo, imported.entity.id, "attached-file").catch(() => {
          unattached += 1;
        });
      }
    } catch {
      failed.push(file.name);
    }
  }
  const keys = [
    qk.files.bySpace(zone.spaceId),
    qk.entities.bySpace(zone.spaceId),
    ...(attachTo ? [qk.relationships.of(attachTo)] : []),
  ];
  await Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));
  report(stored, failed, unattached, attachTo !== null);
}

function report(stored: FileEntity[], failed: string[], unattached: number, attached: boolean) {
  const [first] = stored;
  if (first) {
    const verb = attached ? "Attached" : "Imported";
    const what = stored.length === 1 ? first.entity.title : `${stored.length} files`;
    notify.success(`${verb} ${what}`, stored.length === 1 ? { entity: first.entity } : undefined);
  }
  if (unattached > 0) {
    notify.error(`Couldn't attach ${unattached === 1 ? "a file" : `${unattached} files`}`, {
      description: "They were imported. Attach them by hand.",
    });
  }
  if (failed.length > 0) {
    notify.error(`Couldn't import ${failed.join(", ")}`, {
      description: "Folders can't be dropped. Try the files inside.",
    });
  }
}
