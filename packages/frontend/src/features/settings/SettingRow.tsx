import { IconArrowBackUp, IconCopy } from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { type ReactNode, useId } from "react";
import { cn } from "@nookly/ui/lib/utils";
import { Button } from "@nookly/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import {
  StatusAnnouncer,
  StatusIcon,
  statusTextClass,
  useActionStatus,
} from "#/components/action-feedback.tsx";
import { copyText } from "#/lib/clipboard.ts";
import { applyTheme } from "#/lib/theme.ts";
import { SETTINGS, type SettingId, definitionOf } from "#/lib/settings/registry.ts";
import { settings, useSetting } from "#/lib/settings/settings.ts";
import { isShortcutName } from "#/lib/shortcuts.ts";
import { requestShortcutChange } from "./shortcut-editing.ts";

/// A row of the Settings dialog: title and description on the left, the control on
/// the right. `settingId` rows also show their id and a reset button.
export function SettingRow({
  title,
  description,
  settingId,
  control,
  footer,
}: {
  title: string;
  description: string;
  /// Set for registry settings; shown beside the title with a reset button.
  settingId?: SettingId;
  control: ReactNode;
  /// Full width content under the row.
  footer?: ReactNode;
}) {
  const labelId = useId();
  return (
    <fieldset
      aria-labelledby={labelId}
      data-setting-id={settingId}
      className="flex flex-col gap-3 border-b border-border/60 py-4 last:border-b-0"
    >
      <div className="flex items-center justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-0.5">
          {settingId && <CopyIdButton settingId={settingId} />}
          <div className="flex items-center gap-1.5">
            <span id={labelId} className="text-sm font-medium">
              {title}
            </span>
            {settingId && <ResetButton settingId={settingId} title={title} />}
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex w-72 shrink-0 items-center justify-end">{control}</div>
      </div>
      {footer}
    </fieldset>
  );
}

/// The id as small quiet text; hovering or focusing it reveals a copy icon, and the
/// whole thing is the one button that copies it. The icon swaps to a check in place.
function CopyIdButton({ settingId }: { settingId: SettingId }) {
  const copy = useMutation({ mutationFn: () => copyText(settingId) });
  const status = useActionStatus(copy);
  const label = status === "error" ? "Couldn't copy, try again" : "Copy setting ID";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${label} ${settingId}`}
          onClick={() => !copy.isPending && copy.mutate()}
          className={cn(
            "group flex w-fit max-w-full cursor-pointer items-center gap-1 rounded-sm text-xs text-muted-foreground/70 hover:text-muted-foreground focus-visible:text-muted-foreground",
            statusTextClass(status),
          )}
        >
          <span className="truncate">{settingId}</span>
          <StatusIcon
            status={status}
            size={12}
            className={cn(status !== "idle" && "opacity-100")}
            idle={
              <IconCopy
                size={12}
                className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              />
            }
          />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
      <StatusAnnouncer message={status === "success" ? `Copied ${settingId}` : null} />
    </Tooltip>
  );
}

/// Back to the default, only while the value differs from it.
function ResetButton({ settingId, title }: { settingId: SettingId; title: string }) {
  const [value] = useSetting(settingId);
  const { default: fallback } = definitionOf(settingId);
  if (JSON.stringify(value) === JSON.stringify(fallback)) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="iconSm"
          className="size-5"
          aria-label={`Reset ${title} to default`}
          onClick={() => {
            const shortcut = settingId.replace(/^shortcuts\./, "");
            // A shortcut's default key may be in use by now; that goes through the
            // same check as any change, never straight to a double assignment.
            if (settingId.startsWith("shortcuts.") && isShortcutName(shortcut)) {
              requestShortcutChange(shortcut, "default");
              return;
            }
            settings.reset(settingId);
            // Resetting alone doesn't redraw the page, only `applyTheme` does.
            if (settingId === "appearance.theme") applyTheme(SETTINGS["appearance.theme"].default);
          }}
        >
          <IconArrowBackUp size={12} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Reset to default</TooltipContent>
    </Tooltip>
  );
}
