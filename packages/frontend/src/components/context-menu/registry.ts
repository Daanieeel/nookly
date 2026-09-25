import type { Icon as TablerIcon } from "@tabler/icons-react";
import type { QueryClient } from "@tanstack/react-query";
import type { MouseEvent, ReactNode } from "react";
import type { Entity } from "#/lib/api/types.ts";

/// App-wide right-click menus (docs/plans: custom context menus). Nothing here
/// knows about any module: a component marks what was right-clicked with
/// `contextTarget(kind, data)`, and modules register the actions for each kind
/// (and, for entities, per entity type) once, the same way they register their
/// schema for the CLI. The host (`context-menu-host.tsx`) resolves and renders.

/// What each kind of right-click target carries. Modules add their own kinds by
/// augmenting this interface:
///
/// ```ts
/// declare module "#/components/context-menu/registry.ts" {
///   interface ContextTargets { "tasks.column": { status: TaskStatus; startCreate: () => void } }
/// }
/// ```
export interface ContextTargets {
  /// Any entity row, card or header. Actions come from the baseline set plus
  /// whatever the entity's type registered with `registerEntityType`.
  entity: EntityTarget;
  /// Nothing more specific under the cursor: the app's fallback menu.
  app: AppTarget;
}

export type ContextKind = keyof ContextTargets;

export interface AppTarget {
  spaceId: string | null;
}

export interface EntityTarget<TRecord = EntityRecord> {
  entity: Entity;
  /// The module's own record for this entity (a `Task`, a `FileEntity`) when the
  /// view that rendered the row already has it; otherwise the type's `useRecord`.
  record?: TRecord;
}

/// Opaque placeholder for a type's record. Each registration narrows it through
/// its own generic, so no action ever sees it untyped.
export interface EntityRecord {
  entity: Entity;
}

/// Groups render in this order, divided by separators. `app` holds the app wide
/// fallbacks (Search, Quick Jot) that trail any contextual actions.
export const ACTION_GROUPS = [
  "open",
  "create",
  "type",
  "edit",
  "organize",
  "share",
  "danger",
  "app",
] as const;
export type ActionGroup = (typeof ACTION_GROUPS)[number];

/// Resolve `false` when the user backed out (a cancelled save dialog): the item
/// returns to rest instead of closing the menu.
export type ActionResult = void | Promise<boolean | void>;

export interface MenuHelpers {
  queryClient: QueryClient;
  /// Closes the menu. Idempotent.
  close: () => void;
  /// Closes the menu, then renders `render(close)` until it calls `close`. For
  /// confirmation dialogs and other overlays the action owns.
  openDialog: (render: (close: () => void) => ReactNode) => void;
  /// Like `openDialog`, but inside a popover anchored where the menu opened, for
  /// pickers (Relate to..., Convert to sub-task of...).
  openPopover: (render: (close: () => void) => ReactNode) => void;
  /// Refetches every query, like an external database change does.
  refresh: () => Promise<void>;
}

export interface MenuSubItem {
  id: string;
  label: string;
  icon?: ReactNode;
  checked?: boolean;
  disabled?: boolean;
  run: (helpers: MenuHelpers) => ActionResult;
}

export interface MenuAction<T> {
  id: string;
  group: ActionGroup;
  label: string | ((target: T) => string);
  icon: TablerIcon | ((target: T) => TablerIcon);
  shortcut?: string;
  destructive?: boolean;
  /// Hides the action for this target.
  when?: (target: T) => boolean;
  disabled?: (target: T) => boolean;
  /// A returned promise keeps the menu open with the item pending, then closes it
  /// on success. A rejection keeps it open on `errorLabel`.
  run?: (target: T, helpers: MenuHelpers) => ActionResult;
  /// Runs only once the menu has closed and focus is back where the right-click
  /// happened, for actions that edit the focused text. Having no control left to
  /// show a failure on, an error becomes a toast with `errorLabel`.
  afterClose?: boolean;
  /// Shown in place of the label on success, keeping the menu open (copy actions,
  /// whose result is otherwise invisible).
  successLabel?: string;
  errorLabel?: string;
  /// Turns the action into a submenu. Called as a hook while the submenu is open,
  /// so it may load data; `undefined` means still loading.
  useItems?: (target: T) => MenuSubItem[] | undefined;
  /// Shown when `useItems` returns no items.
  emptyLabel?: string;
}

/// Each list only ever holds the actions registered for its own kind. Stored
/// widened to `never` targets, which every action accepts.
const actionTable = new Map<ContextKind, MenuAction<never>[]>();

/// Adds actions to every target of `kind`. Called at module load, once per module.
export function registerActions<K extends ContextKind>(
  kind: K,
  actions: MenuAction<ContextTargets[K]>[],
) {
  actionTable.set(kind, [...(actionTable.get(kind) ?? []), ...actions]);
}

