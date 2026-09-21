import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  // `border-border` gives the track a visible boundary of its own — in this
  // theme `--muted`/`--card`/`--popover` can collapse to the same color (e.g.
  // dark mode), which otherwise leaves the track and the active trigger with
  // zero contrast against each other or a Popover's own background.
  "inline-flex w-fit items-center justify-center rounded-md border border-border bg-muted",
  {
    variants: {
      size: {
        default: "h-9 p-1",
        sm: "h-7 p-0.5",
      },
    },
    defaultVariants: { size: "default" },
  },
);

function TabsList({
  className,
  size,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(tabsListVariants({ size }), className)}
      {...props}
    />
  );
}

const tabsTriggerVariants = cva(
  "inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm font-medium whitespace-nowrap text-muted-foreground outline-none transition-[color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border data-[state=active]:border-border data-[state=active]:bg-raised data-[state=active]:text-foreground data-[state=active]:shadow-xs",
  {
    variants: {
      size: {
        default: "px-2 py-1 text-sm",
        sm: "px-1.5 py-0.5 text-xs",
      },
    },
    defaultVariants: { size: "default" },
  },
);

function TabsTrigger({
  className,
  size,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> & VariantProps<typeof tabsTriggerVariants>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(tabsTriggerVariants({ size }), className)}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
