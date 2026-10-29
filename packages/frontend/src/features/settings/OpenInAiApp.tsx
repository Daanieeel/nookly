import { IconExternalLink } from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@nookly/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { FieldError, StatusIcon, statusOf } from "#/components/action-feedback.tsx";
import { type AiApp, listAiApps, openAgentDirIn } from "#/lib/api/ai-apps.ts";
import { preferences } from "#/lib/preferences.ts";
import { qk } from "#/lib/query-keys.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { aiAppLogo, orderAiApps } from "./ai-apps.tsx";

/// "Open in" for the agent folder: lists the AI apps found on this computer and starts the
/// one picked on the folder. Nookly only launches the app, it runs no agent. The last used
/// app is listed first. With no app found the button is off, and says why.
export function OpenInAiApp() {
  const [open, setOpen] = useState(false);
  const found = useQuery({ queryKey: qk.aiApps, queryFn: listAiApps, retry: false });
  const apps = orderAiApps(found.data ?? [], preferences.get(STORAGE_KEYS.agentOpenIn));

  const launch = useMutation({
    mutationFn: (app: AiApp) => openAgentDirIn(app.id),
    onSuccess: (_, app) => {
      preferences.set(STORAGE_KEYS.agentOpenIn, app.id);
      setOpen(false);
    },
  });

  const none = !found.isPending && apps.length === 0;
  return (
    <Popover
      open={open && !none}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) launch.reset();
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          {/* A disabled button has no pointer events, so the tooltip hangs on its wrapper. */}
          <span className="inline-flex shrink-0">
            <PopoverTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                className="h-7 gap-1.5 px-2"
                aria-label="Open in"
                disabled={found.isPending || none}
              >
                <IconExternalLink size={14} />
                Open in
              </Button>
            </PopoverTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {none
            ? "No supported AI app found on this computer"
            : "Open the agent folder in an AI app"}
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="end" aria-label="Open in" className="w-56 p-1">
        <ul className="flex flex-col gap-0.5">
          {apps.map((app) => {
            const Logo = aiAppLogo(app.id);
            const status = launch.variables?.id === app.id ? statusOf(launch) : "idle";
            return (
              <li key={app.id}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-full justify-start gap-2 px-2 font-normal"
                  disabled={launch.isPending}
                  onClick={() => launch.mutate(app)}
                >
                  {Logo && <Logo className="size-4 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate text-left">{app.name}</span>
                  <StatusIcon status={status} idle={null} size={13} />
                </Button>
                {status === "error" && (
                  <FieldError message={`Couldn't open ${app.name}, try again`} />
                )}
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
