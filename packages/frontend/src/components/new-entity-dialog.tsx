import { IconChevronRight } from "@tabler/icons-react";
import type { ReactNode, RefObject } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nookly/ui/components/select";
import { Switch } from "@nookly/ui/components/switch";
import type { Space } from "#/lib/api/types.ts";
import { SpaceDot } from "./space-chip.tsx";

/// The shell of a quick create modal (new task, new assignment): focuses the title on
/// open, and Enter in the form or Cmd+Enter anywhere submits.
export function NewEntityDialog({
  open,
  onOpenChange,
  titleRef,
  onSubmit,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titleRef: RefObject<HTMLInputElement | null>;
  onSubmit: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl gap-0 p-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          titleRef.current?.focus();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit();
          }
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {children}
        </form>
      </DialogContent>
    </Dialog>
  );
}

/// The breadcrumb on top of a quick create modal: the Space (a picker when `spaces` and
/// `onSpaceChange` are given), then the modal's title and its screen reader description.
export function NewEntityBreadcrumb({
  spaceId,
  spaceName,
  spaces,
  onSpaceChange,
  title,
  description,
}: {
  spaceId: string;
  /// Shown when the Space is not a picker.
  spaceName: string;
  spaces?: Space[];
  onSpaceChange?: (spaceId: string) => void;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-1.5 px-4 pt-4 text-xs text-muted-foreground">
      {spaces && onSpaceChange ? (
        <Select value={spaceId} onValueChange={onSpaceChange}>
          <SelectTrigger size="sm" className="h-6 w-auto gap-1.5" aria-label="Space">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {spaces.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                <SpaceDot space={option} />
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="inline-flex h-6 items-center rounded-md border border-border px-2 font-medium text-foreground">
          {spaceName}
        </span>
      )}
      <IconChevronRight size={12} />
      <span className="text-foreground">
        <DialogTitle className="text-xs font-normal">{title}</DialogTitle>
      </span>
      <DialogDescription className="sr-only">{description}</DialogDescription>
    </div>
  );
}

/// The "Create more" switch in the footer of a quick create modal.
export function CreateMoreSwitch({
  id,
  checked,
  onCheckedChange,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <label htmlFor={id} className="cursor-pointer">
        Create more
      </label>
    </div>
  );
}
