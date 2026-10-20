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
import { Chip, ChipGroup } from "../../ui/Chips.tsx";
import { Field } from "../../ui/Field.tsx";
import { ROW_DIVIDER, Section } from "../../ui/Row.tsx";
import { Text } from "../../ui/Text.tsx";
import { useTheme } from "../../ui/theme.ts";
import { cn } from "../../ui/classes.ts";
import { SettingRow } from "./SettingRow.tsx";

/// One macro of the list: its command, how many arguments it takes and what it stands for.
function MacroRow({ entry, onRemove }: { entry: MacroEntry; onRemove: () => void }) {
  const theme = useTheme();
  return (
    <View className={cn("flex-row items-center gap-3 p-3", ROW_DIVIDER)}>
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
        icon={<IconTrash size={18} color={theme.colors.destructive} />}
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
      <ChipGroup label="View">
        <Chip label="List" selected={mode === "list"} onPress={() => setMode("list")} />
        <Chip label="Raw" selected={mode === "raw"} onPress={() => setMode("raw")} />
      </ChipGroup>
      {mode === "raw" ? (
        <Section>
          <SettingRow id="notes.latexMacros" />
        </Section>
      ) : (
        <>
          <Text variant="small" tone="muted">
            Your own LaTeX commands, for every math block and inline formula in every Space.
          </Text>
          <Section title="Macros">
            {entries.length === 0 ? (
              <Text tone="muted" className="p-4">
                No macros yet.
              </Text>
            ) : null}
            {entries.map((entry) => (
              <View key={entry.name}>
                <MacroRow
                  entry={entry}
                  onRemove={() => save(entries.filter((e) => e.name !== entry.name))}
                />
              </View>
            ))}
          </Section>
          {parsed.errors.length > 0 ? (
            <Text variant="small" tone="destructive">
              {parsed.errors.map((e) => `Line ${e.line}: ${e.message}`).join("\n")}
            </Text>
          ) : null}
          <Section title="Add macro">
            <View className="gap-3 p-3">
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
              <View className="items-start">
                <Button label="Add Macro" variant="secondary" onPress={add} />
              </View>
            </View>
          </Section>
        </>
      )}
    </View>
  );
}
