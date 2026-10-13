import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@nookly/ui/components/button";
import { CopyButton } from "@nookly/ui/components/copy-button";
import { Input } from "@nookly/ui/components/input";
import {
  PageTabs,
  PageTabsBar,
  PageTabsContent,
  PageTabsList,
  PageTabsTrigger,
} from "@nookly/ui/components/page-tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { ConfirmPermanentDialog } from "#/components/confirm-permanent-dialog.tsx";
import { renderMath } from "#/features/notes/math.ts";
import {
  formatMacro,
  macroArgumentCount,
  macroEntries,
  type MacroEntry,
  parseLatexMacros,
  serializeLatexMacros,
} from "#/lib/latex-macros.ts";
import { useSetting } from "#/lib/settings/settings.ts";
import { LatexMacrosControl } from "./setting-controls";

/// Placeholders for the arguments of a command in its preview: `\abs{x}`, `\pair{x}{y}`.
const SAMPLE_ARGUMENTS = ["x", "y", "z", "a", "b", "c", "d", "e", "f"];

/// The command applied to sample arguments, the way a formula would use it.
function sampleUse(name: string, args: number): string {
  return `${name}${SAMPLE_ARGUMENTS.slice(0, args)
    .map((a) => `{${a}}`)
    .join("")}`;
}

/// A formula drawn with KaTeX, reporting what is wrong with it instead of throwing.
function useFormula(latex: string, definitions: Record<string, string>) {
  const ref = useRef<HTMLSpanElement>(null);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(definitions);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setError(latex ? renderMath(latex, element, false, definitions) : null);
    // `definitions` is compared by its text, so a new object each render does not redraw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latex, key]);
  return { ref, error };
}

function Preview({ entry }: { entry: MacroEntry }) {
  const { ref, error } = useFormula(sampleUse(entry.name, entry.args), {
    [entry.name]: entry.body,
  });
  return (
    <span className="flex min-w-0 items-center justify-end overflow-x-auto text-sm">
      <span ref={ref} className={cn(error && "hidden")} />
      {error && <span className="text-xs text-muted-foreground">No preview</span>}
    </span>
  );
}

function argumentsText(count: number): string {
  if (count === 0) return "No arguments";
  return `${count} argument${count === 1 ? "" : "s"}`;
}

/// What is wrong with the macro being typed, or null when it can be saved.
function problemWith(
  name: string,
  body: string,
  others: readonly MacroEntry[],
  previewError: string | null,
): string | null {
  if (name && !/^[A-Za-z]+$/.test(name)) {
    return "A command name is letters only, like N or abs.";
  }
  if (name && others.some((o) => o.name === `\\${name}`)) return `\\${name} is already defined.`;
  if (name && body.trim()) {
    const parsed = parseLatexMacros(formatMacro(`\\${name}`, body.trim()));
    if (parsed.errors[0]) return parsed.errors[0].message;
    if (previewError) return `Invalid LaTeX: ${previewError}`;
  }
  return null;
}

/// The form for one macro: its name, its definition and a live test of the command.
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
  const [name, setName] = useState(initial?.name.replace(/^\\/, "") ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const args = macroArgumentCount(body);
  const use = name && /^[A-Za-z]+$/.test(name) && body.trim() ? sampleUse(`\\${name}`, args) : "";
  const { ref, error } = useFormula(use, use ? { [`\\${name}`]: body.trim() } : {});
  const problem = problemWith(name, body, others, error);
  const canSave = name !== "" && body.trim() !== "" && problem === null;

  /// A pasted `\newcommand{...}` fills in the name and the definition.
  function fillFrom(pasted: string): boolean {
    const [entry, ...rest] = macroEntries(parseLatexMacros(pasted).macros);
    if (!entry || rest.length > 0) return false;
    setName(entry.name.replace(/^\\/, ""));
    setBody(entry.body);
    return true;
  }

  return (
    <form
      aria-label={initial ? `Edit ${initial.name}` : "New macro"}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) onSave({ name: `\\${name}`, body: body.trim(), args });
      }}
    >
      <div className="grid grid-cols-[10rem_1fr] gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Command
          <span className="relative">
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 font-mono text-sm text-muted-foreground"
            >
              \
            </span>
            <Input
              aria-label="Command name"
              className="pl-6 font-mono"
              value={name}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => setName(event.target.value.replace(/^\\+/, ""))}
              onPaste={(event) => {
                if (fillFrom(event.clipboardData.getData("text"))) event.preventDefault();
              }}
            />
          </span>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Definition
          <Input
            aria-label="Definition"
            className="font-mono"
            value={body}
            spellCheck={false}
            autoComplete="off"
            placeholder="\mathbb{N}, or \left|#1\right| for one argument"
            onChange={(event) => setBody(event.target.value)}
            onPaste={(event) => {
              if (fillFrom(event.clipboardData.getData("text"))) event.preventDefault();
            }}
          />
        </label>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{argumentsText(args)}</span>
        <span>Use #1, #2 and so on for the arguments.</span>
      </div>
      <div
        role="group"
        aria-label="Preview"
        className="flex min-h-9 items-center gap-3 rounded-md bg-muted/40 px-3 py-1.5 text-sm"
      >
        <code className="font-mono text-xs text-muted-foreground">{use || "\\command{x}"}</code>
        <span aria-hidden className="text-muted-foreground">
          =
        </span>
        <span ref={ref} className={cn(!use && "hidden")} />
      </div>
      {problem && (
        <p role="alert" className="text-xs text-destructive">
          {problem}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="secondary" size="sm" disabled={!canSave}>
          Save macro
        </Button>
      </div>
    </form>
  );
}

