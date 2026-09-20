import {
  IconExternalLink,
  IconFile,
  IconLayoutGrid,
  IconList,
  IconUpload,
} from "@tabler/icons-react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { EntityIcon } from "@/components/entity-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createFileLink, importFile, listFiles } from "@/lib/api/files";
import { cn } from "@/lib/utils";

/// Grid of file-type tiles is the default (§2.3 Files row) — a bare filename list
/// is the fallback, not the norm. Drag-and-drop onto this view is the primary way
/// to add a file (§3.3 New File); the file picker button is the fallback path.
export function FilesListView({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [isDragOver, setIsDragOver] = useState(false);

  const { data: files = [] } = useQuery({
    queryKey: ["files", spaceId],
    queryFn: () => listFiles(spaceId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["files", spaceId] });

  const pickAndImport = useMutation({
    mutationFn: async () => {
      const selected = await open({ multiple: false, directory: false });
      if (!selected || Array.isArray(selected)) return null;
      return importFile(spaceId, selected);
    },
    onSuccess: invalidate,
  });
  const importPaths = useMutation({
    mutationFn: (paths: string[]) => Promise.all(paths.map((path) => importFile(spaceId, path))),
    onSuccess: invalidate,
  });
  const addLink = useMutation({
    mutationFn: () => createFileLink(spaceId, linkTitle || linkUrl, linkUrl),
    onSuccess: () => {
      invalidate();
      setLinkUrl("");
      setLinkTitle("");
    },
  });

  // Real OS drag-and-drop (§3.3): a browser-level `ondrop`/`dataTransfer.files` only
  // gives synthetic File objects with no filesystem path inside a Tauri webview, so
  // dropped files can't be handed to `importFile` that way. Tauri's own webview-level
  // drag-drop event carries real paths instead.
  useEffect(() => {
    const unlistenPromise = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        setIsDragOver(false);
        if (event.payload.paths.length > 0) importPaths.mutate(event.payload.paths);
      } else if (event.payload.type === "enter" || event.payload.type === "over") {
        setIsDragOver(true);
      } else {
        setIsDragOver(false);
      }
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [spaceId]);

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Files</h1>
        <div className="flex items-center gap-0.5 rounded-md border border-input bg-accent p-0.5">
          <Button
            variant={view === "grid" ? "secondary" : "ghost"}
            size="iconSm"
            aria-label="Grid view"
            onClick={() => setView("grid")}
          >
            <IconLayoutGrid size={14} />
          </Button>
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            size="iconSm"
            aria-label="List view"
            onClick={() => setView("list")}
          >
            <IconList size={14} />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => pickAndImport.mutate()}
          >
            <IconUpload size={14} /> Import a file
          </Button>
          <span className="text-xs text-muted-foreground">
            Or drag files anywhere in this window — they're copied into Nookly's own storage, the
            original stays untouched.
          </span>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Title (optional)"
            value={linkTitle}
            onChange={(e) => setLinkTitle(e.target.value)}
            className="w-40"
          />
          <Input
            placeholder="Google Drive / Dropbox / iCloud / any URL"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            className="flex-1"
          />
          <Button size="sm" disabled={!linkUrl.trim()} onClick={() => addLink.mutate()}>
            Link
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "min-h-32 rounded-lg border border-dashed border-transparent transition-colors",
          isDragOver && "border-primary bg-primary/5",
        )}
      >
        {view === "grid" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {files.map((f) => (
              <div
                key={f.entity.id}
                className="group flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 text-center hover:bg-accent"
              >
                <EntityIcon
                  entity={f.entity}
                  size={32}
                  className="shrink-0 text-muted-foreground"
                />
                <span className="line-clamp-2 w-full min-w-0 text-xs font-medium">
                  {f.entity.title}
                </span>
                <div className="flex min-h-4 items-center gap-1.5">
                  {f.provider && <Badge variant="outline">{f.provider.replace("_", " ")}</Badge>}
                  {f.url && (
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Open link"
                      className="text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                    >
                      <IconExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
            ))}
            {files.length === 0 && (
              <EmptyState
                icon={IconFile}
                title="No files yet"
                description="Import a file or drop it anywhere in this window."
                className="col-span-full"
              />
            )}
          </div>
        ) : (
          <div className="flex flex-col">
            {files.map((f) => (
              <div
                key={f.entity.id}
                className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              >
                <EntityIcon entity={f.entity} className="shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{f.entity.title}</span>
                {f.provider && <Badge variant="outline">{f.provider.replace("_", " ")}</Badge>}
                {f.url && (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open link"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <IconExternalLink size={14} />
                  </a>
                )}
              </div>
            ))}
            {files.length === 0 && (
              <EmptyState
                icon={IconFile}
                title="No files yet"
                description="Import a file or drop it anywhere in this window."
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
