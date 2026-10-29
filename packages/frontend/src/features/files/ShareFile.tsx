import { IconShare } from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { convertFileSrc } from "@tauri-apps/api/core";
import { StatusIcon, statusOf } from "#/components/action-feedback.tsx";
import { FeedbackMenuItem } from "#/components/feedback-menu-item.tsx";
import { Button } from "@nookly/ui/components/button";
import { DropdownMenuSeparator } from "@nookly/ui/components/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { getFile } from "#/lib/api/files.ts";
import type { Entity } from "#/lib/api/types.ts";
import { qk } from "#/lib/query-keys.ts";
import { filePath } from "./file-kind.ts";
import { readFileForShare, shareFile } from "./share-file.ts";

/// What it takes to share a File: the file read ahead of the click, and the share. `null`
/// while the File loads, and for a link with no file behind it, which has nothing to share.
function useShareFile(entity: Entity) {
  const { data: file } = useQuery({
    queryKey: qk.files.byId(entity.id),
    queryFn: () => getFile(entity.id),
    enabled: entity.type === "file",
  });
  const path = file ? filePath(file) : null;
  const { data: blob, isPending } = useQuery({
    queryKey: qk.files.shareBytes(entity.id, path),
    queryFn: () => readFileForShare(convertFileSrc(path ?? "")),
    enabled: path !== null,
    // The bytes of a big file are only kept while someone can still click share.
    gcTime: 0,
    staleTime: 0,
  });
  if (!file || !path) return null;
  return { ready: !isPending, share: () => shareFile(file, blob ?? null) };
}

/// Top right of a File's detail sidebar: shares the file itself through the system share
/// menu.
export function ShareFileButton({ entity }: { entity: Entity }) {
  const target = useShareFile(entity);
  const share = useMutation({ mutationFn: async () => target?.share() });
  const status = statusOf(share);
  if (!target) return null;
  const label = status === "error" ? "Couldn't share, try again" : "Share File";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          disabled={!target.ready || share.isPending}
          onClick={() => share.mutate()}
        >
          <StatusIcon status={status} idle={<IconShare size={15} />} size={15} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/// The Share entry of a File's more actions menu.
export function ShareFileMenuItem({ entity, onDone }: { entity: Entity; onDone: () => void }) {
  const target = useShareFile(entity);
  if (!target) return null;
  return (
    <>
      <DropdownMenuSeparator />
      <FeedbackMenuItem
        icon={<IconShare size={14} className="text-muted-foreground" />}
        label="Share"
        successLabel="Shared"
        errorLabel="Couldn't share, try again"
        action={async () => (await target.share()) !== "cancelled"}
        onDone={onDone}
      />
    </>
  );
}