function IconAction({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="iconSm"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

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
  return (
    <li className="grid grid-cols-[8rem_1fr_9rem_auto] items-center gap-3 border-b border-border/60 py-2 last:border-b-0">
      <span className="flex min-w-0 flex-col">
        <code data-macro-name className="truncate font-mono text-sm font-medium">
          {entry.name}
        </code>
        <span className="text-xs text-muted-foreground">{argumentsText(entry.args)}</span>
      </span>
      <code className="min-w-0 truncate font-mono text-xs text-muted-foreground" title={entry.body}>
        {entry.body}
      </code>
      <Preview entry={entry} />
      <span className="flex items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <CopyButton
              value={formatMacro(entry.name, entry.body)}
              aria-label={`Copy ${entry.name}`}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            />
          </TooltipTrigger>
          <TooltipContent>Copy definition</TooltipContent>
        </Tooltip>
        <IconAction label={`Edit ${entry.name}`} disabled={locked} onClick={onEdit}>
          <IconPencil />
        </IconAction>
        <IconAction label={`Delete ${entry.name}`} disabled={locked} onClick={onDelete}>
          <IconTrash />
        </IconAction>
      </span>
    </li>
  );
}

/// The user's LaTeX macros as a list of commands, each with a live preview, instead of one text
/// to get right. The setting is still the one text (`notes.latexMacros`); the list reads it and
/// writes it back as one `\newcommand` per line. A text with lines that do not parse is shown
/// read only here, with where they are, since writing it back would drop them: the raw view edits
/// the text itself.
export function LatexMacrosPanel() {
  const [text, setText] = useSetting("notes.latexMacros");
  const [mode, setMode] = useState<"list" | "raw">("list");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [deleting, setDeleting] = useState<MacroEntry | null>(null);
  const [query, setQuery] = useState("");
  const parsed = useMemo(() => parseLatexMacros(text), [text]);
  const entries = useMemo(() => macroEntries(parsed.macros), [parsed]);
  const broken = parsed.errors.length > 0;
  const hasComments = /^\s*%/m.test(text);

  const write = (next: MacroEntry[]) => setText(serializeLatexMacros(next));
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? entries.filter(
        (e) => e.name.toLowerCase().includes(needle) || e.body.toLowerCase().includes(needle),
      )
    : entries;

  function save(entry: MacroEntry) {
    if (editing === "new" || editing === null) write([...entries, entry]);
    else write(entries.map((e) => (e.name === editing ? entry : e)));
    setEditing(null);
  }

  return (
    <PageTabs
      value={mode}
      onValueChange={(next) => {
        setMode(next === "raw" ? "raw" : "list");
        setEditing(null);
      }}
      className="w-full"
    >
      <PageTabsBar>
        <PageTabsList aria-label="View">
          <PageTabsTrigger value="list">List</PageTabsTrigger>
          <PageTabsTrigger value="raw">Raw</PageTabsTrigger>
        </PageTabsList>
        {mode === "list" && (
          <Button
            variant="default"
            size="sm"
            className="mb-1 h-7 shrink-0"
            disabled={broken}
            onClick={() => setEditing("new")}
          >
            <IconPlus />
            Add macro
          </Button>
        )}
      </PageTabsBar>

      <PageTabsContent value="raw">
        <LatexMacrosControl />
      </PageTabsContent>
      <PageTabsContent value="list" className="flex flex-col gap-3">
        <>
          {broken && (
            <div role="alert" className="flex flex-col gap-1.5 rounded-md bg-destructive/10 p-3">
              <ul className="flex flex-col gap-0.5 text-xs text-destructive">
                {parsed.errors.map((error) => (
                  <li key={`${error.line}-${error.message}`}>
                    Line {error.line}: {error.message}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                The list is read only until these are fixed.
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="w-fit"
                onClick={() => setMode("raw")}
              >
                Fix in the raw view
              </Button>
            </div>
          )}
          {!broken && hasComments && (
            <p className="text-xs text-muted-foreground">
              Comments in the raw text are dropped when you edit the list.
            </p>
          )}
          {editing === "new" && (
            <MacroForm
              initial={null}
              others={entries}
              onSave={save}
              onCancel={() => setEditing(null)}
            />
          )}
          {entries.length > 5 && (
            <Input
              type="search"
              aria-label="Search macros"
              placeholder="Search macros"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          )}
          {entries.length === 0 && editing !== "new" && !broken && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No macros yet. Add one to use it in every formula.
            </p>
          )}
          {entries.length > 0 && shown.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No macro matches “{query.trim()}”.
            </p>
          )}
          {shown.length > 0 && (
            <ul className="flex flex-col">
              {shown.map((entry) =>
                editing === entry.name ? (
                  <li key={entry.name} className="py-2">
                    <MacroForm
                      initial={entry}
                      others={entries.filter((e) => e.name !== entry.name)}
                      onSave={save}
                      onCancel={() => setEditing(null)}
                    />
                  </li>
                ) : (
                  <MacroRow
                    key={entry.name}
                    entry={entry}
                    locked={broken}
                    onEdit={() => setEditing(entry.name)}
                    onDelete={() => setDeleting(entry)}
                  />
                ),
              )}
            </ul>
          )}
        </>
      </PageTabsContent>

      <ConfirmPermanentDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "this macro"}?`}
        description="Formulas that use it show an error until it is defined again. This cannot be undone."
        actionLabel="Delete"
        errorLabel="Couldn't delete the macro, try again"
        status="idle"
        onConfirm={() => {
          if (deleting) write(entries.filter((e) => e.name !== deleting.name));
          setDeleting(null);
        }}
      />
    </PageTabs>
  );
}
