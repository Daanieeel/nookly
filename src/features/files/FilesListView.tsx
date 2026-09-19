import { IconExternalLink, IconUpload } from "@tabler/icons-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { EntityIcon } from "@/components/entity-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createFileLink, importFile, listFiles } from "@/lib/api/files";

export function FilesListView({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");

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
  const addLink = useMutation({
    mutationFn: () => createFileLink(spaceId, linkTitle || linkUrl, linkUrl),
    onSuccess: () => {
      invalidate();
      setLinkUrl("");
      setLinkTitle("");
    },
  });

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-lg font-semibold">Files</h1>

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
            Copies into Nookly's own storage — the original stays untouched.
          </span>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Title (optional)"
            value={linkTitle}
            onChange={(e) => setLinkTitle(e.target.value)}
            className="h-9 w-40"
          />
          <Input
            placeholder="Google Drive / Dropbox / iCloud / any URL"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            className="h-9"
          />
          <Button size="sm" disabled={!linkUrl.trim()} onClick={() => addLink.mutate()}>
            Link
          </Button>
        </div>
      </div>

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
                className="text-muted-foreground hover:text-foreground"
              >
                <IconExternalLink size={14} />
              </a>
            )}
          </div>
        ))}
        {files.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">No files yet.</p>
        )}
      </div>
    </div>
  );
}
