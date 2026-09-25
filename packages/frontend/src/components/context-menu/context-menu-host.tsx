import { IconCheck, type Icon as TablerIcon } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  type ActionStatus,
  StatusAnnouncer,
  StatusIcon,
  SUCCESS_REVERT_MS,
  statusTextClass,
} from "#/components/action-feedback.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@nookly/ui/components/dropdown-menu";
import { Popover, PopoverAnchor, PopoverContent } from "@nookly/ui/components/popover";
import { useNavStore } from "#/lib/store/nav.ts";
import {
  ACTION_GROUPS,
  type ActionResult,
  actionsFor,
  type AnyContextTarget,
  claimFor,
  type EntityTarget,
  entityRegistrationFor,
  type MenuAction,
  type MenuHelpers,
  type MenuSubItem,
} from "./registry";
import { captureTextTarget, editableAt, type TextTarget } from "./text-actions";

interface OpenMenu {
  id: number;
  x: number;
  y: number;
  target: AnyContextTarget | null;
  text: TextTarget | null;
  /// Focus to hand back once the menu (and anything it opened) is gone.
  returnFocus: HTMLElement | null;
}

interface Overlay {
  kind: "dialog" | "popover";
  render: (close: () => void) => ReactNode;
}

/// Marks the menu's own content (`data-context-menu-content` below), so
/// right-clicking inside an open menu is ignored.
const MENU_CONTENT_SELECTOR = "[data-context-menu-content]";

/// Only trashed entities' own recovery and navigation make sense in a menu.
const TRASHED_ENTITY_ACTIONS = new Set(["open", "restore", "copy-link"]);

function isLabelFn<T>(label: string | ((target: T) => string)): label is (target: T) => string {
  return typeof label === "function";
}

function isIconFn<T>(
  icon: TablerIcon | ((target: T) => TablerIcon),
): icon is (target: T) => TablerIcon {
  return typeof icon === "function";
}

function isPending(result: ActionResult): result is Promise<boolean | void> {
  return result instanceof Promise;
}

/// A point to open a keyboard-triggered menu at: the caret inside editable text,
/// otherwise just inside the focused element's top left corner.
function keyboardAnchor(element: Element) {
  const selection = window.getSelection();
  if (editableAt(element) && selection && selection.rangeCount > 0) {
    const caret = selection.getRangeAt(0).getBoundingClientRect();
    if (caret.width || caret.height) return { x: caret.left, y: caret.bottom };
  }
  const box = element.getBoundingClientRect();
  return {
    x: Math.max(0, box.left + Math.min(16, box.width / 2)),
    y: Math.max(0, box.top + Math.min(box.height / 2, 24)),
  };
}

