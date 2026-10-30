import { IconExternalLink } from "@tabler/icons-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { EmptyState } from "#/components/empty-state.tsx";
import { Button } from "@nookly/ui/components/button";
import type { MoodleModule, MoodleSection } from "#/lib/api/moodle.ts";
import { IconBook2 } from "@tabler/icons-react";
import { Loading, useMoodleNavigate } from "./MoodleFrame.tsx";
import { MoodleFiles } from "./MoodleFiles.tsx";
import { MoodleHtml } from "./MoodleHtml.tsx";
import { hasMoodleText } from "./moodle-html.ts";
import { coursePath, pagePath } from "./moodle-path.ts";
import { useMoodleContents } from "./moodle-queries.ts";

/// Course items Nookly shows itself, with the tab that shows them. Anything else (a quiz, a
/// workshop) is listed with a link to its page on Moodle.
const TAB_FOR_MODULE = new Map<string, "assignments" | "forums">([
  ["assign", "assignments"],
  ["forum", "forums"],
]);

/// Whether a section has anything to show; Moodle sends empty ones.
export function sectionHasContent(section: MoodleSection): boolean {
  return section.modules.length > 0 || hasMoodleText(section.summary);
}

export function CourseContents({ spaceId, courseId }: { spaceId: string; courseId: number }) {
  const query = useMoodleContents(courseId);
  if (!query.data) return <Loading query={query} />;
  const sections = query.data.data.filter(sectionHasContent);
  if (sections.length === 0) {
    return (
      <EmptyState
        icon={IconBook2}
        title="Nothing in this course yet"
        description="Sections, files and links your teachers add show up here."
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <section key={section.id} className="flex flex-col gap-2">
          {section.name && <h2 className="text-sm font-semibold">{section.name}</h2>}
          {hasMoodleText(section.summary) && <MoodleHtml html={section.summary} />}
          <ul className="flex flex-col gap-3">
            {section.modules.map((module) => (
              <ModuleItem key={module.id} spaceId={spaceId} courseId={courseId} module={module} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ModuleItem({
  spaceId,
  courseId,
  module,
}: {
  spaceId: string;
  courseId: number;
  module: MoodleModule;
}) {
  const go = useMoodleNavigate(spaceId);
  const tab = TAB_FOR_MODULE.get(module.modName);
  const isPage = module.modName === "page";
  // A link's address is shown as a file row; labels have only a description.
  const files = module.modName === "label" ? [] : module.contents;
  return (
    <li className="flex flex-col gap-1.5">
      {module.modName !== "label" && (
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{module.name}</span>
          {tab && (
            <Button variant="ghost" size="sm" onClick={(e) => go(coursePath(courseId, tab), e)}>
              {tab === "assignments" ? "Open Assignments" : "Open Forums"}
            </Button>
          )}
          {isPage && (
            <Button variant="ghost" size="sm" onClick={(e) => go(pagePath(courseId, module.id), e)}>
              Read
            </Button>
          )}
          {!tab && !isPage && module.url && !files.some((f) => f.fileUrl) && (
            <Button variant="ghost" size="sm" onClick={() => void openUrl(module.url)}>
              <IconExternalLink size={14} />
              Open in Moodle
            </Button>
          )}
        </div>
      )}
      {hasMoodleText(module.description) && <MoodleHtml html={module.description} />}
      {!isPage && <MoodleFiles files={files} />}
    </li>
  );
}
