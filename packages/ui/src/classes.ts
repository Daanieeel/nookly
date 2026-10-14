import { cva } from "class-variance-authority";

/// The classes of the primitives, the one place they are written: the components here
/// render them on the desktop, and the phone draws its own components with them
/// through NativeWind. Changing one changes both, and counts as changing the primitive.

export const INPUT_CLASSES =
  "flex h-8 w-full min-w-0 rounded-md border border-input bg-accent px-3 py-1 text-sm shadow-xs transition-colors outline-none placeholder:text-muted-foreground hover:bg-accent/80 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

export const TEXTAREA_CLASSES =
  "flex w-full min-w-0 resize-none rounded-md border border-input bg-accent px-3 py-2 text-sm shadow-xs transition-colors outline-none placeholder:text-muted-foreground hover:bg-input focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

export const LABEL_CLASSES =
  "flex items-center gap-2 text-sm font-medium leading-none select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50";

export const FIELD_LABEL_CLASSES =
  "flex items-center gap-1 text-xs leading-none text-muted-foreground select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50";

export const SEPARATOR_CLASSES =
  "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px";

export const SKELETON_CLASSES = "animate-pulse rounded-md bg-foreground/10";

export const CARD_CLASSES =
  "flex flex-col gap-6 rounded-xl border border-input bg-accent text-accent-foreground";

export const CARD_TITLE_CLASSES = "text-lg leading-none font-semibold";

export const CARD_DESCRIPTION_CLASSES = "text-sm text-muted-foreground";

export const SIDEBAR_GROUP_LABEL_CLASSES = [
  "flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
  "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
];

export const sidebarMenuButtonVariants = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm ring-sidebar-ring outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent/60 data-[state=open]:hover:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
        outline:
          "bg-background shadow-[0_0_0_1px_var(--sidebar-border)] hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_var(--sidebar-accent)]",
      },
      size: {
        default: "h-8 text-sm",
        sm: "h-7 text-xs",
        lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive/10 text-destructive border border-destructive/50 hover:bg-destructive/30",
        warning: "bg-warning/10 text-warning border border-warning/50 hover:bg-warning/30",
        caution: "bg-caution/10 text-caution border border-caution/50 hover:bg-caution/30",
        outline: "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
        positive: "bg-positive/10 border border-positive text-positive hover:bg-positive/30",
        neutral:
          "bg-muted-foreground/20 border border-muted-foreground text-white hover:bg-muted-foreground/40",
        secondary: "border border-input bg-accent hover:bg-accent/80 hover:text-accent-foreground",
        ghost: "hover:bg-black/5 hover:text-accent-foreground",
        muted: "text-muted-foreground/60 hover:bg-black/5 hover:text-muted-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        linkMuted: "text-muted-foreground underline-offset-4 hover:text-foreground hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-8",
        icon: "size-9",
        iconSm: "size-7",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export const badgeVariants = cva(
  "inline-flex items-center rounded-sm border font-medium leading-none whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        primary: "bg-primary/10 border border-primary/50 text-primary",
        secondary: "border-transparent bg-accent text-accent-foreground",
        outline: "border-foreground/50 text-foreground",
        ghost: "border-transparent bg-transparent text-foreground",
        positive: "bg-positive/10 border border-positive/50 text-positive",
        warning: "bg-warning/10 border border-warning/50 text-warning",
        destructive: "bg-destructive/10 border border-destructive/50 text-destructive",
      },
      size: {
        sm: "px-1 py-0.5 text-[11px]",
        md: "px-1.5 py-0.5 text-xs",
        lg: "px-2.5 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "sm",
    },
  },
);