/// Owns every right-click in the app (custom context menus plan §1). The native
/// webview menu is cancelled in the capture phase, before anything else sees the
/// event, so it can never appear. After React's own handlers have run, and marked
/// the target through `contextTarget`, the menu for that target opens at the
/// pointer. Shift+F10 and the context menu key open the same menu for whatever
/// has focus.
export function ContextMenuHost() {
  const queryClient = useQueryClient();
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [open, setOpen] = useState(false);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const menuRef = useRef(menu);
  menuRef.current = menu;
  /// Waiting for the menu to finish closing: an overlay to show, or an
  /// `afterClose` action to run once focus is back on the right-clicked element.
  const pendingOverlayRef = useRef<Overlay | null>(null);
  const pendingRunRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let nextId = 1;
    const handled = new WeakSet<Event>();

    const openFor = (event: MouseEvent) => {
      if (handled.has(event)) return;
      handled.add(event);
      const clicked = event.target;
      if (clicked instanceof Element && clicked.closest(MENU_CONTENT_SELECTOR)) return;
      // An open menu turns pointer events off for the page, so a right-click
      // elsewhere lands on the root element: it only closes the menu.
      if (clicked === document.documentElement) {
        setOpen(false);
        return;
      }
      const editable = editableAt(clicked);
      const focused = document.activeElement;
      setMenu({
        id: nextId++,
        x: event.clientX,
        y: event.clientY,
        target: claimFor(event) ?? null,
        text: editable ? captureTextTarget(editable) : null,
        returnFocus: editable ?? (focused instanceof HTMLElement ? focused : null),
      });
      setOpen(true);
    };

    // Capture on window runs first, so nothing can let the native menu through.
    // The menu itself opens from the document's bubble phase, after React's root
    // listener has recorded claims; the timeout covers a handler that stopped
    // propagation on the way.
    const onCapture = (event: MouseEvent) => {
      event.preventDefault();
      setTimeout(() => openFor(event), 0);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
      event.preventDefault();
      const focused = document.activeElement ?? document.body;
      const { x, y } = keyboardAnchor(focused);
      focused.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          button: 2,
        }),
      );
    };

    // A popover (a picker, the quick create Task form) closes when focus moves
    // outside it, which a context menu opened from inside it would trigger. Radix
    // checks that on the document; stopping focus changes within the menu at the
    // root element, after React has handled them, keeps whatever the menu was
    // opened over in place.
    const keepLayersOpen = (event: FocusEvent) => {
      if (event.target instanceof Element && event.target.closest(MENU_CONTENT_SELECTOR)) {
        event.stopPropagation();
      }
    };

    window.addEventListener("contextmenu", onCapture, true);
    document.addEventListener("contextmenu", openFor);
    window.addEventListener("keydown", onKeyDown, true);
    document.documentElement.addEventListener("focusin", keepLayersOpen);
    return () => {
      window.removeEventListener("contextmenu", onCapture, true);
      document.removeEventListener("contextmenu", openFor);
      window.removeEventListener("keydown", onKeyDown, true);
      document.documentElement.removeEventListener("focusin", keepLayersOpen);
    };
  }, []);

  // Escape closes the menu first, even when a tooltip that opened under the
  // pointer sits above it in Radix's layer stack and would take the key.
  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", onEscape, true);
    return () => window.removeEventListener("keydown", onEscape, true);
  }, [open]);

  const returnFocus = useCallback(() => {
    const element = menuRef.current?.returnFocus;
    if (element?.isConnected) element.focus({ preventScroll: true });
  }, []);

  const closeOverlay = useCallback(() => {
    setOverlay(null);
    returnFocus();
  }, [returnFocus]);

  const helpers = useMemo<MenuHelpers>(
    () => ({
      queryClient,
      close: () => setOpen(false),
      openDialog: (render) => {
        pendingOverlayRef.current = { kind: "dialog", render };
        setOpen(false);
      },
      openPopover: (render) => {
        pendingOverlayRef.current = { kind: "popover", render };
        setOpen(false);
      },
      refresh: () => queryClient.invalidateQueries(),
    }),
    [queryClient],
  );

  const runAfterClose = useCallback((run: () => void) => {
    pendingRunRef.current = run;
    setOpen(false);
  }, []);

  // SAFETY: both custom properties only ever receive pixel lengths from the
  // pointer's client coordinates. `CSSProperties` just doesn't model them.
  const anchorVars = {
    "--menu-x": `${menu?.x ?? 0}px`,
    "--menu-y": `${menu?.y ?? 0}px`,
  } as CSSProperties;

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <span
            aria-hidden
            tabIndex={-1}
            className="pointer-events-none fixed top-(--menu-y) left-(--menu-x) size-0"
            style={anchorVars}
          />
        </DropdownMenuTrigger>
        {menu && (
          <DropdownMenuContent
            key={menu.id}
            data-context-menu-content=""
            align="start"
            side="bottom"
            sideOffset={2}
            collisionPadding={8}
            className="min-w-52"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              const pendingOverlay = pendingOverlayRef.current;
              pendingOverlayRef.current = null;
              if (pendingOverlay) {
                setOverlay(pendingOverlay);
                return;
              }
              returnFocus();
              const run = pendingRunRef.current;
              pendingRunRef.current = null;
              run?.();
            }}
          >
            <MenuBody menu={menu} helpers={helpers} runAfterClose={runAfterClose} />
          </DropdownMenuContent>
        )}
      </DropdownMenu>

      {overlay?.kind === "dialog" && overlay.render(closeOverlay)}
      {overlay?.kind === "popover" && (
        <Popover open onOpenChange={(next) => !next && closeOverlay()}>
          <PopoverAnchor asChild>
            <span
              aria-hidden
              className="pointer-events-none fixed top-(--menu-y) left-(--menu-x) size-0"
              style={anchorVars}
            />
          </PopoverAnchor>
          <PopoverContent align="start" collisionPadding={8} className="w-72">
            {overlay.render(closeOverlay)}
          </PopoverContent>
        </Popover>
      )}
    </>
  );
}

interface SectionProps {
  helpers: MenuHelpers;
  runAfterClose: (run: () => void) => void;
  /// Renders a separator first, when this section has anything to show.
  separated: boolean;
}

