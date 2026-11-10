import { IconFileExport } from "@tabler/icons-react";
import { save } from "@tauri-apps/plugin-dialog";
import { FeedbackMenuItem } from "#/components/feedback-menu-item.tsx";
import { notify } from "#/components/notify.tsx";
import { exportEntityJson } from "#/lib/api/portable.ts";
import type { Entity } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { NOOKLY_FILE_FILTER } from "#/features/notes/import-page.ts";

/// What the file of a type is called in a menu: a note or a jot is a "Page".
const NOUNS = new Map([
  ["note", "Page"],
  ["jot", "Page"],
  ["task", "Task"],
  ["index_card_deck", "Deck"],
  ["assignment", "Assignment"],
]);

export function nooklyFileNoun(entityType: string): string {
  return NOUNS.get(entityType) ?? "File";
}

function fileBaseName(entity: Entity): string {
  const base = displayTitle(entity)
    .replace(/[\\/:*?"<>|]/g, "")
    .trim();
  return base || "Untitled";
}

/// The label of the export item: "Export as Nookly Page (.json)", or Task, Deck, Assignment.
export function nooklyFileLabel(entityType: string): string {
  return `Export as Nookly ${nooklyFileNoun(entityType)} (.json)`;
}

/// Asks where to save the entity as a Nookly file and writes it. Resolves `false` when the
/// user cancels the native save dialog. What belongs to this instance does not go in the file,
/// but the files its blocks show do; a warning names the ones that could not go in.
export async function saveNooklyFile(entity: Entity): Promise<boolean> {
  const path = await save({
    defaultPath: `${fileBaseName(entity)}.nookly.json`,
    filters: [NOOKLY_FILE_FILTER],
  });
  if (!path) return false;
  const left = (await exportEntityJson(entity.id, path)) ?? [];
  if (left.length > 0) {
    notify.warning(
      left.length === 1
        ? "1 file could not be included"
        : `${left.length} files could not be included`,
      {
        description: `${left.join(", ")} became text because the file is missing or unreadable.`,
      },
    );
  }
  return true;
}

/// A menu item that saves the entity as a Nookly file. The native save dialog can't carry
/// feedback, so the item (which opened it) does.
export function SaveNooklyFileItem({ entity, onDone }: { entity: Entity; onDone: () => void }) {
  return (
    <FeedbackMenuItem
      icon={<IconFileExport size={14} className="text-muted-foreground" />}
      label={nooklyFileLabel(entity.type)}
      successLabel={`Nookly ${nooklyFileNoun(entity.type).toLowerCase()} saved`}
      errorLabel="Couldn't save file, try again"
      action={() => saveNooklyFile(entity)}
      onDone={onDone}
    />
  );
}
