import { IconDownload, IconExternalLink, IconFolderOpen } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { save } from "@tauri-apps/plugin-dialog";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { registerEntityType } from "@/components/context-menu/registry";
import { exportFile, listFiles } from "@/lib/api/files";
import type { Entity, FileEntity } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";

function useFileRecord(entity: Entity): FileEntity | undefined {
  const { data: files } = useQuery({
    queryKey: ["files", entity.spaceId],
    queryFn: () => listFiles(entity.spaceId),
  });
  return files?.find((f) => f.entity.id === entity.id);
}

const REVEAL_LABEL = navigator.userAgent.includes("Mac") ? "Reveal in Finder" : "Show in Folder";

registerEntityType<FileEntity>({
  types: ["file"],
  // A copy of an imported file would be a second copy of the same bytes.
  omit: ["duplicate"],
  useRecord: useFileRecord,
  actions: [
    {
      id: "open-link",
      group: "open",
      label: "Open Link",
      icon: IconExternalLink,
      when: ({ record }) => Boolean(record?.url),
      run: ({ record }) => (record?.url ? openUrl(record.url) : undefined),
    },
    {
      id: "reveal",
      group: "type",
      label: REVEAL_LABEL,
      icon: IconFolderOpen,
      when: ({ record }) => Boolean(record?.localPath),
      run: ({ record }) => (record?.localPath ? revealItemInDir(record.localPath) : undefined),
    },
    {
      id: "save-copy",
      group: "type",
      label: "Save a Copy…",
      icon: IconDownload,
      when: ({ record }) => Boolean(record?.localPath),
      run: async ({ entity, record }) => {
        const path = await save({
          defaultPath: record?.originalFilename ?? displayTitle(entity),
        });
        if (!path) return false;
        await exportFile(entity.id, path);
      },
    },
  ],
});
