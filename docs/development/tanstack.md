# TanStack Conventions

Frontend code in `packages/frontend/src`.

## Forms

Submit forms use `useForm` from `@tanstack/react-form` with a Zod v4 schema in `validators.onChange`. Read `features/sessions/calendar/QuickCreateSessionDialog.tsx` for the pattern: one `form.Field` per input, `form.Subscribe` with `schema.safeParse(state.values).success` for the submit button, `form.reset(...)` when the dialog reseeds.

Inline renames and autosave fields stay plain `useState`.

## Query keys

Every React Query key comes from `qk` in [`lib/query-keys.ts`](../../packages/frontend/src/lib/query-keys.ts). Inline `queryKey` literals fail `bun run lint:keys`.

Invalidation is prefix based, so `qk.entities.bySpace(id)` also refreshes `qk.entities.noteSummaries(id)`. Do not change an existing key's shape without checking every `invalidateQueries` that relies on it.

## Hotkeys

Shortcuts are named in [`lib/hotkeys.ts`](../../packages/frontend/src/lib/hotkeys.ts) and registered with `useAppHotkey` (works anywhere) or `useScreenHotkey` (page shortcuts, skipped while typing or while a dialog or menu is open) from `hooks/use-app-hotkey.ts`.

Handlers that need capture phase ordering or in gesture state keep their own listeners: context menu, right sidebar, select all, block handles, drag, time grid, PDF viewer and study session.

## Debouncing

Use `@tanstack/react-pacer`. A debounced save must flush on unmount (`onUnmount: (d) => d.flush()`) so a pending edit is never dropped.
