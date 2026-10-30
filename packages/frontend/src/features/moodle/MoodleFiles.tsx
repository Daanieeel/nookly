import { IconDownload, IconExternalLink, IconFile } from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { FieldError, StatusIcon, statusOf } from "#/components/action-feedback.tsx";
import { Button } from "@nookly/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { type MoodleFile, moodleOpenFile } from "#/lib/api/moodle.ts";
import { messageOf } from "./moodle-login.ts";
import { fileSize } from "./moodle-format.ts";

/// The files and links of a course item. A file downloads once and opens with the system's
/// app for it; a link goes to the browser.
export function MoodleFiles({ files }: { files: MoodleFile[] }) {
  const shown = files.filter((f) => f.fileUrl && (f.kind !== "content" || f.fileName));
  if (shown.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1">
      {shown.map((file) => (
        <FileRow key={`${file.filePath}${file.fileName}${file.fileUrl}`} file={file} />
      ))}
    </ul>
  );
}

function FileRow({ file }: { file: MoodleFile }) {
  const isLink = file.kind === "url";
  const open = useMutation({
    mutationFn: () => (isLink ? openUrl(file.fileUrl) : moodleOpenFile(file)),
  });
  const label = isLink ? "Open Link" : "Download and Open";
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
        <IconFile size={16} className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm">{file.fileName || file.fileUrl}</span>
        {!isLink && file.fileSize > 0 && (
          <span className="shrink-0 text-xs text-muted-foreground">{fileSize(file.fileSize)}</span>
        )}
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
      </div>
      <FieldError message={open.isError && messageOf(open.error)} />
    </li>
  );
}
