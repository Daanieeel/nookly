import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCheck, IconTerminal2, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { StatusAnnouncer, StatusIcon, statusOf } from "@/components/action-feedback";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getCliInstallStatus, installCli } from "@/lib/api/cli";

const DISMISS_KEY = "nookly:cli-install-card-dismissed";

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Worst case the card reappears next launch — not worth failing over.
  }
}

// Quiet sidebar-footer recommendation to install the `nookly cli` symlink
// (see `src-tauri/src/commands/cli_install.rs`). Hides itself once installed
// with nothing left to tell the user, or once dismissed — never nags.
export function CliInstallCard() {
  const [dismissed, setDismissed] = useState(isDismissed);
  const { data: status } = useQuery({
    queryKey: ["cli-install-status"],
    queryFn: getCliInstallStatus,
    staleTime: Infinity,
  });
  const queryClient = useQueryClient();
  // Held after success so the card can confirm in place (with the shell hint)
  // instead of vanishing the moment the status flips to installed.
  const [installedHint, setInstalledHint] = useState<string | null>(null);

  const install = useMutation({
    mutationFn: installCli,
    onSuccess: (result) => {
      setInstalledHint(result.shellHint ?? "Try `nookly cli schema` in a terminal.");
      queryClient.setQueryData(["cli-install-status"], result);
    },
  });
  const installStatus = statusOf(install);

  if (dismissed) return null;
  if (installedHint) {
    return (
      <Card className="relative flex-col gap-2 p-2.5 group-data-[collapsible=icon]:hidden">
        <div className="flex items-start gap-2 pr-4 text-xs">
          <IconCheck className="mt-0.5 size-4 shrink-0 text-positive" />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="font-medium text-positive">CLI installed</p>
            <p className="text-muted-foreground">{installedHint}</p>
          </div>
        </div>
        <StatusAnnouncer message="CLI installed" />
        <DismissButton
          onDismiss={() => {
            dismiss();
            setDismissed(true);
          }}
        />
      </Card>
    );
  }
  if (!status || !status.supported || status.installed) return null;

  return (
    <Card className="relative flex-col gap-2 p-2.5 group-data-[collapsible=icon]:hidden">
      <div className="flex items-start gap-2 pr-4 text-xs">
        <IconTerminal2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-accent-foreground">
            Use Nookly from a terminal or AI coding agent with{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">nookly cli</code>.
          </p>
        </div>
      </div>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => !install.isPending && install.mutate()}
        className="h-7 w-full"
      >
        <StatusIcon status={installStatus} idle={null} />
        {installStatus === "error" ? "Couldn't install, try again" : "Install CLI"}
      </Button>
      {install.isError && <p className="text-xs text-destructive">{install.error.message}</p>}
      <StatusAnnouncer message={install.isError ? "Couldn't install the CLI" : null} />
      <DismissButton
        onDismiss={() => {
          dismiss();
          setDismissed(true);
        }}
      />
    </Card>
  );
}

function DismissButton({ onDismiss }: { onDismiss: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="Dismiss CLI install suggestion"
          onClick={onDismiss}
          className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded text-muted-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <IconX className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">Dismiss</TooltipContent>
    </Tooltip>
  );
}
