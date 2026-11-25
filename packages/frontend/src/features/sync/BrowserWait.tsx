import { providerName } from "@nookly/shared/api";
import { Button } from "@nookly/ui/components/button";
import { syncRuntime } from "./sync-instance.ts";

/// While a provider is open in the browser: what is being waited for, and the way to stop.
export function BrowserWait({ provider }: { provider: string | null }) {
  if (provider === null) return null;
  return (
    <div role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>Waiting for {providerName(provider)} in your browser</span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="ml-auto"
        onClick={() => syncRuntime.cancelProviderSignIn()}
      >
        Stop Waiting
      </Button>
    </div>
  );
}
