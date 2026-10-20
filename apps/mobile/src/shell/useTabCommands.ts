import { useRouter } from "expo-router";
import { tabActions, useTabs } from "./tabs-store.ts";

/// What the person does with tabs: each changes the tabs and shows the page of the tab
/// that is open after.
export function useTabCommands() {
  const router = useRouter();
  const show = () => {
    const { tabs, active } = useTabs.getState().state;
    const path = tabs.find((t) => t.id === active)?.path ?? "/";
    router.navigate(path);
  };
  return {
    open: () => {
      tabActions.open();
      show();
    },
    select: (id: string) => {
      tabActions.select(id);
      show();
    },
    close: (id: string) => {
      tabActions.close(id);
      show();
    },
    closeOthers: (id: string) => {
      tabActions.closeOthers(id);
      show();
    },
    step: (offset: number) => {
      tabActions.step(offset);
      show();
    },
    /// Shows `path` beside the page, in the tab that is open.
    split: (path: string | null) => tabActions.setRight(path),
  };
}
