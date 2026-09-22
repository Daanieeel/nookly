import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconTerminal2, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";
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

  const install = useMutation({
    mutationFn: installCli,
    onSuccess: (result) => {
      queryClient.setQueryData(["cli-install-status"], result);
      toast.success("CLI installed", {
        description: result.shellHint ?? "Try `nookly cli schema` in a terminal.",
      });
    },
    onError: (error) => {
      toast.error("Couldn't install the CLI", {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  if (!status || !status.supported || status.installed || dismissed) return null;

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
        disabled={install.isPending}
        onClick={() => install.mutate()}
        className="h-7 w-full"
      >
        Install CLI
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Dismiss CLI install suggestion"
            onClick={() => {
              dismiss();
              setDismissed(true);
            }}
            className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded text-muted-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <IconX className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Dismiss</TooltipContent>
      </Tooltip>
    </Card>
  );
}
