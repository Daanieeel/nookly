import {
  IconChevronRight,
  IconDownload,
  IconExternalLink,
  IconFileImport,
} from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ReactNode } from "react";
import {
  FieldError,
  StatusButtonContent,
  StatusIcon,
  statusOf,
  useActionStatus,
} from "#/components/action-feedback.tsx";
import { Button } from "@nookly/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { importFile } from "#/lib/api/files.ts";
import { type MoodleFile, moodleFilePath, moodleOpenFile } from "#/lib/api/moodle.ts";
import { qk } from "#/lib/query-keys.ts";
import { cn } from "@nookly/ui/lib/utils";
import { formatShortDate } from "#/lib/datetime.ts";
import { messageOf } from "./moodle-login.ts";
import { fileSize, fileTypeLabel } from "./moodle-format.ts";
import { type Look, fileLook } from "./moodle-icons.tsx";

/// A row of the course: a tile, a title, a line of facts under it, and one click to open it.
/// Buttons for other things go in `trailing`, beside the row rather than inside it.
export function ItemRow({
  look,
  title,
  facts,
  onOpen,
  trailing,
  className,
}: {
  look: Look;
  title: string;
  facts: (string | false | null | undefined)[];
  onOpen: (event: React.MouseEvent) => void;
  trailing?: ReactNode;
  className?: string;
}) {
  const Glyph = look.icon;
  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-xl pr-1.5 transition-colors hover:bg-accent/60",
        className,
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 text-left focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onOpen}
      >
        <span
          aria-hidden="true"
          className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", look.tone)}
        >
          <Glyph size={20} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{title}</span>
          <span className="truncate text-xs text-muted-foreground">
            {facts.filter(Boolean).join(" · ")}
          </span>
        </span>
        <IconChevronRight
          size={16}
          aria-hidden="true"
          className="shrink-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
        />
      </button>
      {trailing}
    </div>
  );
}

/// What a file says about itself: its type, size, name when the title isn't it, and when it
/// last changed.
export function fileFacts(file: MoodleFile, title?: string): string[] {
  return [
    file.kind === "url" ? "Link" : fileTypeLabel(file.fileName),
    file.kind !== "url" && file.fileSize > 0 && fileSize(file.fileSize),
    title !== undefined && title !== file.fileName && file.fileName,
    file.timeModified > 0 && formatShortDate(new Date(file.timeModified * 1000)),
  ].filter((fact): fact is string => typeof fact === "string");
}

/// Opening a file with the system's app (a link in the browser), with its state in place.
export function useOpenFile(file: MoodleFile) {
  const isLink = file.kind === "url";
  const open = useMutation({
    mutationFn: () => (isLink ? openUrl(file.fileUrl) : moodleOpenFile(file)),
  });
  return { open, isLink, label: isLink ? "Open Link" : "Download and Open" };
}

export function OpenFileButton({ opening }: { opening: ReturnType<typeof useOpenFile> }) {
  const { open, isLink, label } = opening;
  return (
    <>
      <StatusIcon
        status={statusOf(open) === "success" ? "idle" : statusOf(open)}
        idle={null}
        size={14}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label={label}
            disabled={open.isPending}
            onClick={() => open.mutate()}
          >
            {isLink ? <IconExternalLink size={14} /> : <IconDownload size={14} />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </>
  );
}

/// Copying a file of the course into a Space of Nookly as a File of its own: it comes down from
/// Moodle first if it hasn't. Links are not files and are left out.
export function useImportFile(file: MoodleFile, spaceId: string | undefined) {
  const queryClient = useQueryClient();
  const importing = useMutation({
    mutationFn: async () => {
      if (spaceId === undefined) throw new Error("Open this from a Space to import it.");
      return importFile(spaceId, await moodleFilePath(file));
    },
    onSuccess: () =>
      spaceId === undefined
        ? undefined
        : Promise.all([
            queryClient.invalidateQueries({ queryKey: qk.files.bySpace(spaceId) }),
            queryClient.invalidateQueries({ queryKey: qk.entities.bySpace(spaceId) }),
          ]),
  });
  const status = useActionStatus(importing);
  return { importing, status, available: spaceId !== undefined && file.kind !== "url" };
}

/// The button that imports a file into Nookly, showing in place how it went.
export function ImportFileButton({ state }: { state: ReturnType<typeof useImportFile> }) {
  const { importing, status, available } = state;
  if (!available) return null;
  const label = status === "success" ? "Imported into Nookly" : "Import into Nookly";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="iconSm"
          aria-label={label}
          disabled={importing.isPending}
          onClick={() => importing.mutate()}
        >
          <StatusIcon status={status} idle={<IconFileImport size={14} />} size={14} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/// The same actions as labelled buttons, for a place with room for words.
export function ImportFileAction({ state }: { state: ReturnType<typeof useImportFile> }) {
  const { importing, status, available } = state;
  if (!available) return null;
  return (
    <Button
      variant="secondary"
      size="sm"
      className="w-full justify-start"
      disabled={importing.isPending}
      onClick={() => importing.mutate()}
    >
      <StatusButtonContent
        status={status}
        icon={<IconFileImport />}
        label="Import into Nookly"
        successLabel="Imported into Nookly"
        errorLabel="Couldn't import, try again"
      />
    </Button>
  );
}

export function OpenFileAction({ opening }: { opening: ReturnType<typeof useOpenFile> }) {
  const { open, isLink } = opening;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start"
      disabled={open.isPending}
      onClick={() => open.mutate()}
    >
      <StatusButtonContent
        status={statusOf(open) === "success" ? "idle" : statusOf(open)}
        icon={isLink ? <IconExternalLink /> : <IconDownload />}
        label={isLink ? "Open link in browser" : "Download"}
        errorLabel="Couldn't open, try again"
      />
    </Button>
  );
}

/// The files and links of an item outside the course's own page, an assignment or a post. A
/// file downloads once and opens with the system's app for it; a link goes to the browser.
export function MoodleFiles({ files, spaceId }: { files: MoodleFile[]; spaceId?: string }) {
  const shown = files.filter((f) => f.fileUrl && (f.kind !== "content" || f.fileName));
  if (shown.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1">
      {shown.map((file) => (
        <FileRow
          key={`${file.filePath}${file.fileName}${file.fileUrl}`}
          file={file}
          spaceId={spaceId}
        />
      ))}
    </ul>
  );
}

function FileRow({ file, spaceId }: { file: MoodleFile; spaceId?: string }) {
  const opening = useOpenFile(file);
  const importing = useImportFile(file, spaceId);
  const { open } = opening;
  return (
    <li className="flex flex-col gap-1">
      <ItemRow
        className="border border-border bg-background"
        look={fileLook(file.kind, file.fileName)}
        title={file.fileName || file.fileUrl}
        facts={fileFacts(file)}
        onOpen={() => open.mutate()}
        trailing={
          <>
            <ImportFileButton state={importing} />
            <OpenFileButton opening={opening} />
          </>
        }
      />
      <FieldError message={open.isError && messageOf(open.error)} />
      <FieldError message={importing.importing.isError && messageOf(importing.importing.error)} />
    </li>
  );
}
