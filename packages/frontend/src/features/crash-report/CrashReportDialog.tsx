import { IconBrandGithub, IconCheck, IconCopy } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { Button } from "@nookly/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { type CrashReport, dismissCrashReport, latestCrashReport } from "#/lib/api/crash-report.ts";
import { copyText } from "#/lib/clipboard.ts";
import { ignoreError } from "#/lib/log.ts";
import { qk } from "#/lib/query-keys.ts";

const ISSUES_URL = "https://github.com/Daanieeel/nookly/issues/new";

/// A new GitHub issue with the report filled in. The person reads it and submits it themselves.
export function issueUrl(report: CrashReport): string {
  const body = `${"```"}\n${report.text}\n${"```"}\n\nWhat I was doing when it closed:\n`;
  const params = new URLSearchParams({ title: "Nookly closed unexpectedly", body });
  return `${ISSUES_URL}?${params.toString()}`;
}

/// Shown on the first launch after Nookly closed unexpectedly. The report stays on this
/// computer: it can be read, copied, or opened as a GitHub issue the person submits.
export function CrashReportDialog() {
  const queryClient = useQueryClient();
  const { data: report } = useQuery({
    queryKey: qk.crashReport,
    queryFn: latestCrashReport,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const [showing, setShowing] = useState(false);
  const [copied, setCopied] = useState(false);
  const dismiss = useMutation({
    mutationFn: dismissCrashReport,
    onSettled: () => queryClient.setQueryData(qk.crashReport, null),
  });

  if (!report) return null;
  const close = () => !dismiss.isPending && dismiss.mutate(report.occurredAt);

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nookly closed unexpectedly</DialogTitle>
          <DialogDescription>
            Your notes and other items are safe. If you want to help fix this, you can share a short
            report. It holds the version, your system and what went wrong, and nothing you wrote.
            Nothing is sent unless you send it.
          </DialogDescription>
        </DialogHeader>
        {showing && (
          <pre
            aria-label="Report"
            className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap"
          >
            {report.text}
          </pre>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowing((v) => !v)}>
            {showing ? "Hide report" : "Show report"}
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              void copyText(report.text)
                .then(() => setCopied(true))
                .catch(ignoreError("copying the crash report"))
            }
          >
            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
            {copied ? "Copied" : "Copy report"}
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              void openUrl(issueUrl(report)).catch(ignoreError("opening the issue page"))
            }
          >
            <IconBrandGithub size={14} />
            Report on GitHub
          </Button>
          <Button onClick={close}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
