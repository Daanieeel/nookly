import { IconBook2, IconExternalLink } from "@tabler/icons-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { FieldError } from "#/components/action-feedback.tsx";
import { Button } from "@nookly/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import type { MoodleFile, MoodleModule, MoodleSection } from "#/lib/api/moodle.ts";
import { useMoodleNavigate } from "./MoodleFrame.tsx";
import { ItemRow, OpenFileButton, useOpenFile } from "./MoodleFiles.tsx";
import { ImportFileButton, ImportFileDialog, useImportFile } from "./MoodleImport.tsx";
import { MoodleHtml } from "./MoodleHtml.tsx";
import { MoodleData, MoodleEmpty } from "./MoodleStates.tsx";
import { fileFacts, moduleKindLabel, moodleDate } from "./moodle-format.ts";
import { fileLook, moduleLook } from "./moodle-icons.tsx";
import { messageOf } from "./moodle-login.ts";
import { SAMPLE_SECTIONS } from "./moodle-samples.ts";
import { hasMoodleText } from "./moodle-html.ts";
import { assignmentPath, coursePath, filePath, forumPath, pagePath } from "./moodle-path.ts";
import { useMoodleAssignments, useMoodleContents, useMoodleForums } from "./moodle-queries.ts";

/// Whether a section has anything to show; Moodle sends empty ones.
export function sectionHasContent(section: MoodleSection): boolean {
  return section.modules.length > 0 || hasMoodleText(section.summary);
}

