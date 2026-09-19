import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <main className="flex h-svh flex-col items-center justify-center gap-4 p-6">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>nookly</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Life and study organizer — set up and ready.
              </p>
              <Button>Get started</Button>
            </CardContent>
          </Card>
        </main>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
