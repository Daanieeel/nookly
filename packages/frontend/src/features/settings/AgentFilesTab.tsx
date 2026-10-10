import { IconFile, IconFolderOpen, IconPlus, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@nookly/ui/components/alert-dialog";
import { Button } from "@nookly/ui/components/button";
import { CopyButton } from "@nookly/ui/components/copy-button";
import { Textarea } from "@nookly/ui/components/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import {
  FieldError,
  StatusButtonContent,
  statusOf,
  useActionStatus,
} from "#/components/action-feedback.tsx";
import { ConfirmPermanentDialog } from "#/components/confirm-permanent-dialog.tsx";
import {
  AGENT_ENTRY_FILE,
  agentDirPath,
  deleteAgentFile,
  listAgentFiles,
  readAgentFile,
  revealAgentDir,
  writeAgentFile,
} from "#/lib/api/agent-files.ts";
import { qk } from "#/lib/query-keys.ts";
import { NewAgentFileDialog } from "./NewAgentFileDialog.tsx";

/// The Agent tab of Settings: the folder to hand to a coding agent and the markdown
/// files in it, edited in place. Plain file management, no AI.
export function AgentFilesTab() {
  const queryClient = useQueryClient();
  const { data: dir } = useQuery({ queryKey: qk.agentFiles.dir, queryFn: agentDirPath });
  const { data: files = [] } = useQuery({ queryKey: qk.agentFiles.list, queryFn: listAgentFiles });
  const [selected, setSelected] = useState(AGENT_ENTRY_FILE);
  // The text being typed; null while it is the file's own text.
  const [draft, setDraft] = useState<string | null>(null);
  // A file chosen while the open one has unsaved changes, waiting for the user's answer.
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: saved, isError: readFailed } = useQuery({
    queryKey: qk.agentFiles.file(selected),
    queryFn: () => readAgentFile(selected),
  });
  const text = draft ?? saved ?? "";
  const dirty = draft !== null && draft !== saved;

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.agentFiles.list }),
      queryClient.invalidateQueries({ queryKey: qk.agentFiles.file(selected) }),
    ]);

  const save = useMutation({
    mutationFn: () => writeAgentFile(selected, text),
    onSuccess: async () => {
      await refresh();
      setDraft(null);
    },
  });
  const saveStatus = useActionStatus(save);

  const remove = useMutation({
    mutationFn: () => deleteAgentFile(selected),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.agentFiles.list });
      queryClient.removeQueries({ queryKey: qk.agentFiles.file(selected) });
      setDeleting(false);
      setDraft(null);
      setSelected(AGENT_ENTRY_FILE);
    },
  });

  const reveal = useMutation({ mutationFn: revealAgentDir });

  const select = (name: string) => {
    if (name === selected) return;
    if (dirty) setSwitchTo(name);
    else {
      setSelected(name);
      setDraft(null);
    }
  };
  const goTo = (name: string) => {
    setSwitchTo(null);
    setSelected(name);
    setDraft(null);
  };

  // Leaves the Settings dialog with nothing half typed carried into the next visit.
  useEffect(() => () => setDraft(null), []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
        <code className="min-w-0 flex-1 truncate font-mono text-xs" title={dir}>
          {dir ?? "…"}
        </code>
        <Tooltip>
          <TooltipTrigger asChild>
            <CopyButton
              value={dir ?? ""}
              aria-label="Copy Folder Path"
              className="flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-accent"
            />
          </TooltipTrigger>
          <TooltipContent>Copy Folder Path</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label="Reveal Folder"
              onClick={() => !reveal.isPending && reveal.mutate()}
            >
              <IconFolderOpen size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reveal Folder</TooltipContent>
        </Tooltip>
      </div>
      <FieldError message={reveal.isError && "Couldn't open the folder."} />

      <div className="flex min-h-72 gap-3">
        <div className="flex w-48 shrink-0 flex-col gap-0.5">
          {files.map((file) => (
            <button
              key={file.name}
              type="button"
              aria-current={file.name === selected ? "true" : undefined}
              onClick={() => select(file.name)}
              className={cn(
                "flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                file.name === selected ? "bg-accent font-medium" : "hover:bg-accent/60",
              )}
            >
              <IconFile size={14} className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
            </button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 justify-start gap-2"
            onClick={() => setCreating(true)}
          >
            <IconPlus size={14} />
            New File
          </Button>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Textarea
            aria-label="File content"
            spellCheck={false}
            value={text}
            readOnly={readFailed}
            onChange={(event) => setDraft(event.target.value)}
            className="min-h-64 flex-1 font-mono text-xs/relaxed"
          />
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={!dirty && saveStatus === "idle"}
              onClick={() => dirty && !save.isPending && save.mutate()}
            >
              <StatusButtonContent
                status={saveStatus}
                label="Save"
                successLabel="Saved"
                errorLabel="Couldn't save, try again"
              />
            </Button>
            {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
            {selected !== AGENT_ENTRY_FILE && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto size-7"
                    aria-label="Delete File"
                    onClick={() => setDeleting(true)}
                  >
                    <IconTrash size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete File</TooltipContent>
              </Tooltip>
            )}
          </div>
          <FieldError message={readFailed && `Couldn't read ${selected}.`} />
        </div>
      </div>

      <NewAgentFileDialog
        open={creating}
        onOpenChange={setCreating}
        existing={files.map((f) => f.name)}
        onCreated={(name) => {
          void queryClient.invalidateQueries({ queryKey: qk.agentFiles.list });
          goTo(name);
        }}
      />

      <ConfirmPermanentDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={
          <>
            Delete <code className="rounded bg-muted px-1 py-0.5 font-mono">{selected}</code>?
          </>
        }
        description="The file leaves this list and is kept in the .trash folder inside your agent folder. Your coding agent will no longer see it."
        actionLabel="Delete File"
        errorLabel="Couldn't delete, try again"
        status={statusOf(remove)}
        error={remove.isError && "Couldn't delete the file."}
        onConfirm={() => !remove.isPending && remove.mutate()}
      />

      <AlertDialog open={switchTo !== null} onOpenChange={(open) => !open && setSwitchTo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes in {selected}</AlertDialogTitle>
            <AlertDialogDescription>
              Your unsaved changes will be lost if you switch to another file now.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction variant="secondary" onClick={() => switchTo && goTo(switchTo)}>
              Discard
            </AlertDialogAction>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                const target = switchTo;
                if (!target) return;
                save.mutate(undefined, { onSuccess: () => goTo(target) });
              }}
            >
              Save and Switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
