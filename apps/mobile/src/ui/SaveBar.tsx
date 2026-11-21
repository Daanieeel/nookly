import { IconDeviceFloppy, IconStack2 } from "@tabler/icons-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button } from "./Button.tsx";
import { Field } from "./Field.tsx";
import { Floating } from "./floating.tsx";
import { FloatingBar } from "./floating-bar.tsx";
import { PASTE_BAR_ROOM } from "./FloatingField.tsx";
import { haptic } from "./haptics.ts";
import { useSemanticPair } from "./kit/scheme.ts";
import { Sheet } from "./sheet/Sheet.tsx";
import { SPACE } from "./tokens.ts";

/// How long the bar stays after saving, to say so.
const LINGER = 1200;

/// The desktop's save bar (`ViewSaveBar`) on the phone: once a page's filters or display
/// change, a bar floats at the bottom of the screen, as wide as its buttons, with Discard,
/// Save as View (only where the page has Views) and Save. Saving keeps the
/// change as what the page opens with, or in the View it shows. It stays a moment after
/// saving to say so. `above` lifts it over a paste bar. Put it at the end of the page: it keeps
/// room there for itself while it shows.
export function SaveBar({
  dirty,
  onDiscard,
  onSave,
  onSaveAsView,
  above = 0,
}: {
  dirty: boolean;
  onDiscard: () => void;
  onSave: () => void | Promise<void>;
  /// Makes a new View of what is shown, named; a page without Views leaves it out.
  onSaveAsView?: (name: string) => Promise<void>;
  above?: number;
}) {
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [naming, setNaming] = useState(false);
  const [saving, setSaving] = useState(false);
  const mark = useSemanticPair("label");
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), LINGER);
    return () => clearTimeout(timer);
  }, [saved]);
  const shown = dirty || saved;
  const save = async () => {
    setFailed(false);
    setSaving(true);
    try {
      await onSave();
      haptic("success");
      setSaved(true);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      {/* Room at the end of the page, so the bar never covers its last row. */}
      {shown ? <View style={{ height: PASTE_BAR_ROOM }} /> : null}
      <Floating>
        <FloatingBar shown={shown} above={above} testID="save-bar" label="Unsaved changes">
          {dirty ? <Button label="Discard" variant="destructiveGhost" onPress={onDiscard} /> : null}
          {dirty && onSaveAsView ? (
            <Button
              label="Save as View"
              variant="ghost"
              icon={<IconStack2 size={16} color={mark.hex} />}
              onPress={() => setNaming(true)}
            />
          ) : null}
          <Button
            label="Save"
            successLabel="Saved"
            errorLabel="Couldn't Save"
            variant="positive"
            status={saving ? "pending" : failed ? "error" : saved && !dirty ? "success" : "idle"}
            icon={<IconDeviceFloppy size={16} color="#ffffff" />}
            onPress={() => dirty && void save()}
          />
        </FloatingBar>
      </Floating>
      {onSaveAsView ? (
        <NameView open={naming} onOpenChange={setNaming} onSave={onSaveAsView} />
      ) : null}
    </>
  );
}

/// The name of a new View, asked for in a card as the desktop's dialog does.
function NameView({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "pending" | "error">("idle");
  const submit = async () => {
    const title = name.trim();
    if (!title) return;
    setStatus("pending");
    try {
      await onSave(title);
      setName("");
      setStatus("idle");
      onOpenChange(false);
    } catch {
      setStatus("error");
    }
  };
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Save as View"
      presentation="card"
      kind="form"
    >
      <View style={{ gap: SPACE.md }}>
        <Field
          label="View name"
          placeholder="Open work"
          value={name}
          onChangeText={setName}
          autoFocus
        />
        <Button
          label="Save View"
          status={status === "pending" ? "pending" : status === "error" ? "error" : "idle"}
          errorLabel="Couldn't save"
          disabled={name.trim().length === 0}
          onPress={() => void submit()}
        />
      </View>
    </Sheet>
  );
}
