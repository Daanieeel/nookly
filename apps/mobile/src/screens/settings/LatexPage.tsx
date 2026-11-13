import {
  type MacroEntry,
  formatMacro,
  macroArgumentCount,
  macroEntries,
  parseLatexMacros,
  serializeLatexMacros,
} from "@nookly/shared/latex";
import { IconPlus, IconTrash } from "@tabler/icons-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { phoneSettings, useSettingJson } from "../../data/settings.ts";
import { mathProblem } from "../../editor/math.ts";
import { Button, IconButton } from "../../ui/Button.tsx";
import { Field } from "../../ui/Field.tsx";
import { FormSection } from "../../ui/kit/Form.tsx";
import { GroupedSection } from "../../ui/kit/GroupedSection.tsx";
import { Label } from "../../ui/kit/Label.tsx";
import { useSemantic } from "../../ui/kit/scheme.ts";
import { MathPreview } from "../../ui/math/MathPreview.tsx";
import { useMenu } from "../../ui/menu.tsx";
import { Segmented } from "../../ui/Segmented.tsx";
import { Sheet } from "../../ui/sheet/Sheet.tsx";
import { GUTTER, RADIUS, SPACE } from "../../ui/tokens.ts";
import { Text } from "../../ui/Text.tsx";
import { useTheme } from "../../ui/theme.ts";
import { SettingRow } from "./SettingRow.tsx";

/// Placeholders for the arguments of a command in its preview: `\abs{x}`, `\pair{x}{y}`.
const SAMPLE_ARGUMENTS = ["x", "y", "z", "a", "b", "c", "d", "e", "f"];

/// The command applied to sample arguments, the way a formula would use it.
function sampleUse(name: string, args: number): string {
  return `${name}${SAMPLE_ARGUMENTS.slice(0, args)
    .map((a) => `{${a}}`)
    .join("")}`;
}

function argumentsText(count: number): string {
  if (count === 0) return "No arguments";
  return `${count} argument${count === 1 ? "" : "s"}`;
}

/// What is wrong with the macro being typed, or null when it can be saved: the desktop's
/// checks, word for word.
function problemWith(name: string, body: string, others: readonly MacroEntry[]): string | null {
  if (name && !/^[A-Za-z]+$/.test(name)) {
    return "A command name is letters only, like N or abs.";
  }
  if (name && others.some((o) => o.name === `\\${name}`)) return `\\${name} is already defined.`;
  if (name && body.trim()) {
    const parsed = parseLatexMacros(formatMacro(`\\${name}`, body.trim()));
    if (parsed.errors[0]) return parsed.errors[0].message;
    const args = macroArgumentCount(body);
    const error = mathProblem(sampleUse(`\\${name}`, args), { [`\\${name}`]: body.trim() });
    if (error) return `Invalid LaTeX: ${error}`;
  }
  return null;
}

/// The command used on sample arguments, on a quiet surface, as the desktop's preview.
function PreviewBox({ entry }: { entry: MacroEntry }) {
  const fill = useSemantic("fill");
  return (
    <View
      style={{
        borderRadius: RADIUS.control,
        borderCurve: "continuous",
        backgroundColor: fill,
        paddingHorizontal: SPACE.md,
        paddingVertical: SPACE.sm,
      }}
    >
      <MathPreview
        latex={sampleUse(entry.name, entry.args)}
        macros={{ [entry.name]: entry.body }}
      />
    </View>
  );
}

