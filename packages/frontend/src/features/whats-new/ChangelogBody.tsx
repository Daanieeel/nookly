import { Fragment, type ReactNode } from "react";

interface Group {
  title: string | null;
  items: { text: string; bullet: boolean }[];
}

/// Splits one version's notes into its `###` groups, each with its bullet points. Text
/// that is not a bullet is kept as a plain line of the group it sits in.
function groupsOf(body: string): Group[] {
  const groups: Group[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const heading = /^#{2,4}\s+(.*)$/.exec(line);
    if (heading?.[1]) {
      groups.push({ title: heading[1], items: [] });
      continue;
    }
    if (groups.length === 0) groups.push({ title: null, items: [] });
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    groups.at(-1)?.items.push({ text: bullet?.[1] ?? line, bullet: bullet !== null });
  }
  return groups;
}

/// `**bold**` and `` `code` `` inside a line, the only inline formatting the notes use.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={index} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

/// One version's notes as groups under quiet headings, drawn by hand instead of through
/// the note editor: it is read once, and has to look the same everywhere.
export function ChangelogBody({ body }: { body: string }) {
  return (
    <div className="flex flex-col gap-5">
      {groupsOf(body).map((group, index) => (
        <section key={`${group.title}-${index}`} className="flex flex-col gap-2">
          {group.title && (
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {group.title}
            </h3>
          )}
          <ul className="flex flex-col gap-1.5 text-sm/relaxed">
            {group.items.map((item, i) => (
              <li key={i} className="flex gap-2">
                {item.bullet && (
                  <span
                    aria-hidden
                    className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground"
                  />
                )}
                <span className="min-w-0">{inline(item.text)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
