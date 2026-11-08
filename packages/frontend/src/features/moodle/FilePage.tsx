import { IconExternalLink, IconFileOff } from "@tabler/icons-react";
import { useMemo } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SkeletonBox } from "skullet/react";
import { FieldError } from "#/components/action-feedback.tsx";
import { CrashFallback, ErrorBoundary } from "#/components/error-boundary.tsx";
import { RightSidebarFrame } from "#/components/right-sidebar.tsx";
import { Button } from "@nookly/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { LINK_KIND, fileKindOfName } from "#/features/files/file-kind.ts";
import {
  FileViewer as RealFileViewer,
  PlaceholderActionsContext,
} from "#/features/files/FileDetailView.tsx";
import type { FileEntity } from "#/lib/api/types.ts";
import type { MoodleFile } from "#/lib/api/moodle.ts";
import { formatDate } from "#/lib/datetime.ts";
import { useCourseName } from "./CoursePage.tsx";
import { OpenFileAction, OpenFileButton, useOpenFile } from "./MoodleFiles.tsx";
import {
  ImportFileAction,
  ImportFileButton,
  ImportFileDialog,
  useImportFile,
} from "./MoodleImport.tsx";
import { useMoodleNavigate } from "./MoodleFrame.tsx";
import { MoodleEmpty, MoodleError } from "./MoodleStates.tsx";
import { MoodleWebUrlContext } from "./moodle-context.ts";
import { fileSize } from "./moodle-format.ts";
import { fileLook } from "./moodle-icons.tsx";
import { messageOf } from "./moodle-login.ts";
import { coursePath, moodleWebUrl } from "./moodle-path.ts";
import { useMoodleContents, useMoodleLocalFile } from "./moodle-queries.ts";

/// A file of a course item, read in Nookly the way a File of the Space is: the file fills the
/// page, and what there is to know about it and to do with it sits in the right sidebar. A PDF,
/// a picture, a video or a recording shows right here, anything else says so and hands over to
/// the system's app for it. The file comes down from Moodle the first time and stays on this
/// computer.
export function FilePage({
  spaceId,
  siteUrl,
  courseId,
  cmid,
  index,
}: {
  spaceId: string;
  siteUrl: string;
  courseId: number;
  cmid: number;
  index: number;
}) {
  const contents = useMoodleContents(courseId);
  const courseName = useCourseName(courseId);
  const go = useMoodleNavigate(spaceId);
  const section = contents.data?.data.find((s) => s.modules.some((m) => m.id === cmid));
  const module = section?.modules.find((m) => m.id === cmid);
  const file = module?.contents[index];
  const local = useMoodleLocalFile(file);
  const single = module !== undefined && module.contents.length === 1;
  const title = (single ? module.name : file?.fileName) || module?.name || "File";
  const webUrl = moodleWebUrl(siteUrl, { page: "file", courseId, cmid, index });
  const look = fileLook(file?.kind ?? "file", file?.fileName ?? "");
  const Glyph = look.icon;
  return (
    <MoodleWebUrlContext.Provider value={webUrl}>
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 min-w-0 flex-1">
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-clip">
            <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-md",
                  look.tone,
                )}
              >
                <Glyph size={15} />
              </span>
              <h1 className="min-w-0 truncate font-heading text-base font-medium">{title}</h1>
              <button
                type="button"
                className="min-w-0 shrink-0 truncate rounded-sm text-xs text-muted-foreground hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                onClick={(e) => go(coursePath(courseId), e)}
              >
                in {courseName}
              </button>
            </div>
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
              {contents.data && !file ? (
                <MoodleEmpty
                  className="m-4"
                  icon={IconFileOff}
                  title="This file is gone"
                  description="Moodle no longer lists it in this course."
                />
              ) : contents.isError || local.isError ? (
                <MoodleError
                  className="m-4"
                  message={(local.error ?? contents.error)?.message ?? "Something went wrong."}
                  retrying={local.isFetching || contents.isFetching}
                  onRetry={() => void (local.isError ? local.refetch() : contents.refetch())}
                />
              ) : file && local.data ? (
                // Straight in the page, with nothing wrapped around it, so it can fill it.
                <ErrorBoundary
                  resetKeys={[cmid, index, local.data]}
                  fallback={(reset) => <CrashFallback reset={reset} what="this file" />}
                >
                  <FileViewer file={file} path={local.data} spaceId={spaceId} />
                </ErrorBoundary>
              ) : (
                <div
                  role="status"
                  aria-label="Getting the file from Moodle"
                  className="size-full p-4"
                >
                  <SkeletonBox width="100%" height="100%" radius="0.75rem" />
                </div>
              )}
            </div>
          </div>
          {file && (
            <FileSidebar
              file={file}
              spaceId={spaceId}
              webUrl={webUrl}
              courseId={courseId}
              courseName={courseName}
              sectionName={section?.name}
              itemName={module?.name ?? title}
              single={single}
              onCourse={(e) => go(coursePath(courseId), e)}
            />
          )}
        </div>
      </div>
    </MoodleWebUrlContext.Provider>
  );
}

