import { IconArrowUpRight } from "@tabler/icons-react";
import { dismissToast, showToast, type ToastVariant } from "@nookly/ui/components/sonner";
import { EntityIcon } from "#/components/entity-icon.tsx";
import type { Entity } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { useNavStore } from "#/lib/store/nav.ts";

/// A toast carries at most one action: the item it is about, as a link that opens it, or
/// a button such as Undo. Anything more needs a dialog, since the toast goes away.
export type NotifyOptions = {
  /// A second, smaller line under the message. Say what to do next after an error.
  description?: string;
} & (
  | { entity?: Entity; action?: undefined }
  | { entity?: undefined; action?: { label: string; onClick: () => void } }
);

/// The kinds, their icons, colors and how long they stay live in the toast primitive
/// (`@nookly/ui/components/sonner`); this adds the item link, which needs the app.
function show(
  variant: ToastVariant,
  message: string,
  { description, entity, action }: NotifyOptions = {},
) {
  return showToast(variant, message, {
    description,
    action,
    footer: entity
      ? (dismiss) => {
          const title = displayTitle(entity);
          return (
            <button
              type="button"
              aria-label={`Open ${title}`}
              title={title}
              className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-accent/40 px-2 py-1 text-left text-xs font-medium hover:bg-accent"
              onClick={() => {
                useNavStore.getState().openEntity(entity.id, entity.spaceId);
                dismiss();
              }}
            >
              <EntityIcon entity={entity} size={14} />
              <span className="min-w-0 flex-1 truncate">{title}</span>
              <IconArrowUpRight size={14} className="shrink-0 text-muted-foreground" />
            </button>
          );
        }
      : undefined,
  });
}

/// The one way to show a toast in the app. Each call returns the toast's id for
/// `notify.dismiss`. See docs/development/toasts.md.
export const notify = {
  success: (message: string, options?: NotifyOptions) => show("success", message, options),
  error: (message: string, options?: NotifyOptions) => show("error", message, options),
  warning: (message: string, options?: NotifyOptions) => show("warning", message, options),
  caution: (message: string, options?: NotifyOptions) => show("caution", message, options),
  info: (message: string, options?: NotifyOptions) => show("info", message, options),
  /// One toast, or every toast when no id is given.
  dismiss: (id?: string | number) => dismissToast(id),
};
