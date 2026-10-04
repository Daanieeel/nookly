import { IconAlertTriangle } from "@tabler/icons-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@nookly/ui/components/alert-dialog";
import { Input } from "@nookly/ui/components/input";
import { cn } from "@nookly/ui/lib/utils";
import { type ActionStatus, FieldError, StatusButtonContent } from "./action-feedback.tsx";

export interface ConfirmStat {
  value: string | number;
  label: string;
}

/// Whether `typed` is the phrase to type, ignoring case and spaces around it.
export function matchesPhrase(typed: string, phrase: string): boolean {
  return typed.trim().toLowerCase() === phrase.trim().toLowerCase();
}

/// The confirmation for an action nothing can undo: it names what goes, states the
/// consequences as exact figures, says it cannot be undone, and keeps the dangerous
/// button apart from the safe one. For actions that reach many things at once, `phrase`
/// asks the user to type a word first, so the action cannot be a rushed click.
///
/// The shape follows docs/skills/confirmation-dialogs.md: what is affected, what
/// happens to it, whether it can be undone.
export function ConfirmPermanentDialog({
  open,
  onOpenChange,
  title,
  description,
  stats,
  phrase,
  actionLabel,
  successLabel,
  errorLabel,
  status,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// What is affected, named: "Delete [Space] forever?".
  title: ReactNode;
  /// What happens to it, and that it cannot be undone.
  description: ReactNode;
  stats?: ConfirmStat[];
  /// When given, the confirm button stays off until the user has typed it.
  phrase?: string;
  actionLabel: string;
  successLabel?: string;
  errorLabel: string;
  status: ActionStatus;
  error?: string | false;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  // A phrase typed for one attempt never carries over to the next.
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);
  const confirmed = phrase === undefined || matchesPhrase(typed, phrase);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onOpenAutoFocus={(event) => {
          if (phrase === undefined) return;
          event.preventDefault();
          input.current?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="flex flex-wrap items-center gap-1.5">
            <IconAlertTriangle className="size-4 shrink-0 text-destructive" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {stats && stats.length > 0 && (
          <div className={cn("grid gap-2", stats.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col rounded-md border border-border bg-muted/40 px-3 py-2"
              >
                <span className="text-lg font-semibold tabular-nums">{stat.value}</span>
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
            ))}
          </div>
        )}
        {phrase !== undefined && (
          <div className="flex flex-col gap-1.5 text-sm">
            <label htmlFor={inputId}>
              Type <code className="rounded bg-muted px-1 py-0.5 font-mono">{phrase}</code> to
              confirm.
            </label>
            <Input
              id={inputId}
              ref={input}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                // Enter must never be the way through this dialog.
                if (event.key === "Enter") event.preventDefault();
              }}
              aria-label={`Type ${phrase} to confirm`}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}
        <FieldError message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!confirmed}
            onClick={(event) => {
              event.preventDefault();
              if (confirmed && (status === "idle" || status === "error")) onConfirm();
            }}
          >
            <StatusButtonContent
              status={status}
              label={actionLabel}
              successLabel={successLabel}
              errorLabel={errorLabel}
            />
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
