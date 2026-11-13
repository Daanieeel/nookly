import {
  type MacroEntry,
  formatMacro,
  macroEntries,
  parseLatexMacros,
  serializeLatexMacros,
} from "@nookly/shared/latex";
import { IconTrash } from "@tabler/icons-react-native";
import { useState } from "react";
import { View } from "react-native";
import { phoneSettings, useSettingJson } from "../../data/settings.ts";
import { Button, IconButton } from "../../ui/Button.tsx";
import { Field } from "../../ui/Field.tsx";
import { FormSection } from "../../ui/kit/Form.tsx";
import { GroupedSection } from "../../ui/kit/GroupedSection.tsx";
import { Label } from "../../ui/kit/Label.tsx";
import { Segmented } from "../../ui/Segmented.tsx";
import { GUTTER, SPACE } from "../../ui/tokens.ts";
import { Text } from "../../ui/Text.tsx";
import { useTheme } from "../../ui/theme.ts";
import { SettingRow } from "./SettingRow.tsx";
import { UiIcon } from "../../ui/kit/UiIcon.tsx";

/// One macro of the list: its command, how many arguments it takes and what it stands for.
function MacroRow({ entry, onRemove }: { entry: MacroEntry; onRemove: () => void }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: SPACE.md,
        paddingLeft: GUTTER,
        paddingRight: SPACE.sm,
        paddingVertical: SPACE.sm,
      }}
    >
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-baseline gap-2">
          <Text className="font-mono font-medium">{entry.name}</Text>
          <Text variant="small" tone="muted">
            {entry.args === 0
              ? "no arguments"
              : `${entry.args} ${entry.args === 1 ? "argument" : "arguments"}`}
          </Text>
        </View>
        <Text variant="small" tone="muted" className="font-mono">
          {entry.body}
        </Text>
      </View>
      <IconButton
        label={`Remove ${entry.name}`}
        icon={<UiIcon icon={IconTrash} size={18} color={theme.colors.destructive} />}
        onPress={onRemove}
      />
    </View>
  );
}

/// The LaTeX macros of every formula in every Space, as the desktop's list: the command, its
/// arguments and its definition, with Add macro; or raw, as the text the setting is.
export function LatexPage() {
  const text = String(useSettingJson("notes.latexMacros"));
  const [mode, setMode] = useState<"list" | "raw">("list");
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | undefined>();
  const parsed = parseLatexMacros(text);
  const entries = macroEntries(parsed.macros);
  const save = (next: MacroEntry[]) =>
    phoneSettings.setJson("notes.latexMacros", serializeLatexMacros(next));
  const add = () => {
    const command = name.trim().startsWith("\\") ? name.trim() : `\\${name.trim()}`;
    if (!/^\\[A-Za-z]+$/.test(command)) {
      setError("A command is a backslash and letters, like \\abs.");
      return;
    }
    if (!body.trim()) {
      setError("Say what it stands for.");
      return;
    }
    const rest = entries.filter((e) => e.name !== command);
    // The line is checked the way the editor reads it before it is kept.
    if (parseLatexMacros(formatMacro(command, body.trim())).errors.length > 0) {
      setError("That definition isn't valid LaTeX.");
      return;
    }
    save([...rest, { name: command, body: body.trim(), args: 0 }]);
    setName("");
    setBody("");
    setError(undefined);
  };
  return (
    <View className="gap-4">
      <Segmented
        label="View"
        value={mode}
        options={[
          { value: "list", label: "List" },
          { value: "raw", label: "Raw" },
        ]}
        onChange={setMode}
      />
      {mode === "raw" ? (
        <GroupedSection margin={0}>
          <SettingRow id="notes.latexMacros" />
        </GroupedSection>
      ) : (
        <>
          <GroupedSection
            title="Macros"
            margin={0}
            footer="Your own LaTeX commands, for every math block and inline formula in every Space."
          >
            {entries.length === 0 ? (
              <Label color="secondaryLabel" style={{ padding: GUTTER }}>
                No macros yet.
              </Label>
            ) : null}
            {entries.map((entry) => (
              <MacroRow
                key={entry.name}
                entry={entry}
                onRemove={() => save(entries.filter((e) => e.name !== entry.name))}
              />
            ))}
          </GroupedSection>
          {parsed.errors.length > 0 ? (
            <Text variant="small" tone="destructive">
              {parsed.errors.map((e) => `Line ${e.line}: ${e.message}`).join("\n")}
            </Text>
          ) : null}
          <FormSection title="Add macro">
            <Field
              label="Command"
              placeholder="\abs"
              value={name}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setName}
            />
            <Field
              label="Definition"
              placeholder="\left|#1\right|"
              value={body}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setBody}
              error={error}
            />
          </FormSection>
          <View style={{ alignItems: "flex-start" }}>
            <Button label="Add Macro" variant="secondary" onPress={add} />
          </View>
        </>
      )}
    </View>
  );
}
