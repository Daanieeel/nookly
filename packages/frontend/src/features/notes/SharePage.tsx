import { IconFileExport, IconMarkdown, IconShare } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StatusIcon, statusOf, statusTextClass } from "#/components/action-feedback.tsx";
import { FeedbackMenuItem } from "#/components/feedback-menu-item.tsx";
import { Button } from "@nookly/ui/components/button";
import { DropdownSubmenu } from "@nookly/ui/components/dropdown-submenu";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { renderPageMarkdown } from "#/lib/api/notes.ts";
import { renderEntityJson } from "#/lib/api/portable.ts";
import type { Entity } from "#/lib/api/types.ts";
import { qk } from "#/lib/query-keys.ts";
import { SHARE_FORMATS, type ShareFormat, sharePage } from "./share-page.ts";

const FORMATS: ShareFormat[] = ["markdown", "json"];

const FORMAT_ICONS = {
  markdown: IconMarkdown,
  json: IconFileExport,
} satisfies Record<ShareFormat, typeof IconShare>;

/// The page rendered in a format, fetched ahead of the click: the webview only starts a
/// share from a click, so the text has to be there already. `load` still resolves when
/// it is not.
function useShareText(entity: Entity, format: ShareFormat) {
  const queryClient = useQueryClient();
  const options = {
    queryKey: format === "markdown" ? qk.pageMarkdown(entity.id) : qk.pageJson(entity.id),
    queryFn: () =>
      format === "markdown" ? renderPageMarkdown(entity.id) : renderEntityJson(entity.id),
    staleTime: 0,
  };
  const { data } = useQuery(options);
  return { ready: data !== undefined, load: async () => data ?? queryClient.fetchQuery(options) };
}

function ShareOption({
  entity,
  format,
  onShared,
}: {
  entity: Entity;
  format: ShareFormat;
  onShared: () => void;
}) {
  const { ready, load } = useShareText(entity, format);
  const { label, hint } = SHARE_FORMATS[format];
  const Icon = FORMAT_ICONS[format];
  const share = useMutation({
    mutationFn: async () => sharePage(entity, format, await load()),
    onSuccess: (outcome) => {
      if (outcome !== "cancelled") onShared();
    },
  });
  const status = statusOf(share);
  return (
    <Button
      variant="ghost"
      className="h-auto w-full justify-start gap-2 px-2 py-1.5 font-normal"
      disabled={!ready || share.isPending}
      onClick={() => share.mutate()}
    >
      <StatusIcon
        status={status}
        idle={<Icon size={14} className="text-muted-foreground" />}
        size={14}
      />
      <span className="flex min-w-0 flex-1 flex-col items-start text-left">
        <span className={statusTextClass(status)}>
          {status === "error" ? "Couldn't share, try again" : label}
        </span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
    </Button>
  );
}

/// Top right of the page's detail sidebar: a popover with the ways to share the page, each
/// of which opens the system share menu.
export function ShareButton({ entity }: { entity: Entity }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Share Page">
              <IconShare size={15} />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Share Page</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" aria-label="Share Page" className="w-56 p-1">
        {FORMATS.map((format) => (
          <ShareOption
            key={format}
            entity={entity}
            format={format}
            onShared={() => setOpen(false)}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}

function ShareMenuItem({
  entity,
  format,
  onDone,
}: {
  entity: Entity;
  format: ShareFormat;
  onDone: () => void;
}) {
  const { load } = useShareText(entity, format);
  const Icon = FORMAT_ICONS[format];
  return (
    <FeedbackMenuItem
      icon={<Icon size={14} className="text-muted-foreground" />}
      label={SHARE_FORMATS[format].label}
      successLabel="Shared"
      errorLabel="Couldn't share, try again"
      action={async () => (await sharePage(entity, format, await load())) !== "cancelled"}
      onDone={onDone}
    />
  );
}

/// The Share entry of a page's more actions menu.
export function ShareMenuSub({ entity, onDone }: { entity: Entity; onDone: () => void }) {
  return (
    <DropdownSubmenu icon={<IconShare size={14} className="text-muted-foreground" />} label="Share">
      {FORMATS.map((format) => (
        <ShareMenuItem key={format} entity={entity} format={format} onDone={onDone} />
      ))}
    </DropdownSubmenu>
  );
}