/// One macro: its command, how many arguments it takes, what it stands for and what it
/// draws. A tap edits it; the bin deletes it after asking.
function MacroRow({
  entry,
  locked,
  onEdit,
  onDelete,
}: {
  entry: MacroEntry;
  locked: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: SPACE.sm,
        paddingLeft: GUTTER,
        paddingRight: SPACE.sm,
        paddingVertical: SPACE.md,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${entry.name}`}
        disabled={locked}
        onPress={onEdit}
        style={{ flex: 1, gap: SPACE.sm }}
      >
        <View className="gap-0.5">
          <View className="flex-row items-baseline gap-2">
            <Text className="font-mono font-medium">{entry.name}</Text>
            <Text variant="small" tone="muted">
              {argumentsText(entry.args)}
            </Text>
          </View>
          <Text variant="small" tone="muted" className="font-mono" numberOfLines={2}>
            {entry.body}
          </Text>
        </View>
        <PreviewBox entry={entry} />
      </Pressable>
      {locked ? null : (
        <IconButton
          label={`Delete ${entry.name}`}
          icon={<IconTrash size={20} color={theme.colors.destructive} />}
          onPress={onDelete}
        />
      )}
    </View>
  );
}

/// The form for one macro, in a sheet: its name, its definition and a live test of the
/// command. A pasted `\newcommand` fills both in.
function MacroForm({
  initial,
  others,
  onSave,
  onCancel,
}: {
  initial: MacroEntry | null;
  others: readonly MacroEntry[];
  onSave: (entry: MacroEntry) => void;
  onCancel: () => void;
}) {
  const fill = useSemantic("fill");
  const [name, setName] = useState(initial?.name.replace(/^\\/, "") ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const args = macroArgumentCount(body);
  const valid = /^[A-Za-z]+$/.test(name);
  const use = valid && body.trim() ? sampleUse(`\\${name}`, args) : "";
  const problem = problemWith(name, body, others);
  const canSave = name !== "" && body.trim() !== "" && problem === null;

  /// A pasted `\newcommand{...}` fills in the name and the definition.
  const fillFrom = (pasted: string) => {
    const [entry, ...rest] = macroEntries(parseLatexMacros(pasted).macros);
    if (!entry || rest.length > 0) return false;
    setName(entry.name.replace(/^\\/, ""));
    setBody(entry.body);
    return true;
  };

  return (
    <View className="gap-4">
      <FormSection>
        <Field
          label="Command name"
          placeholder="abs"
          value={name}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          style={{ fontFamily: "Menlo" }}
          onChangeText={(text) => {
            if (!fillFrom(text)) setName(text.replace(/^\\+/, ""));
          }}
        />
        <Field
          label="Definition"
          placeholder="\left|#1\right| for one argument"
          value={body}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          style={{ fontFamily: "Menlo" }}
          onChangeText={(text) => {
            if (!(text.includes("\\newcommand") && fillFrom(text))) setBody(text);
          }}
        />
      </FormSection>
      <View className="flex-row justify-between gap-3" style={{ paddingHorizontal: SPACE.xs }}>
        <Text variant="small" tone="muted">
          {argumentsText(args)}
        </Text>
        <Text variant="small" tone="muted" style={{ flexShrink: 1, textAlign: "right" }}>
          Use #1, #2 and so on for the arguments.
        </Text>
      </View>
      <View
        accessibilityRole="summary"
        accessibilityLabel="Preview"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: SPACE.md,
          minHeight: 52,
          borderRadius: RADIUS.control,
          borderCurve: "continuous",
          backgroundColor: fill,
          paddingHorizontal: SPACE.md,
          paddingVertical: SPACE.sm,
        }}
      >
        <Text variant="small" tone="muted" className="font-mono">
          {use || "\\command{x}"}
        </Text>
        <Text tone="muted">=</Text>
        <View style={{ flex: 1 }}>
          {use && !problem ? (
            <MathPreview latex={use} macros={{ [`\\${name}`]: body.trim() }} />
          ) : null}
        </View>
      </View>
      {problem ? (
        <Text variant="small" tone="destructive" accessibilityRole="alert">
          {problem}
        </Text>
      ) : null}
      <View className="gap-3">
        <Button
          label="Save Macro"
          size="lg"
          disabled={!canSave}
          onPress={() => onSave({ name: `\\${name}`, body: body.trim(), args })}
        />
        <Button label="Cancel" variant="ghost" size="lg" onPress={onCancel} />
      </View>
    </View>
  );
}

/// The LaTeX macros of every formula in every Space, as the desktop's list: each command
/// with what it draws, added and edited in a sheet; or raw, as the text the setting is. A
/// text with lines that do not parse is read only here, since writing it back would drop
/// them.
export function LatexPage() {
  const theme = useTheme();
  const menu = useMenu();
  const text = String(useSettingJson("notes.latexMacros"));
  const [mode, setMode] = useState<"list" | "raw">("list");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [open, setOpen] = useState(false);
  const parsed = parseLatexMacros(text);
  const entries = macroEntries(parsed.macros);
  const broken = parsed.errors.length > 0;
  const hasComments = /^\s*%/m.test(text);
  const write = (next: MacroEntry[]) =>
    phoneSettings.setJson("notes.latexMacros", serializeLatexMacros(next));

  const edit = (target: string | "new") => {
    setEditing(target);
    setOpen(true);
  };
  const save = (entry: MacroEntry) => {
    if (editing === "new" || editing === null) write([...entries, entry]);
    else write(entries.map((e) => (e.name === editing ? entry : e)));
    setOpen(false);
  };
  const confirmDelete = (entry: MacroEntry) =>
    menu.confirm({
      title: `Delete ${entry.name}?`,
      description:
        "Formulas that use it show an error until it is defined again. This cannot be undone.",
      actions: [
        {
          label: "Delete",
          destructive: true,
          onPress: () => write(entries.filter((e) => e.name !== entry.name)),
        },
      ],
    });
  const initial = editing && editing !== "new" ? entries.find((e) => e.name === editing) : null;

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
          <Button
            label="Add Macro"
            size="lg"
            disabled={broken}
            icon={<IconPlus size={18} color={theme.colors.primaryForeground} />}
            onPress={() => edit("new")}
          />
          {broken ? (
            <View
              accessibilityRole="alert"
              className="gap-2"
              style={{
                borderRadius: RADIUS.section,
                borderCurve: "continuous",
                padding: SPACE.md,
                backgroundColor: `${theme.colors.destructive}1A`,
              }}
            >
              {parsed.errors.map((e) => (
                <Text key={`${e.line}-${e.message}`} variant="small" tone="destructive">
                  Line {e.line}: {e.message}
                </Text>
              ))}
              <Text variant="small" tone="muted">
                The list is read only until these are fixed.
              </Text>
              <View className="items-start">
                <Button label="Fix in Raw" variant="secondary" onPress={() => setMode("raw")} />
              </View>
            </View>
          ) : null}
          {!broken && hasComments ? (
            <Text variant="small" tone="muted">
              Comments in the raw text are dropped when you edit the list.
            </Text>
          ) : null}
          <GroupedSection
            title="Macros"
            margin={0}
            footer="Your own LaTeX commands, for every math block and inline formula in every Space."
          >
            {entries.length === 0 ? (
              <Label color="secondaryLabel" style={{ padding: GUTTER }}>
                No macros yet. Add one to use it in every formula.
              </Label>
            ) : null}
            {entries.map((entry) => (
              <MacroRow
                key={entry.name}
                entry={entry}
                locked={broken}
                onEdit={() => edit(entry.name)}
                onDelete={() => confirmDelete(entry)}
              />
            ))}
          </GroupedSection>
        </>
      )}
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={initial ? `Edit ${initial.name}` : "New Macro"}
      >
        {open ? (
          <MacroForm
            key={editing ?? "none"}
            initial={initial ?? null}
            others={entries.filter((e) => e.name !== initial?.name)}
            onSave={save}
            onCancel={() => setOpen(false)}
          />
        ) : null}
      </Sheet>
    </View>
  );
}
