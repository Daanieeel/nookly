import { type EntityRecord, addFile, attachLabel, relate, renameFile } from "@nookly/shared/data";
import { useState } from "react";
import { View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import { useFile } from "../data/queries.ts";
import { Button, statusOf } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { FormSection } from "../ui/kit/Form.tsx";
import { useScanner } from "../ui/scanner.tsx";
import { Sheet } from "../ui/sheet/Sheet.tsx";
import { useCloseSheet } from "../ui/sheet/route.tsx";
import { Text } from "../ui/Text.tsx";
import { nameOf } from "./file-kinds.ts";
import { LabelsField, LinkTarget } from "./NewScreens.tsx";

/// "Scan 14 Nov 2026": what a scan is called until the person names it.
function scanName(day: Date): string {
  const date = day.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `Scan ${date}`;
}

/// Scans a paper document with the phone's document camera and keeps it in the Space at
/// once, as one PDF, so sync uploads it while the person names it. Resolves to the new
/// File, or null when they back out.
export function useScanDocument(spaceId: string) {
  const scanner = useScanner();
  const scan = useLocalWrite(async (db, _: undefined) => {
    const uri = await scanner.scan();
    if (!uri) return null;
    return addFile(db, spaceId, `${scanName(new Date())}.pdf`, uri);
  });
  return { available: scanner.available, scan };
}

interface Draft {
  /// What the person typed; null keeps the name it was given.
  name: string | null;
  labels: string[];
  link: EntityRecord | null;
}

const EMPTY: Draft = { name: null, labels: [], link: null };

/// What the person sets for a scan they just made: its name, labels and an item to link it
/// to. The File is already kept (and uploading); Save applies the choices to it. The
/// choices live with the sheet, so they stay while a step (Labels, Link to) is open.
function ScanDetails({
  id,
  spaceId,
  draft,
  onChange,
}: {
  id: string;
  spaceId: string;
  draft: Draft;
  onChange: (draft: Draft) => void;
}) {
  const close = useCloseSheet();
  const { data: file } = useFile(id);
  const fallback = file ? nameOf(file).replace(/\.pdf$/i, "") : "";
  const save = useLocalWrite(async (db, _: undefined) => {
    if (draft.name !== null) await renameFile(db, id, draft.name);
    for (const label of draft.labels) await attachLabel(db, id, label);
    if (draft.link) await relate(db, id, draft.link.id);
  });
  return (
    <View className="gap-4">
      <Text variant="small" tone="muted">
        The scan is in your files and uploads while you name it.
      </Text>
      <FormSection>
        <Field
          label="Name"
          value={draft.name ?? fallback}
          onChangeText={(name) => onChange({ ...draft, name })}
          selectTextOnFocus
          returnKeyType="done"
        />
      </FormSection>
      <FormSection>
        <LabelsField
          spaceId={spaceId}
          value={draft.labels}
          onChange={(labels) => onChange({ ...draft, labels })}
        />
        <LinkTarget value={draft.link} onChange={(link) => onChange({ ...draft, link })} />
      </FormSection>
      {save.error ? <Text tone="destructive">{save.error.message}</Text> : null}
      <Button
        label="Save"
        size="lg"
        status={statusOf(save)}
        onPress={() => save.mutate(undefined, { onSuccess: () => close() })}
      />
    </View>
  );
}

/// The sheet after a scan, while `id` is the File just scanned.
export function ScanSheet({
  id,
  spaceId,
  onClose,
}: {
  id: string | null;
  spaceId: string;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  return (
    <Sheet
      open={id !== null}
      onOpenChange={(open) => {
        if (open) return;
        setDraft(EMPTY);
        onClose();
      }}
      title="Scanned Document"
    >
      {id ? <ScanDetails id={id} spaceId={spaceId} draft={draft} onChange={setDraft} /> : null}
    </Sheet>
  );
}