function MenuBody({
  menu,
  helpers,
  runAfterClose,
}: {
  menu: OpenMenu;
  helpers: MenuHelpers;
  runAfterClose: (run: () => void) => void;
}) {
  const spaceId = useNavStore((s) => s.activeSpaceId);
  const { target, text } = menu;
  const props = { helpers, runAfterClose };
  // Plain text fields get only their own actions; anything else falls back to
  // the app menu rather than to nothing.
  const fallback =
    text && !target ? null : (
      <ActionList {...props} separated={false} actions={actionsFor("app")} target={{ spaceId }} />
    );

  return (
    <>
      {text && (
        <ActionList {...props} separated={false} actions={actionsFor("text")} target={text} />
      )}
      {target?.kind === "entity" ? (
        <EntitySection {...props} separated={Boolean(text)} target={target.data} />
      ) : target ? (
        <TargetSection {...props} separated={Boolean(text)} target={target} fallback={fallback} />
      ) : (
        fallback
      )}
    </>
  );
}

function TargetSection({
  target,
  fallback,
  ...props
}: SectionProps & { target: AnyContextTarget; fallback: ReactNode }) {
  return (
    <ActionList
      {...props}
      actions={actionsFor(target.kind)}
      target={target.data}
      fallback={fallback}
    />
  );
}

function noRecord() {
  return undefined;
}

/// The baseline every entity gets, plus its type's own actions and record. The
/// hook picked here stays the same for the section's lifetime: the menu content
/// remounts for every new right-click.
function EntitySection({ target, ...props }: SectionProps & { target: EntityTarget }) {
  const registration = entityRegistrationFor(target.entity.type);
  const useRecord = registration?.useRecord ?? noRecord;
  const loaded = useRecord(target.entity);
  const resolved: EntityTarget = { entity: target.entity, record: target.record ?? loaded };

  const own = registration?.actions ?? [];
  const baseline = actionsFor("entity").filter(
    (action) => !registration?.omit.has(action.id) && !own.some((o) => o.id === action.id),
  );
  const all = [...baseline, ...own];
  const actions = target.entity.deletedAt
    ? all.filter((action) => TRASHED_ENTITY_ACTIONS.has(action.id))
    : all;

  return <ActionList {...props} actions={actions} target={resolved} />;
}

function ActionList<T>({
  actions,
  target,
  helpers,
  runAfterClose,
  separated,
  fallback = null,
}: SectionProps & { actions: MenuAction<T>[]; target: T; fallback?: ReactNode }) {
  const visible = actions
    .filter((action) => action.when?.(target) ?? true)
    .map((action, index) => ({ action, index }))
    .sort(
      (a, b) =>
        ACTION_GROUPS.indexOf(a.action.group) - ACTION_GROUPS.indexOf(b.action.group) ||
        a.index - b.index,
    )
    .map(({ action }) => action);

  if (visible.length === 0) return fallback;

  return (
    <>
      {separated && <DropdownMenuSeparator />}
      {visible.map((action, index) => (
        <MenuEntry
          key={action.id}
          separated={index > 0 && visible[index - 1].group !== action.group}
        >
          {action.useItems ? (
            <SubmenuAction action={action} target={target} helpers={helpers} />
          ) : (
            <ActionItem
              action={action}
              target={target}
              helpers={helpers}
              runAfterClose={runAfterClose}
            />
          )}
        </MenuEntry>
      ))}
    </>
  );
}

function MenuEntry({ separated, children }: { separated: boolean; children: ReactNode }) {
  return (
    <>
      {separated && <DropdownMenuSeparator />}
      {children}
    </>
  );
}

