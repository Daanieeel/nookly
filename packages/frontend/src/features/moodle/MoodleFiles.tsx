import { IconChevronRight, IconDownload, IconExternalLink } from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ReactNode } from "react";
import {
  FieldError,
  StatusButtonContent,
  StatusIcon,
  statusOf,
} from "#/components/action-feedback.tsx";
import { Button } from "@nookly/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { type MoodleFile, moodleOpenFile } from "#/lib/api/moodle.ts";
import { cn } from "@nookly/ui/lib/utils";
import { messageOf } from "./moodle-login.ts";
import { fileFacts } from "./moodle-format.ts";
import { type Look, fileLook } from "./moodle-icons.tsx";
import {
  type ImportContext,
  ImportFileButton,
  ImportFileDialog,
  useImportFile,
} from "./MoodleImport.tsx";

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
export function MoodleFiles({
  files,
  spaceId,
  context,
}: {
  files: MoodleFile[];
  spaceId?: string;
  /// Where the files sit in the course, to suggest how to import them.
  context: ImportContext;
}) {
  const shown = files.filter((f) => f.fileUrl && (f.kind !== "content" || f.fileName));
  if (shown.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1">
      {shown.map((file) => (
        <FileRow
          key={`${file.filePath}${file.fileName}${file.fileUrl}`}
          file={file}
          spaceId={spaceId}
          context={context}
        />
      ))}
    </ul>
  );
}

function FileRow({
  file,
  spaceId,
  context,
}: {
  file: MoodleFile;
  spaceId?: string;
  context: ImportContext;
}) {
  const opening = useOpenFile(file);
  const importing = useImportFile(file, spaceId, context);
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
      <ImportFileDialog state={importing} />
    </li>
  );
}
