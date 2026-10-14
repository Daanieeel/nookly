/// Classes of the desktop's own components that the phone draws the same way, through
/// NativeWind. The components here use these constants themselves, so both stay one.
/// The primitives' classes live in `@nookly/ui/classes`.

/// A form control's wrapper: the label above, the control, the error below (`FormField`).
export const FORM_FIELD_CLASSES = "group/field flex min-w-0 flex-col gap-1";
/// The red star after a required field's label.
export const REQUIRED_MARK_CLASSES = "-mx-0.5 text-destructive";
/// The quiet note under a control while there is no error.
export const FIELD_HINT_CLASSES = "text-xs text-muted-foreground";
/// A field's error, with its warning icon (`FieldError`).
export const FIELD_ERROR_CLASSES = "flex items-center gap-1 text-xs text-destructive";

/// A value in the properties panel, which opens its picker (`PropertyRow`).
export const PROPERTY_VALUE =
  "flex h-7 min-w-0 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-accent data-[state=open]:bg-accent";

/// A setting's title and the line under it (`SettingRow`).
export const SETTING_TITLE_CLASSES = "text-sm font-medium";
export const SETTING_DESCRIPTION_CLASSES = "text-xs text-muted-foreground";
/// The small heading above a group of settings.
export const SECTION_HEADING_CLASSES = "pb-1 text-xs font-medium text-muted-foreground";
/// A page's title, as Settings shows its category.
export const PAGE_TITLE_CLASSES = "pb-3 text-lg font-semibold";

/// One item in a list of items, like a Task's sub-tasks.
export const LIST_ROW_CLASSES =
  "relative flex h-10 items-center gap-2 border-b border-border/60 px-1 hover:bg-accent/40";

/// A page's blocks as classes, for the phone, which edits blocks as plain text fields.
/// They say in Tailwind what `.tiptap-content` in `styles.css` gives each element on
/// the desktop: headings at 1.5, 1.25 and 1.125rem in semibold, quotes muted and
/// italic behind a 2px line, code in monospace on the block surface.
export const EDITOR_BLOCK_CLASSES = {
  paragraph: "text-sm",
  heading1: "text-2xl font-semibold",
  heading2: "text-xl font-semibold",
  heading3: "text-lg font-semibold",
  quote: "border-l-2 border-border pl-3 text-sm text-muted-foreground italic",
  code: "rounded-md bg-muted p-3 font-mono text-[0.8rem]",
} as const;

/// A color to pick, as a dot, and the ring around the one picked (`SpaceColorField`).
export const COLOR_SWATCH_CLASSES = "size-6 rounded-full";
export const COLOR_SWATCH_SELECTED_CLASSES = "ring-2 ring-ring ring-offset-2 ring-offset-card";

/// Two or three choices side by side, like Can view and Can edit (`RoleToggle`).
export const SEGMENTED_CLASSES =
  "flex h-8 shrink-0 items-center rounded-md border border-input bg-secondary p-0.5";
export const SEGMENT_CLASSES = "h-full rounded-sm px-2 text-xs transition-colors";
export const SEGMENT_SELECTED_CLASSES = "bg-background text-foreground shadow-xs";
export const SEGMENT_IDLE_CLASSES = "text-muted-foreground hover:text-foreground";
