import { IconArrowBackUp } from "@tabler/icons-react";
import { type ReactNode, useId } from "react";
import { Button } from "@nookly/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { applyTheme } from "#/lib/theme.ts";
import { SETTINGS, type SettingId, definitionOf } from "#/lib/settings/registry.ts";
import { settings, useSetting } from "#/lib/settings/settings.ts";

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
          <div className="flex items-center gap-1.5">
            <span id={labelId} className="text-sm font-medium">
              {title}
            </span>
            {settingId && <ResetButton settingId={settingId} title={title} />}
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
          {settingId && (
            <code className="font-mono text-xs text-muted-foreground/70">{settingId}</code>
          )}
        </div>
        <div className="flex w-72 shrink-0 items-center justify-end">{control}</div>
      </div>
      {footer}
    </fieldset>
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
