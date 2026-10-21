import {
  DUPLICATE_TYPES,
  PORTABLE_TYPES,
  type EntityRecord,
  type LocalDb,
  duplicateEntity,
  exportNooklyFile,
  nooklyFileNoun,
  refineJot,
  restoreEntity,
  setPinned,
  trashEntity,
} from "@nookly/shared/data";
import { SHAREABLE_TYPES, isSharedSpace } from "@nookly/shared/api";
import {
  IconArrowUpRight,
  IconCopyPlus,
  IconFileExport,
  IconFingerprint,
  IconFolderShare,
  IconLayoutColumns,
  IconLayoutSidebarRight,
  IconLink,
  IconLinkPlus,
  IconMoodSmile,
  IconNotes,
  IconPinned,
  IconPinnedOff,
  IconRestore,
  IconShare,
  IconTag,
  IconTrash,
} from "@tabler/icons-react-native";
import { File, Paths } from "expo-file-system";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useSyncState, useWrite } from "../data/context.tsx";
import { useDetails } from "../shell/details-context.ts";
import { useSplit } from "../shell/split-context.ts";
import { useClipboard } from "../ui/clipboard.tsx";
import { type MenuEntry, SEPARATOR, useMenu } from "../ui/menu.tsx";
import { LabelPicker, MovePicker } from "./EntityPickers.tsx";
import { LinkPicker } from "./RelatedSection.tsx";

/// Saves an item as a Nookly file and hands it to the system's share sheet.
async function saveNooklyFile(db: LocalDb, entityId: string) {
  const { filename, text } = await exportNooklyFile(db, entityId);
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: filename });
  }
}

/// What can be done to an item, as the desktop's item menus hold it: the right click menu
/// (`context`, from a long press on its row) and the More menu of the open item (`more`,
/// which adds what only an open item has: its details, opening it beside). Grouped as on
/// the desktop, the Trash last.
export function useEntityActions() {
  const router = useRouter();
  const details = useDetails();
  const split = useSplit();
  const clipboard = useClipboard();
  const write = useWrite();
  const signedIn = useSyncState((s) => s.user !== null);
  return (entity: EntityRecord, where: "more" | "context"): MenuEntry[] => {
    if (entity.deletedAt) {
      return [
        {
          label: "Restore",
          icon: IconRestore,
          onPress: () => write((db) => restoreEntity(db, entity.id)),
        },
      ];
    }
    const shared = isSharedSpace(entity.spaceId);
    const view: MenuEntry[] =
      where === "context"
        ? [
            {
              label: "Open",
              icon: IconArrowUpRight,
              onPress: () => router.push(`/entity/${entity.id}`),
            },
          ]
        : [
            ...(details
              ? [{ label: "Show Details", icon: IconLayoutSidebarRight, onPress: details.show }]
              : []),
            ...(split
              ? [
                  {
                    label: "Open Beside",
                    icon: IconLayoutColumns,
                    onPress: () => split.show(`/entity/${entity.id}`),
                  },
                ]
              : []),
          ];
    const refine: MenuEntry[] =
      entity.type === "jot"
        ? [
            {
              label: "Refine into New Note",
              icon: IconNotes,
              onPress: () =>
                write(async (db) => {
                  const id = await refineJot(db, entity.id);
                  router.push(`/entity/${id}`);
                }),
            },
          ]
        : [];
    const edit: MenuEntry[] =
      DUPLICATE_TYPES.includes(entity.type) && !shared
        ? [
            {
              label: "Duplicate",
              icon: IconCopyPlus,
              onPress: () =>
                write(async (db) => {
                  const id = await duplicateEntity(db, entity.id);
                  router.push(`/entity/${id}`);
                }),
            },
          ]
        : [];
    const organize: MenuEntry[] = [
      {
        label: entity.pinned ? "Unpin" : "Pin",
        icon: entity.pinned ? IconPinnedOff : IconPinned,
        onPress: () => write((db) => setPinned(db, entity.id, !entity.pinned)),
      },
      {
        label: "Relate to…",
        icon: IconLinkPlus,
        page: () => <LinkPicker entityId={entity.id} />,
      },
      ...(entity.type !== "sub_task" && !shared
        ? [
            {
              label: "Move to Space",
              icon: IconFolderShare,
              page: () => <MovePicker entity={entity} />,
            },
          ]
        : []),
      {
        label: "Change Icon",
        icon: IconMoodSmile,
        onPress: () =>
          router.push({ pathname: "/pick/icon", params: { kind: "entity", id: entity.id } }),
      },
      {
        label: "Labels",
        icon: IconTag,
        page: () => <LabelPicker entityId={entity.id} spaceId={entity.spaceId} />,
      },
    ];
    const share: MenuEntry[] = [
      ...(signedIn && SHAREABLE_TYPES.some((t) => t === entity.type) && !shared
        ? [
            {
              label: "Share",
              icon: IconShare,
              onPress: () => router.push(`/new/share?entityId=${entity.id}`),
            },
          ]
        : []),
      // As the desktop copies it: pasted into a page, it becomes a mention of this item.
      {
        label: "Copy Link",
        icon: IconLink,
        onPress: () => void clipboard.copy(`[${entity.title || entity.key}](mention:${entity.id})`),
      },
      { label: "Copy ID", icon: IconFingerprint, onPress: () => void clipboard.copy(entity.key) },
      ...(PORTABLE_TYPES.includes(entity.type)
        ? [
            {
              label: `Save as Nookly ${nooklyFileNoun(entity.type)}`,
              icon: IconFileExport,
              onPress: () => write((db) => saveNooklyFile(db, entity.id)),
            },
          ]
        : []),
    ];
    const trash: MenuEntry = {
      label: "Move to Trash",
      icon: IconTrash,
      destructive: true,
      onPress: () => write((db) => trashEntity(db, entity.id)),
    };
    return [view, refine, edit, organize, share]
      .filter((group) => group.length > 0)
      .flatMap((group): MenuEntry[] => [...group, SEPARATOR])
      .concat(trash);
  };
}

/// Opens an item's menu, as a long press on its row or a tap on its More button does.
export function useEntityMenu() {
  const menu = useMenu();
  const actions = useEntityActions();
  return (entity: EntityRecord, where: "more" | "context" = "context") =>
    menu.show(entity.title || entity.key, actions(entity, where));
}