export function CourseContents({ spaceId, courseId }: { spaceId: string; courseId: number }) {
  const query = useMoodleContents(courseId);
  return (
    <MoodleData
      query={query}
      sample={SAMPLE_SECTIONS}
      label="Loading the course contents"
      empty={(all) =>
        all.filter(sectionHasContent).length === 0 ? (
          <MoodleEmpty
            icon={IconBook2}
            title="Nothing in this course yet"
            description="Sections, files and links your teachers add show up here."
          />
        ) : null
      }
    >
      {(all) => (
        <div className="flex flex-col gap-4">
          {all.filter(sectionHasContent).map((section, index) => (
            <section
              key={section.id}
              className="overflow-hidden rounded-2xl border border-border bg-card"
            >
              <header className="flex items-center gap-3 border-b border-border px-4 py-3">
                <span
                  aria-hidden="true"
                  className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground tabular-nums"
                >
                  {index + 1}
                </span>
                <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {section.name || (index === 0 ? "General" : `Section ${index + 1}`)}
                </h2>
                {section.modules.length > 0 && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {section.modules.length} {section.modules.length === 1 ? "item" : "items"}
                  </span>
                )}
              </header>
              <div className="flex flex-col gap-3 p-2">
                {hasMoodleText(section.summary) && <MoodleHtml html={section.summary} />}
                <ul className="flex flex-col gap-1">
                  {section.modules.map((module) => (
                    <ModuleItem
                      key={module.id}
                      spaceId={spaceId}
                      courseId={courseId}
                      sectionName={
                        section.name || (index === 0 ? "General" : `Section ${index + 1}`)
                      }
                      module={module}
                    />
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </div>
      )}
    </MoodleData>
  );
}

function ModuleItem({
  spaceId,
  courseId,
  sectionName,
  module,
}: {
  spaceId: string;
  courseId: number;
  sectionName: string;
  module: MoodleModule;
}) {
  const go = useMoodleNavigate(spaceId);
  const description = hasMoodleText(module.description) && (
    <MoodleHtml html={module.description} className="px-2 pb-1 text-muted-foreground" />
  );
  if (module.modName === "label") {
    return description ? <li className="rounded-xl bg-muted/40 p-3">{description}</li> : null;
  }
  const files = module.contents.filter((f) => f.fileUrl && (f.kind !== "content" || f.fileName));
  const kind = moduleKindLabel(module.modName);
  // An assignment or a forum opens on its own page in Nookly.
  if (module.modName === "assign" || module.modName === "forum") {
    return (
      <li className="flex flex-col gap-0.5">
        {module.modName === "assign" ? (
          <AssignmentItem spaceId={spaceId} courseId={courseId} module={module} />
        ) : (
          <ForumItem spaceId={spaceId} courseId={courseId} module={module} />
        )}
        {description}
      </li>
    );
  }
  // A file or a folder of files is read in Nookly.
  if (files.length > 0 && module.modName !== "page") {
    const single = files.length === 1 && module.modName !== "folder";
    return (
      <li className="flex flex-col gap-0.5">
        {!single && (
          <div className="flex items-center gap-3 px-2 pt-1">
            <span className="text-sm font-semibold">{module.name}</span>
            <span className="text-xs text-muted-foreground">
              {kind} · {files.length} files
            </span>
          </div>
        )}
        {files.map((file) => (
          <ContentFile
            key={`${file.filePath}${file.fileName}${file.fileUrl}`}
            spaceId={spaceId}
            courseId={courseId}
            cmid={module.id}
            index={module.contents.indexOf(file)}
            file={file}
            title={single ? module.name : file.fileName}
            sectionName={sectionName}
            itemName={single ? module.name : undefined}
          />
        ))}
        {description}
      </li>
    );
  }
  const look = moduleLook(module.modName);
  return (
    <li className="flex flex-col gap-0.5">
      <ItemRow
        look={look}
        title={module.name}
        facts={[kind]}
        onOpen={(e) => {
          if (module.modName === "page") go(pagePath(courseId, module.id), e);
          else if (module.url) void openUrl(module.url);
        }}
        trailing={
          module.modName !== "page" &&
          module.url && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label="Open in Moodle"
                  onClick={() => void openUrl(module.url)}
                >
                  <IconExternalLink size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open in Moodle</TooltipContent>
            </Tooltip>
          )
        }
      />
      {description}
    </li>
  );
}

/// One file of a course item: a click reads it in Nookly, the button beside it hands it to the
/// system's app for it.
function ContentFile({
  spaceId,
  courseId,
  cmid,
  index,
  file,
  title,
  sectionName,
  itemName,
}: {
  spaceId: string;
  courseId: number;
  cmid: number;
  index: number;
  file: MoodleFile;
  title: string;
  sectionName: string;
  itemName?: string;
}) {
  const go = useMoodleNavigate(spaceId);
  const opening = useOpenFile(file);
  const importing = useImportFile(file, spaceId, {
    courseId,
    sectionName,
    itemName,
  });
  return (
    <div className="flex flex-col gap-1">
      <ItemRow
        look={fileLook(file.kind, file.fileName)}
        title={title}
        facts={fileFacts(file, title)}
        onOpen={(e) => {
          if (opening.isLink) opening.open.mutate();
          else go(filePath(courseId, cmid, index), e, true);
        }}
        trailing={
          <>
            <ImportFileButton state={importing} />
            <OpenFileButton opening={opening} />
          </>
        }
      />
      <FieldError message={opening.open.isError && messageOf(opening.open.error)} />
      <ImportFileDialog state={importing} />
    </div>
  );
}

/// A forum of the course: a click goes to that forum. Until the course's forums are known (or
/// when Moodle won't list them) it goes to their tab.
function ForumItem({
  spaceId,
  courseId,
  module,
}: {
  spaceId: string;
  courseId: number;
  module: MoodleModule;
}) {
  const go = useMoodleNavigate(spaceId);
  const forum = useMoodleForums(courseId).data?.data.find((f) => f.cmid === module.id);
  const discussions = forum?.numDiscussions;
  return (
    <ItemRow
      look={moduleLook("forum")}
      title={module.name}
      facts={[
        forum?.kind === "news" ? "Announcements" : "Forum",
        discussions !== undefined &&
          `${discussions} ${discussions === 1 ? "discussion" : "discussions"}`,
      ]}
      onOpen={(e) => go(forum ? forumPath(courseId, forum.id) : coursePath(courseId, "forums"), e)}
    />
  );
}

/// An assignment of the course: a click goes to that assignment, with its due date on the row.
function AssignmentItem({
  spaceId,
  courseId,
  module,
}: {
  spaceId: string;
  courseId: number;
  module: MoodleModule;
}) {
  const go = useMoodleNavigate(spaceId);
  const assignment = useMoodleAssignments(courseId).data?.data.find((a) => a.cmid === module.id);
  const due = assignment ? moodleDate(assignment.dueDate) : null;
  return (
    <ItemRow
      look={moduleLook("assign")}
      title={module.name}
      facts={["Assignment", due && `Due ${due}`]}
      onOpen={(e) =>
        go(
          assignment
            ? assignmentPath(courseId, assignment.id)
            : coursePath(courseId, "assignments"),
          e,
        )
      }
    />
  );
}
