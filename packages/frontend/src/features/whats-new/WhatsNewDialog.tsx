import { IconExternalLink } from "@tabler/icons-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@nookly/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { CHANGELOG_URL, changelogFor } from "#/lib/changelog.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { useAppVersion } from "#/lib/updater.ts";
import { ChangelogBody } from "./ChangelogBody.tsx";

/// "October 10, 2026" from `2026-10-10`, read as a local day (not UTC, which can land on
/// the day before).
function longDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(
    new Date(year, month - 1, day),
  );
}

/// What changed in the version that is running, and only that version. Opened from the
/// "Nookly updated" card and from Settings. The notes come from CHANGELOG.md, which is
/// written by hand for the people who use Nookly. Mounted once at the app root.
export function WhatsNewDialog({ text }: { text?: string }) {
  const open = useNavStore((s) => s.whatsNewOpen);
  const setOpen = useNavStore((s) => s.setWhatsNewOpen);
  const version = useAppVersion();
  const entry = version ? changelogFor(version, text) : undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[min(40rem,calc(100vh-3rem))] max-w-lg flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>What's new{version ? ` in ${version}` : ""}</DialogTitle>
          <DialogDescription>
            {entry?.date ? `Released ${longDate(entry.date)}` : "The changes in this version."}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-6 py-5">
          {entry && entry.body ? (
            <ChangelogBody body={entry.body} />
          ) : (
            <p className="text-sm text-muted-foreground">
              There are no notes for this version yet. The full changelog lists every release.
            </p>
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
            <Button onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