export function actionsFor<K extends ContextKind>(kind: K): MenuAction<ContextTargets[K]>[] {
  // SAFETY: `registerActions` files every action under the kind whose target
  // type it was written against, so this list holds only `ContextTargets[K]` actions.
  return (actionTable.get(kind) ?? []) as MenuAction<ContextTargets[K]>[];
}

export interface EntityTypeRegistration<TRecord> {
  /// Every entity `type` this registration covers, e.g. `["task", "sub_task"]`.
  types: string[];
  /// Added on top of the baseline. An action reusing a baseline id replaces it.
  actions?: MenuAction<EntityTarget<TRecord>>[];
  /// Baseline action ids that make no sense for these types (see `BASELINE_IDS`).
  omit?: BaselineActionId[];
  /// Loads the record when the right-clicked row didn't provide one. Called as a
  /// hook while the menu is open.
  useRecord?: (entity: Entity) => TRecord | undefined;
}

export const BASELINE_IDS = [
  "open",
  "duplicate",
  "pin",
  "relate",
  "move",
  "copy-link",
  "restore",
  "delete",
] as const;
export type BaselineActionId = (typeof BASELINE_IDS)[number];

/// Stored with the record type erased: `resolveEntityRegistration` only ever
/// hands a registration its own entity's record.
interface StoredEntityRegistration {
  actions: MenuAction<EntityTarget>[];
  omit: ReadonlySet<string>;
  useRecord?: (entity: Entity) => EntityRecord | undefined;
}

const entityRegistrations = new Map<string, StoredEntityRegistration>();

export function registerEntityType<TRecord extends EntityRecord>(
  registration: EntityTypeRegistration<TRecord>,
) {
  const stored: StoredEntityRegistration = {
    // SAFETY: a stored registration is only resolved for an entity of one of its
    // own `types`, whose record the rendering view or its own `useRecord` supplied,
    // so each action only ever receives the `TRecord` it was written against.
    actions: (registration.actions ?? []) as MenuAction<EntityTarget>[],
    omit: new Set(registration.omit ?? []),
    useRecord: registration.useRecord,
  };
  for (const type of registration.types) entityRegistrations.set(type, stored);
}

export function entityRegistrationFor(type: string): StoredEntityRegistration | undefined {
  return entityRegistrations.get(type);
}

// --- Marking targets ---------------------------------------------------------

export type AnyContextTarget = {
  [K in ContextKind]: { kind: K; data: ContextTargets[K] };
}[ContextKind];

const claims = new WeakMap<Event, AnyContextTarget>();

/// The innermost element's claim wins. A claim only counts when the element
/// really contains what was clicked: React bubbles events out of portals, and a
/// dialog rendered inside a list view must not inherit the list's menu.
function claim(event: MouseEvent<Element>, target: AnyContextTarget) {
  if (claims.has(event.nativeEvent)) return;
  const clicked = event.target;
  if (!(clicked instanceof Node) || !event.currentTarget.contains(clicked)) return;
  claims.set(event.nativeEvent, target);
}

/// Pairs a kind with its data as one `AnyContextTarget`.
export function makeTarget<K extends ContextKind>(
  kind: K,
  data: ContextTargets[K],
): AnyContextTarget {
  // SAFETY: `kind` and `data` are typed together by `K`, which is exactly one
  // member of the `AnyContextTarget` union.
  return { kind, data } as AnyContextTarget;
}

/// Spread onto the element a right-click should resolve to:
/// `<div {...contextTarget("entity", { entity })}>`.
export function contextTarget<K extends ContextKind>(kind: K, data: ContextTargets[K]) {
  return {
    onContextMenu: (event: MouseEvent<Element>) => claim(event, makeTarget(kind, data)),
  };
}

/// What `contextTarget` returns, for components that pass it through to an element.
export type ContextTargetProps = ReturnType<typeof contextTarget>;

/// For a surface whose target depends on where inside it the click landed (a
/// Note's blocks): `resolve` returns the target, or `undefined` to leave the
/// click to an outer claim.
export function contextTargetAt(
  resolve: (event: MouseEvent<Element>) => AnyContextTarget | undefined,
) {
  return {
    onContextMenu: (event: MouseEvent<Element>) => {
      if (claims.has(event.nativeEvent)) return;
      const target = resolve(event);
      if (target) claim(event, target);
    },
  };
}

export function claimFor(event: Event): AnyContextTarget | undefined {
  return claims.get(event);
}

/// `entity` targets are the common case, so they get a shorthand.
export function entityTarget(entity: Entity, record?: EntityRecord) {
  return contextTarget("entity", { entity, record });
}