/// What there is to know about the file, and what to do with it besides reading it.
function FileSidebar({
  file,
  spaceId,
  webUrl,
  courseId,
  courseName,
  sectionName,
  itemName,
  single,
  onCourse,
}: {
  file: MoodleFile;
  spaceId: string;
  webUrl: string;
  courseId: number;
  courseName: string;
  sectionName?: string;
  itemName: string;
  /// Whether the file is the whole item, so the item's name names it.
  single: boolean;
  onCourse: (event: React.MouseEvent) => void;
}) {
  const importing = useImportFile(file, spaceId, {
    courseId,
    sectionName,
    itemName: single ? itemName : undefined,
  });
  const opening = useOpenFile(file);
  const kind = file.kind === "url" ? LINK_KIND : fileKindOfName(file.fileName);
  // The slim rail of a collapsed sidebar keeps the actions as icons.
  const railActions = (className?: string) => (
    <div className={cn("flex items-center gap-0.5", className)}>
      <ImportFileButton state={importing} />
      <OpenFileButton opening={opening} />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="Open in Moodle"
            onClick={() => void openUrl(webUrl)}
          >
            <IconExternalLink size={14} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Open in Moodle</TooltipContent>
      </Tooltip>
    </div>
  );
  return (
    <>
      <RightSidebarFrame actions={() => null} railActions={railActions}>
        <section aria-label="Actions" className="flex flex-col gap-1.5">
          <ImportFileAction state={importing} />
          <OpenFileAction opening={opening} />
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => void openUrl(webUrl)}
          >
            <IconExternalLink />
            Open in Moodle
          </Button>
          <FieldError message={opening.open.isError && messageOf(opening.open.error)} />
        </section>
        <section aria-label="Properties" className="flex flex-col gap-3">
          <Property label="Kind">
            <kind.icon size={14} className={cn("mt-0.5 shrink-0", kind.tone)} />
            {kind.label}
          </Property>
          <Property label="File name">{file.fileName}</Property>
          {file.fileSize > 0 && <Property label="Size">{fileSize(file.fileSize)}</Property>}
          {file.timeModified > 0 && (
            <Property label="Changed">{formatDate(new Date(file.timeModified * 1000))}</Property>
          )}
          <Property label="Course" onClick={onCourse}>
            {courseName}
          </Property>
          <Property label="Item">{itemName}</Property>
          <Property label="Source">{new URL(webUrl).host}</Property>
        </section>
      </RightSidebarFrame>
      {/* Outside the frame, so it stays when the sidebar folds into its rail. */}
      <ImportFileDialog state={importing} />
    </>
  );
}

/// One fact about the file: its name above, its value under it in full, wrapping to as many
/// lines as it needs. With `onClick` the value is a button.
function Property({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: (event: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="px-2 text-xs text-muted-foreground">{label}</span>
      {onClick ? (
        <button
          type="button"
          className="flex min-h-7 items-start gap-2 rounded-md px-2 py-1 text-left text-sm wrap-anywhere transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onClick}
        >
          {children}
        </button>
      ) : (
        <div className="flex min-h-7 items-start gap-2 px-2 py-1 text-sm wrap-anywhere">
          {children}
        </div>
      )}
    </div>
  );
}

/// The same viewer as for a File of the Space (PDFs, pictures, video and audio, code and text,
/// Markdown, Word and Excel), fed a File that stands for the one on this computer. It is nothing
/// Nookly keeps: it has no place in the Space until it is imported.
function FileViewer({ file, path, spaceId }: { file: MoodleFile; path: string; spaceId: string }) {
  const shown = useMemo(() => standIn(file, path, spaceId), [file, path, spaceId]);
  const openingElsewhere = useOpenFile(file);
  const viewer = (
    <PlaceholderActionsContext.Provider
      value={() => (
        <Button
          variant="secondary"
          size="sm"
          disabled={openingElsewhere.open.isPending}
          onClick={() => openingElsewhere.open.mutate()}
        >
          <IconExternalLink />
          Open with another app
        </Button>
      )}
    >
      <RealFileViewer file={shown} />
    </PlaceholderActionsContext.Provider>
  );
  // A PDF goes edge to edge, without the viewer's own frame; the rest sit in the page's margin,
  // which some of them (Word documents) count on.
  return fileKindOfName(file.fileName).id === "pdf" ? (
    <div className="size-full [&>div]:rounded-none [&>div]:border-0">{viewer}</div>
  ) : (
    <div className="size-full p-4">{viewer}</div>
  );
}

/// A File of the Space for a file of the course, only to be shown: it is stored where the
/// download is and has no place in the database.
function standIn(file: MoodleFile, path: string, spaceId: string): FileEntity {
  return {
    entity: {
      id: `moodle:${path}`,
      spaceId,
      type: "file",
      title: file.fileName,
      icon: null,
      pinned: false,
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
      key: "",
    },
    localPath: path,
    provider: null,
    url: null,
    originalFilename: file.fileName,
    sourcePath: null,
    reference: null,
    origin: null,
    needsReindex: false,
    labelIds: [],
    indexedContent: null,
  };
}
