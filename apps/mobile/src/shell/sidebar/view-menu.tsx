import { type EntityRecord, renameEntity, restoreEntity, trashEntity } from "@nookly/shared/data";
import { IconMoodSmile, IconPencil, IconTrash } from "@tabler/icons-react-native";
import { useRouter } from "expo-router";
import { useLocalWrite } from "../../data/context.tsx";
import { SEPARATOR, type MenuEntry } from "../../ui/menu.tsx";
import { toast } from "../../ui/toast.ts";
import { RenameStep } from "./space-menu.tsx";

/// A saved View's menu (the desktop's `ViewActions`, 5.16), from a long press on its row:
/// renamed in a step, its icon changed, deleted with Undo.
export function useViewMenu() {
  const router = useRouter();
  const rename = useLocalWrite((db, input: { id: string; title: string }) =>
    renameEntity(db, input.id, input.title),
  );
  const trash = useLocalWrite((db, id: string) => trashEntity(db, id));
  const restore = useLocalWrite((db, id: string) => restoreEntity(db, id));
  return (view: EntityRecord): MenuEntry[] => [
    {
      label: "Rename",
      icon: IconPencil,
      page: () => (
        <RenameStep name={view.title} onRename={(title) => rename.mutate({ id: view.id, title })} />
      ),
    },
    {
      label: "Change Icon",
      icon: IconMoodSmile,
      onPress: () =>
        router.push({ pathname: "/pick/icon", params: { kind: "entity", id: view.id } }),
    },
    SEPARATOR,
    {
      label: "Delete View",
      icon: IconTrash,
      destructive: true,
      onPress: () => {
        trash.mutate(view.id);
        toast({
          title: `Deleted the View "${view.title || "Untitled"}"`,
          action: { label: "Undo", onPress: () => restore.mutate(view.id) },
        });
      },
    },
  ];
}
