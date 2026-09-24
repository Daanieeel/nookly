import {
  IconBookmark,
  IconCloudDownload,
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconFileUpload,
  IconFolderOpen,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { registerEntityType } from "@/components/context-menu/registry";
import { convertEntity } from "@/lib/api/entities";
import {
  copyFileIntoStorage,
  downloadLinkedFile,
  exportFile,
  listFiles,
  replaceFile,
  revealFile,
} from "@/lib/api/files";
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
      when: ({ record }) => Boolean(record?.localPath || record?.sourcePath),
      run: ({ entity }) => revealFile(entity.id),
    },
    {
      id: "download-local-copy",
      group: "type",
      label: "Download Local Copy",
      icon: IconCloudDownload,
      when: ({ record }) => Boolean(record?.url && !record.localPath && !record.sourcePath),
      run: async ({ entity }, helpers) => {
        const result = await downloadLinkedFile(entity.id);
        if (result.kind === "webpage") throw new Error("it's a webpage, not a file");
        await helpers.refresh();
      },
    },
    {
      id: "copy-into-storage",
      group: "type",
      label: "Copy into Nookly",
      icon: IconCopy,
      when: ({ record }) => Boolean(record?.sourcePath && !record.localPath),
      run: async ({ entity }, helpers) => {
        await copyFileIntoStorage(entity.id);
        await helpers.refresh();
      },
    },
    {
      id: "convert-to-bookmark",
      group: "type",
      label: "Convert to Bookmark",
      icon: IconBookmark,
      when: ({ record }) => Boolean(record?.url),
      run: async ({ entity }, helpers) => {
        await convertEntity(entity.id, "bookmark");
        await helpers.refresh();
      },
    },
    {
      id: "replace-file",
      group: "type",
      label: "Replace File…",
      icon: IconFileUpload,
      run: async ({ entity }, helpers) => {
        const picked = await open({ multiple: false, directory: false });
        if (!picked || Array.isArray(picked)) return false;
        await replaceFile(entity.id, picked);
        await helpers.refresh();
      },
    },
    {
      id: "save-copy",
      group: "type",
      label: "Save a Copy…",
      icon: IconDownload,
      when: ({ record }) => Boolean(record?.localPath || record?.sourcePath),
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
