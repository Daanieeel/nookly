import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@nookly/ui/lib/utils";

/// Tabs inside a page or a dialog: a quiet row of labels over a hairline, the open one
/// underlined. Not the app's own tab bar under the titlebar (`TabBar`), which holds open
/// pages, and not `Tabs` (a segmented control for picking a mode).
///
/// ```tsx
/// <PageTabs value={value} onValueChange={setValue}>
///   <PageTabsBar>
///     <PageTabsList>
///       <PageTabsTrigger value="a">A</PageTabsTrigger>
///     </PageTabsList>
///     {actions}
///   </PageTabsBar>
///   <PageTabsContent value="a">…</PageTabsContent>
/// </PageTabs>
/// ```
function PageTabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="page-tabs"
      className={cn("flex min-w-0 flex-col gap-3", className)}
      {...props}
    />
  );
}

/// The row that carries the hairline under the tabs, and any buttons beside them (a `+`
/// to add one) that are not tabs themselves.
function PageTabsBar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-tabs-bar"
      className={cn("flex min-w-0 items-center gap-1 border-b border-border", className)}
      {...props}
    />
  );
}

/// The tabs, side by side. Scrolls sideways when there are more than fit.
function PageTabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="page-tabs-list"
      className={cn("flex min-w-0 flex-1 items-center gap-1 overflow-x-auto", className)}
      {...props}
    />
  );
}

function PageTabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="page-tabs-trigger"
      className={cn(
        // The underline sits on the bar's hairline (`-mb-px`) rather than above it.
        "-mb-px inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-t-sm border-b-2 border-transparent px-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-primary data-[state=active]:text-foreground [&_svg]:size-3.5 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

function PageTabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="page-tabs-content"
      className={cn("min-w-0 outline-none", className)}
      {...props}
    />
  );
}

export { PageTabs, PageTabsBar, PageTabsList, PageTabsTrigger, PageTabsContent };