/// Runs an action with in place feedback (docs/05-ui-ux-direction.md): pending
/// while its promise runs, then the menu closes; on error the item says so and
/// the menu stays open. `successLabel` confirms in place instead of closing.
function useFeedbackRun(helpers: MenuHelpers, successLabel: string | undefined) {
  const [status, setStatus] = useState<ActionStatus>("idle");
  useEffect(() => {
    if (status !== "success") return;
    const timer = setTimeout(() => setStatus("idle"), SUCCESS_REVERT_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const run = (action: () => ActionResult) => {
    if (status === "pending") return;
    let result: ActionResult;
    try {
      result = action();
    } catch {
      setStatus("error");
      return;
    }
    if (!isPending(result)) {
      helpers.close();
      return;
    }
    setStatus("pending");
    result.then(
      (done) => {
        if (done === false) setStatus("idle");
        else if (successLabel) setStatus("success");
        else helpers.close();
      },
      () => setStatus("error"),
    );
  };
  return { status, run };
}

function FeedbackLabel({
  status,
  label,
  successLabel,
  errorLabel,
}: {
  status: ActionStatus;
  label: string;
  successLabel: string | undefined;
  errorLabel: string;
}) {
  const shown =
    status === "success" && successLabel ? successLabel : status === "error" ? errorLabel : label;
  return (
    <>
      <span className={statusTextClass(status)}>{shown}</span>
      <StatusAnnouncer
        message={
          status === "success" ? (successLabel ?? null) : status === "error" ? errorLabel : null
        }
      />
    </>
  );
}

function defaultErrorLabel(label: string): string {
  return `Couldn't ${label.charAt(0).toLowerCase()}${label.slice(1).replace(/\.+$|…$/u, "")}, try again`;
}

function ActionItem<T>({
  action,
  target,
  helpers,
  runAfterClose,
}: {
  action: MenuAction<T>;
  target: T;
  helpers: MenuHelpers;
  runAfterClose: (run: () => void) => void;
}) {
  const { status, run } = useFeedbackRun(helpers, action.successLabel);
  const label = isLabelFn(action.label) ? action.label(target) : action.label;
  const Icon = isIconFn(action.icon) ? action.icon(target) : action.icon;
  const errorLabel = action.errorLabel ?? defaultErrorLabel(label);
  const perform = action.run;

  return (
    <DropdownMenuItem
      variant={action.destructive ? "destructive" : "default"}
      disabled={!perform || (action.disabled?.(target) ?? false)}
      onSelect={(event) => {
        event.preventDefault();
        if (!perform) return;
        if (!action.afterClose) {
          run(() => perform(target, helpers));
          return;
        }
        runAfterClose(() => {
          const result = perform(target, helpers);
          if (isPending(result)) result.catch(() => toast.error(errorLabel));
        });
      }}
    >
      <StatusIcon
        status={status}
        idle={
          <Icon
            size={14}
            className={
              action.destructive ? "shrink-0 text-destructive" : "shrink-0 text-muted-foreground"
            }
          />
        }
      />
      <FeedbackLabel
        status={status}
        label={label}
        successLabel={action.successLabel}
        errorLabel={errorLabel}
      />
      {action.shortcut && (
        <span className="ml-auto pl-4 text-xs text-muted-foreground">{action.shortcut}</span>
      )}
    </DropdownMenuItem>
  );
}

function SubmenuAction<T>({
  action,
  target,
  helpers,
}: {
  action: MenuAction<T>;
  target: T;
  helpers: MenuHelpers;
}) {
  const label = isLabelFn(action.label) ? action.label(target) : action.label;
  const Icon = isIconFn(action.icon) ? action.icon(target) : action.icon;
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="gap-2" disabled={action.disabled?.(target) ?? false}>
        <Icon size={14} className="shrink-0 text-muted-foreground" />
        {label}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent
          data-context-menu-content=""
          className="max-h-80 min-w-44 overflow-y-auto"
        >
          <SubmenuItems action={action} target={target} helpers={helpers} />
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}

/// Mounted only while the submenu is open, so `useItems` loads on demand.
function SubmenuItems<T>({
  action,
  target,
  helpers,
}: {
  action: MenuAction<T>;
  target: T;
  helpers: MenuHelpers;
}) {
  const useItems = action.useItems ?? noItems;
  const items = useItems(target);
  if (!items) {
    return <DropdownMenuItem disabled>Loading…</DropdownMenuItem>;
  }
  if (items.length === 0) {
    return <DropdownMenuItem disabled>{action.emptyLabel ?? "Nothing here yet"}</DropdownMenuItem>;
  }
  return items.map((item) => <SubmenuItem key={item.id} item={item} helpers={helpers} />);
}

function noItems(): MenuSubItem[] {
  return [];
}

function SubmenuItem({ item, helpers }: { item: MenuSubItem; helpers: MenuHelpers }) {
  const { status, run } = useFeedbackRun(helpers, undefined);
  return (
    <DropdownMenuItem
      disabled={item.disabled}
      onSelect={(event) => {
        event.preventDefault();
        run(() => item.run(helpers));
      }}
    >
      <StatusIcon status={status} idle={item.icon ?? null} />
      <FeedbackLabel
        status={status}
        label={item.label}
        successLabel={undefined}
        errorLabel={defaultErrorLabel(`set ${item.label}`)}
      />
      {item.checked && <IconCheck size={14} className="ml-auto shrink-0 text-muted-foreground" />}
    </DropdownMenuItem>
  );
}
