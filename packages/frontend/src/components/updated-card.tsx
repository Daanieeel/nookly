import { IconCircleCheck } from "@tabler/icons-react";
import { Button } from "@nookly/ui/components/button";
import { Card } from "@nookly/ui/components/card";
import { cn } from "@nookly/ui/lib/utils";
import { StatusAnnouncer } from "#/components/action-feedback.tsx";
import { CardDismissButton } from "#/components/sidebar/card-dismiss-button.tsx";
import { useNavStore } from "#/lib/store/nav.ts";
import { useUpdatedNotice } from "#/lib/updated-notice.ts";
import { useAppUpdate } from "#/lib/updater.ts";

/// Success card shown where the update card was once Nookly has been updated: it says the
/// update worked and offers "See what's new". Gone once opened or dismissed, and never
/// shown beside the update card, which has the newer news. Renders nothing otherwise.
export function UpdatedCard({ className }: { className?: string }) {
  const { data: newer } = useAppUpdate();
  const { version, dismiss } = useUpdatedNotice();

  if (!version || newer) return null;

  return (
    <Card className={cn("relative flex-col gap-2 p-2.5", className)}>
      <div className="flex items-start gap-2 pr-4 text-xs">
        <IconCircleCheck className="mt-0.5 size-4 shrink-0 text-positive" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-medium text-positive">Nookly updated</p>
          <p className="text-muted-foreground">You are on version {version}.</p>
        </div>
      </div>
      <Button
        size="sm"
        variant="secondary"
        className="h-7 w-full"
        onClick={() => {
          useNavStore.getState().setWhatsNewOpen(true);
          dismiss();
        }}
      >
        See what's new
      </Button>
      <StatusAnnouncer message={`Nookly updated to version ${version}`} />
      <CardDismissButton label="Dismiss update notice" onDismiss={dismiss} />
    </Card>
  );
}
