import { cva } from "class-variance-authority";

/// The classes of the primitives, the one place they are written: the components here
/// render them on the desktop, and the phone draws its own components with them
/// through NativeWind. Changing one changes both, and counts as changing the primitive.

export const INPUT_CLASSES =
  "flex h-8 w-full min-w-0 rounded-md border border-input bg-raised px-3 py-1 text-ui shadow-control transition-colors outline-none placeholder:text-muted-foreground hover:bg-accent/50 focus-ring aria-invalid:border-destructive aria-invalid:[--ring:var(--destructive)] disabled:cursor-not-allowed disabled:opacity-50";

export const TEXTAREA_CLASSES =
  "flex w-full min-w-0 resize-none rounded-md border border-input bg-raised px-3 py-2 text-ui shadow-control transition-colors outline-none placeholder:text-muted-foreground hover:bg-accent/50 focus-ring aria-invalid:border-destructive aria-invalid:[--ring:var(--destructive)] disabled:cursor-not-allowed disabled:opacity-50";

export const LABEL_CLASSES =
  "flex items-center gap-2 text-sm font-medium leading-none select-none group-data-[disabled=true]:cursor-not-allowed group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50";

export const FIELD_LABEL_CLASSES =
  "flex items-center gap-1 text-xs leading-none text-muted-foreground select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50";

export const SEPARATOR_CLASSES =
  "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px";

export const SKELETON_CLASSES = "animate-pulse rounded-md bg-foreground/10";

export const CARD_CLASSES =
  "flex flex-col gap-6 rounded-xl border bg-card text-card-foreground shadow-card";

/// A tray: a recessed trough around one raised thing (a search field, a banner), like a
/// bezel. It has no border of its own, so the thing inside keeps the only edge. Its padding
/// is 4px and its radius is the inner radius plus that 4px, so the curves stay concentric:
/// what sits inside is a field or a button, which are `rounded-md`.
export const TRAY_CLASSES =
  "rounded-[calc(var(--radius-md)+0.25rem)] bg-muted p-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)]";

export const CARD_TITLE_CLASSES = "text-lg leading-none font-semibold";

export const CARD_DESCRIPTION_CLASSES = "text-sm text-muted-foreground";

/// The sidebar's panel, inset: no background or border of its own, so it sits on the
/// page. To bring the panel back, add these again: bg-sidebar
/// group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border
/// group-data-[variant=floating]:shadow-sm
export const SIDEBAR_PANEL_CLASSES =
  "flex size-full flex-col group-data-[variant=floating]:rounded-lg";

export const SIDEBAR_GROUP_LABEL_CLASSES = [
  "flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-ring [&>svg]:size-4 [&>svg]:shrink-0",
  "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
];

export const sidebarMenuButtonVariants = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground focus-ring active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent/60 data-[state=open]:hover:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
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
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-ui font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 outline-none focus-ring",
  {
    variants: {
      variant: {
        default:
          "bg-primary bg-linear-to-b from-white/15 to-white/0 text-primary-foreground shadow-primary hover:from-white/25",
        destructive:
          "[--solid:var(--color-solid-destructive)] text-white bg-(--solid) bg-linear-to-b from-white/15 to-white/0 shadow-solid hover:from-white/25 [&_svg]:text-white [&_.text-caution]:text-white [&_.text-destructive]:text-white [&_.text-positive]:text-white",
        warning:
          "[--solid:var(--color-solid-warning)] text-white bg-(--solid) bg-linear-to-b from-white/15 to-white/0 shadow-solid hover:from-white/25 [&_svg]:text-white [&_.text-caution]:text-white [&_.text-destructive]:text-white [&_.text-positive]:text-white",
        caution:
          "[--solid:var(--color-solid-caution)] text-white bg-(--solid) bg-linear-to-b from-white/15 to-white/0 shadow-solid hover:from-white/25 [&_svg]:text-white [&_.text-caution]:text-white [&_.text-destructive]:text-white [&_.text-positive]:text-white",
        outline: "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
        positive:
          "[--solid:var(--color-solid-positive)] text-white bg-(--solid) bg-linear-to-b from-white/15 to-white/0 shadow-solid hover:from-white/25 [&_svg]:text-white [&_.text-caution]:text-white [&_.text-destructive]:text-white [&_.text-positive]:text-white",
        neutral:
          "bg-muted-foreground/20 border border-muted-foreground text-white hover:bg-muted-foreground/40",
        secondary:
          "border border-input bg-raised shadow-control hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-foreground/6 hover:text-accent-foreground",
        muted: "text-muted-foreground/60 hover:bg-foreground/6 hover:text-muted-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        linkMuted: "text-muted-foreground underline-offset-4 hover:text-foreground hover:underline",
        destructiveGhost: "text-destructive hover:bg-destructive/10",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-8",
        icon: "size-9",
        iconSm: "size-7",
        // A row in a popover's list: its corners follow the popover's, one border and padding in.
        row: "rounded-sm px-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const BADGE_BASE =
  "inline-flex items-center rounded-sm border font-medium leading-none whitespace-nowrap";

const BADGE_SIZES = {
  sm: "px-1 py-0.5 text-[11px]",
  md: "px-1.5 py-0.5 text-xs",
  lg: "px-2.5 py-1 text-sm",
} as const;

/// The badge as the desktop and the site draw it: the buttons' own looks, a glossy main
/// colour and solid status colours with a white label.
export const badgeVariants = cva(BADGE_BASE, {
  variants: {
    variant: {
      default:
        "border-transparent bg-primary bg-linear-to-b from-white/15 to-white/0 text-primary-foreground shadow-primary",
      primary:
        "border-transparent bg-primary bg-linear-to-b from-white/15 to-white/0 text-primary-foreground shadow-primary",
      secondary: "border-input bg-raised text-foreground shadow-control",
      outline: "border-foreground/30 text-foreground",
      ghost: "border-transparent bg-transparent text-foreground",
      neutral: "border-foreground/15 bg-foreground/10 text-foreground",
      positive:
        "border-transparent [--solid:var(--color-solid-positive)] text-white bg-(--solid) bg-linear-to-b from-white/15 to-white/0 shadow-solid",
      caution:
        "border-transparent [--solid:var(--color-solid-caution)] text-white bg-(--solid) bg-linear-to-b from-white/15 to-white/0 shadow-solid",
      warning:
        "border-transparent [--solid:var(--color-solid-warning)] text-white bg-(--solid) bg-linear-to-b from-white/15 to-white/0 shadow-solid",
      destructive:
        "border-transparent [--solid:var(--color-solid-destructive)] text-white bg-(--solid) bg-linear-to-b from-white/15 to-white/0 shadow-solid",
    },
    size: BADGE_SIZES,
  },
  defaultVariants: {
    variant: "secondary",
    size: "sm",
  },
});
