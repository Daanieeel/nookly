import { IconFilePlus, IconFolderOpen, IconFolderPlus, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
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
  StatusIcon,
  statusOf,
  statusTextClass,
  useActionStatus,
} from "#/components/action-feedback.tsx";
import { MiddleEllipsis } from "#/components/middle-ellipsis.tsx";
import { ConfirmPermanentDialog } from "#/components/confirm-permanent-dialog.tsx";
import {
  AGENT_ENTRY_FILE,
  AGENT_MAX_DEPTH,
  agentDepth,
  agentDirPath,
  agentParent,
  deleteAgentFile,
  deleteAgentFolder,
  isStandardAgentFile,
  listAgentFiles,
  listAgentFolders,
  readAgentFile,
  revealAgentDir,
  writeAgentFile,
} from "#/lib/api/agent-files.ts";
import { qk } from "#/lib/query-keys.ts";
import { AgentFileTree, buildAgentTree } from "./AgentFileTree.tsx";
import { NewAgentFileDialog } from "./NewAgentFileDialog.tsx";

/// The Agent tab of Settings: the folder to hand to a coding agent and the markdown
/// files in it, in a vertical explorer with folders, edited in place next to it. Plain file management, no AI. A file is saved when the
/// cursor leaves its text, when another file is opened and when Settings closes.
export function AgentFilesTab() {
  const queryClient = useQueryClient();
  const { data: dir } = useQuery({
    queryKey: qk.agentFiles.dir,
    queryFn: agentDirPath,
  });
  const { data: files = [] } = useQuery({
    queryKey: qk.agentFiles.list,
    queryFn: listAgentFiles,
  });
  const [selected, setSelected] = useState(AGENT_ENTRY_FILE);
  // The text being typed; null while it is the file's own text.
  const [draft, setDraft] = useState<string | null>(null);
  // A file chosen while the open one could not be saved, waiting for the user's answer.
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const { data: folders = [] } = useQuery({
    queryKey: qk.agentFiles.folders,
    queryFn: listAgentFolders,
  });
  const [creating, setCreating] = useState<"file" | "folder" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null);
  // Folders that are open in the explorer, and the one new entries are made in.
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [activeFolder, setActiveFolder] = useState("");
  const tree = useMemo(() => buildAgentTree(files, folders), [files, folders]);

  const { data: saved, isError: readFailed } = useQuery({
    queryKey: qk.agentFiles.file(selected),
    queryFn: () => readAgentFile(selected),
  });
  const text = draft ?? saved ?? "";
  const dirty = draft !== null && draft !== saved;

  const refreshTree = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.agentFiles.list }),
      queryClient.invalidateQueries({ queryKey: qk.agentFiles.folders }),
    ]);
  const refresh = () =>
    Promise.all([
      refreshTree(),
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

  // Leaving the text and clicking another file happen back to back; they share one write.
  const writing = useRef<Promise<boolean> | null>(null);
  function persist(): Promise<boolean> {
    if (writing.current) return writing.current;
    if (!dirty) return Promise.resolve(true);
    const run = save
      .mutateAsync()
      .then(
        () => true,
        () => false,
      )
      .finally(() => {
        writing.current = null;
      });
    writing.current = run;
    return run;
  }

  // Closing Settings with the cursor still in the text saves it too.
  const latest = useRef({ selected, text, dirty });
  latest.current = { selected, text, dirty };
  useEffect(
    () => () => {
      const { selected: name, text: content, dirty: unsaved } = latest.current;
      if (unsaved && !writing.current) void writeAgentFile(name, content).catch(() => undefined);
    },
    [],
  );

  const remove = useMutation({
    mutationFn: () => deleteAgentFile(selected),
    onSuccess: async () => {
      await refreshTree();
      queryClient.removeQueries({ queryKey: qk.agentFiles.file(selected) });
      setDeleting(false);
      goTo(AGENT_ENTRY_FILE);
    },
  });

  // Moves the folder to the trash. An open file inside it is saved first and closes.
  const removeFolder = useMutation({
    mutationFn: async (path: string) => {
      const inside = selected.startsWith(`${path}/`);
      if (inside && !(await persist())) throw new Error("unsaved");
      await deleteAgentFolder(path);
      return inside;
    },
    onSuccess: async (inside, path) => {
      await refreshTree();
      if (inside) {
        queryClient.removeQueries({ queryKey: qk.agentFiles.file(selected) });
        goTo(AGENT_ENTRY_FILE);
      } else if (activeFolder === path || activeFolder.startsWith(`${path}/`)) {
        setActiveFolder(agentParent(path));
      }
      setDeletingFolder(null);
    },
  });

  const reveal = useMutation({ mutationFn: revealAgentDir });

  function goTo(name: string) {
    setSwitchTo(null);
    setSelected(name);
    const parent = agentParent(name);
    setActiveFolder(parent);
    // Show where the file is: every folder above it opens.
    if (parent) {
      setOpen((now) => {
        const next = new Set(now);
        for (let at = parent; at; at = agentParent(at)) next.add(at);
        return next;
      });
    }
    setDraft(null);
    save.reset();
  }
  const select = (name: string) => {
    if (name === selected) return;
    if (!dirty) goTo(name);
    else void persist().then((ok) => (ok ? goTo(name) : setSwitchTo(name)));
  };
  const toggleFolder = (path: string) => {
    setActiveFolder(path);
    setOpen((now) => {
      const next = new Set(now);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  };
  const canMakeFolder = agentDepth(activeFolder) + 1 < AGENT_MAX_DEPTH;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
        <MiddleEllipsis text={dir ?? "…"} className="flex-1 font-mono text-xs" />
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

      <div className="flex min-w-0 gap-3">
        <div className="flex h-96 max-h-[50vh] min-h-64 w-56 shrink-0 flex-col rounded-md border border-border">
          <div className="flex items-center gap-0.5 border-b border-border p-1">
            <span className="min-w-0 flex-1 truncate px-1.5 text-xs text-muted-foreground">
              {activeFolder ? `In ${activeFolder}` : "Files"}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label="New File"
                  onClick={() => setCreating("file")}
                >
                  <IconFilePlus size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New File</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label="New Folder"
                  disabled={!canMakeFolder}
                  onClick={() => setCreating("folder")}
                >
                  <IconFolderPlus size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New Folder</TooltipContent>
            </Tooltip>
          </div>
          <AgentFileTree
            nodes={tree}
            selected={selected}
            activeFolder={activeFolder}
            open={open}
            onOpenFile={select}
            onToggleFolder={toggleFolder}
            onDeleteFolder={setDeletingFolder}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Textarea
            aria-label="File content"
            spellCheck={false}
            value={text}
            readOnly={readFailed}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => void persist()}
            className="h-96 max-h-[50vh] min-h-64 font-mono text-xs/relaxed"
          />
          <div className="flex min-h-7 items-center gap-2 text-xs">
            <span
              aria-live="polite"
              className={cn("flex items-center gap-1.5", statusTextClass(saveStatus))}
            >
              <StatusIcon status={saveStatus} idle={null} size={13} />
              {saveStatus === "pending" && "Saving…"}
              {saveStatus === "success" && "Saved"}
              {saveStatus === "error" && "Couldn't save. Click out of the text to try again."}
            </span>
            {!isStandardAgentFile(selected) && (
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
        open={creating !== null}
        onOpenChange={(next) => !next && setCreating(null)}
        kind={creating ?? "file"}
        parent={activeFolder}
        existing={[...files.map((f) => f.name), ...folders]}
        onCreated={(path) => {
          void refreshTree();
          if (creating === "folder") {
            setOpen((now) => new Set(now).add(path));
            setActiveFolder(path);
          } else goTo(path);
        }}
      />

      <ConfirmPermanentDialog
        open={deletingFolder !== null}
        onOpenChange={(next) => {
          if (!next) {
            setDeletingFolder(null);
            removeFolder.reset();
          }
        }}
        title={
          <>
            Delete <code className="rounded bg-muted px-1 py-0.5 font-mono">{deletingFolder}</code>?
          </>
        }
        description="The folder and every file in it leave this list and are kept in the .trash folder inside your agent folder. Your coding agent will no longer see them."
        actionLabel="Delete Folder"
        errorLabel="Couldn't delete, try again"
        status={statusOf(removeFolder)}
        error={removeFolder.isError && "Couldn't delete the folder."}
        onConfirm={() =>
          deletingFolder && !removeFolder.isPending && removeFolder.mutate(deletingFolder)
        }
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
            <AlertDialogTitle>Couldn't save {selected}</AlertDialogTitle>
            <AlertDialogDescription>
              Your changes could not be written. Keep editing to try again, or discard them and open
              the other file.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction variant="secondary" onClick={() => switchTo && goTo(switchTo)}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
