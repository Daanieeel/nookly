import { IconExternalLink } from "@tabler/icons-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Badge } from "@nookly/ui/components/badge";
import { Button } from "@nookly/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { Kbd, KbdGroup } from "#/components/kbd.tsx";
import { CHANGELOG_URL } from "#/lib/changelog.ts";
import { preferences } from "#/lib/preferences.ts";
import { type Release, releasesSince } from "#/lib/releases.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { displayParts } from "#/lib/shortcuts.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { useAppVersion } from "#/lib/updater.ts";
import { type WhatsNewEntry, type WhatsNewFile, type WhatsNewHighlight } from "#/lib/whats-new.ts";
import { ChangelogBody } from "./ChangelogBody.tsx";
import { whatsNewIcon } from "./icons.ts";
import { Rich } from "./Rich.tsx";

/// "October 10, 2026" from `2026-10-10`, read as a local day (not UTC, which can land on
/// the day before).
function longDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(
    new Date(year, month - 1, day),
  );
}

function HighlightRow({ highlight }: { highlight: WhatsNewHighlight }) {
  const Icon = whatsNewIcon(highlight.icon);
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon size={16} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h4 className="text-sm font-semibold">{highlight.title}</h4>
          {highlight.tag && (
            <Badge variant={highlight.tag === "New" ? "positive" : "primary"}>
              {highlight.tag}
            </Badge>
          )}
          {highlight.shortcut && (
            <KbdGroup className="ml-auto">
              {displayParts(highlight.shortcut).map((part, index) => (
                <Kbd key={`${index}-${part}`}>{part}</Kbd>
              ))}
            </KbdGroup>
          )}
        </div>
        <Rich text={highlight.description} className="text-xs text-muted-foreground" />
      </div>
    </li>
  );
}

/// A version written up in `whats-new.json`: its headline, the highlights as cards, and
/// the smaller changes below.
function Entry({ entry }: { entry: WhatsNewEntry }) {
  const groups = Object.entries(entry.more).filter(([, lines]) => lines.length > 0);
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-1.5 rounded-xl bg-accent/50 p-4">
        <h3 className="text-lg/snug font-semibold">{entry.title}</h3>
        <Rich text={entry.summary} className="text-sm text-muted-foreground" />
      </section>
      {entry.highlights.length > 0 && (
        <ul className="divide-y divide-border">
          {entry.highlights.map((highlight) => (
            <HighlightRow key={highlight.title} highlight={highlight} />
          ))}
        </ul>
      )}
      {groups.map(([title, lines]) => (
        <section key={title} className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {title}
          </h3>
          <Rich text={lines.map((line) => `- ${line}`).join("\n")} />
        </section>
      ))}
    </div>
  );
}

/// One version of several: its number and date over what it changed.
function ReleaseSection({ release }: { release: Release }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="flex items-baseline gap-2 text-sm font-semibold">
        Version {release.version}
        {release.date && (
          <span className="text-xs font-normal text-muted-foreground">
            {longDate(release.date)}
          </span>
        )}
      </h2>
      <ReleaseBody release={release} />
    </section>
  );
}

function ReleaseBody({ release }: { release: Release }) {
  if (release.notes) return <Entry entry={release.notes} />;
  if (release.written?.body) return <ChangelogBody body={release.written.body} />;
  return null;
}

/// What is new since the update before this one: every release after the version the user
/// last saw, up to the one running, newest first (a jump over several versions shows them
/// all). Without an earlier version it is the running version alone. Opened from the
/// "Nookly updated" card and from Settings. The notes come from `whats-new.json`, written by
/// hand for the people who use Nookly; a version without an entry there shows its section of
/// CHANGELOG.md instead. Mounted once at the app root.
export function WhatsNewDialog({ notes, changelog }: { notes?: WhatsNewFile; changelog?: string }) {
  const open = useNavStore((s) => s.whatsNewOpen);
  const setOpen = useNavStore((s) => s.setWhatsNewOpen);
  const version = useAppVersion();
  // Where the last update came from, kept until the next one (see `useUpdatedNotice`).
  const since = preferences.get(STORAGE_KEYS.whatsNewSince);
  const { releases, hidden } = version
    ? releasesSince(since, version, notes, changelog)
    : { releases: [], hidden: 0 };
  const several = releases.length > 1 && since !== null;
  const [first] = releases;
  const date = first?.date ?? null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[min(44rem,calc(100vh-3rem))] max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>
            {several ? `What's new since ${since}` : `What's new${version ? ` in ${version}` : ""}`}
          </DialogTitle>
          <DialogDescription>
            {several
              ? `${releases.length + hidden} versions, up to ${version}`
              : date
                ? `Released ${longDate(date)}`
                : "The changes in this version."}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-6 py-5">
          {!first ? (
            <p className="text-sm text-muted-foreground">
              There are no notes for this version yet. The full changelog lists every release.
            </p>
          ) : several ? (
            <div className="flex flex-col gap-8">
              {releases.map((release) => (
                <ReleaseSection key={release.version} release={release} />
              ))}
              {hidden > 0 && (
                <p className="text-sm text-muted-foreground">
                  and {hidden} earlier version{hidden === 1 ? "" : "s"}. The full changelog lists
                  every release.
                </p>
              )}
            </div>
          ) : (
            <ReleaseBody release={first} />
          )}
        </div>
        <div className="border-t border-border px-6 py-4">
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => void openUrl(CHANGELOG_URL).catch(() => undefined)}
            >
              <IconExternalLink size={14} />
              See full changelog
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
