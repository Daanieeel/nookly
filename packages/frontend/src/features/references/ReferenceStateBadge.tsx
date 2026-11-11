import { Badge } from "@nookly/ui/components/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import type { ReferenceProvider, ReferenceStatus } from "#/lib/api/types.ts";
import {
  referenceStateLabel,
  referenceStateTone,
  referenceStateTooltip,
} from "#/lib/reference-state.ts";

/// Where a pointer to something Nookly does not own stands, in one badge and one tooltip, the
/// same for a file, a link and a Moodle course.
export function ReferenceStateBadge({
  status,
  provider,
}: {
  status: ReferenceStatus;
  provider: ReferenceProvider;
}) {
  const label = referenceStateLabel(status);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          size="md"
          variant={referenceStateTone(status.state)}
          data-state-key={status.state}
          tabIndex={0}
          aria-label={`${label}. ${referenceStateTooltip(status, provider)}`}
        >
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{referenceStateTooltip(status, provider)}</TooltipContent>
    </Tooltip>
  );
}
