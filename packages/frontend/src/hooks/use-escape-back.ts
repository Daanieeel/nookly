import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { isTyping } from "#/lib/is-typing.ts";
import { moduleForEntityType, viewAfterTrash } from "#/lib/modules.ts";
import { qk } from "#/lib/query-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import type { Entity } from "#/lib/api/types.ts";

/// Anything that is open on top of the page and takes the first Escape itself.
const OPEN_LAYERS =
  "[role=dialog],[role=alertdialog],[role=menu],[role=listbox],[data-radix-popper-content-wrapper],[data-owns-escape]";

/// Escape on a page (a file, jot, note, ...) goes back to the list it was opened
/// from, like Back. The first press closes whatever is open on top, or leaves the text
/// field being typed in, and only the next one goes back. The key's default is always
/// cancelled, so it never takes the window out of macOS fullscreen.
///
/// Two window listeners: the capture one looks at the page before anything handles the
/// key (a dialog closing removes itself from the DOM), the bubble one acts afterwards.
/// Neither cancels the key early, which would stop Radix from closing its layer.
export function useEscapeBack() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let backAllowed = false;

    const look = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      backAllowed =
        useNavStore.getState().view.kind === "entity" &&
        !isTyping() &&
        document.querySelector(OPEN_LAYERS) === null;
    };

    const act = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (isTyping()) {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        event.preventDefault();
        return;
      }
      // Something else (the editor's block selection, say) already used this press.
      const handled = event.defaultPrevented;
      event.preventDefault();
      if (!backAllowed || handled) return;
      const { view, backStack, goBack, setView } = useNavStore.getState();
      if (view.kind !== "entity") return;
      if (backStack.length > 0) {
        goBack();
        return;
      }
      const entity = queryClient.getQueryData<Entity>(qk.entity.byId(view.entityId));
      setView(
        entity && moduleForEntityType(entity.type) ? viewAfterTrash(entity) : { kind: "dashboard" },
      );
    };

    window.addEventListener("keydown", look, true);
    window.addEventListener("keydown", act);
    return () => {
      window.removeEventListener("keydown", look, true);
      window.removeEventListener("keydown", act);
    };
  }, [queryClient]);
}
