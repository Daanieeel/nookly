import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { TooltipProvider } from "@nookly/ui/components/tooltip";

/// Renders `ui` inside the providers the app wraps every screen in, with a fresh
/// query cache that never retries, so a failing command fails at once.
export function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const user = userEvent.setup({ delay: null });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>,
  );
  return { ...result, user, queryClient };
}
