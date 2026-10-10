# Toasts

Every toast goes through `notify` in [`components/notify.tsx`](../../packages/frontend/src/components/notify.tsx). Do not import `toast` from `sonner` anywhere else. `AppToaster` ([`components/app-toaster.tsx`](../../packages/frontend/src/components/app-toaster.tsx)) is mounted once in `App.tsx`.

```tsx
notify.success("Imported", { entity });
notify.success("Entry moved to Trash", { action: { label: "Undo", onClick } });
notify.error("Couldn't save changes", { description: "Try again in a moment." });
```

`success`, `error`, `warning` and `info` take a message and optional `description`, plus either an `entity` or an `action`, never both. Each returns the toast id for `notify.dismiss(id)`; `notify.dismiss()` closes all.

## Message

One short line that says what changed. When the toast is about an item, pass `entity` instead of putting its title in the message: the item shows as a link (icon, title) that opens it, and that is the toast's one action. An error says what to do next in `description`.

## Behaviour

- The status icon (check, triangle, info) sits on the message's line, never in a column of its own. Sonner's icon column is not used.
- Success, warning and info close after 5 seconds and pause while the pointer is over them. Errors stay until closed.
- Errors are announced as `role="alert"`, the rest as `role="status"`.
- Every toast has a close button on its corner. With more than one toast showing, a Clear all button appears under the stack.
- Corners are rounder and motion is 180 ms, fade only under `prefers-reduced-motion`; both are rules at the end of `styles.css`.
