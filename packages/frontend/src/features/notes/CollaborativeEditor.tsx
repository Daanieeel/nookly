import { type PageSession, caretColor, presenceName } from "@nookly/shared/sync";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { useEditor } from "@tiptap/react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { PAGE_FRAGMENT } from "@nookly/shared/blocks";
import { useViewOnly } from "#/features/sync/view-only.ts";
import { syncRuntime, useSyncState } from "#/features/sync/sync-instance.ts";
import { trackActiveEditor } from "#/lib/active-editor.ts";
import { useSetting } from "#/lib/settings/settings.ts";
import { cn } from "@nookly/ui/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { editorExtensions } from "./editor-extensions";
import {
  EditorFrame,
  pageEditorProps,
  useEditorLookups,
  useFocusBlockRequest,
  useSectionsReport,
} from "./editor-hooks.tsx";
import type { PageSection } from "./heading-anchors";
import { usePasteFiles } from "./paste-files";

/// What another device says about its person in the document's awareness.
const presentUser = z.object({
  name: z.string().min(1),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .catch("#64748b"),
});

interface Present {
  clientId: number;
  name: string;
  color: string;
}

/// Who else has this page open right now, from the document's awareness.
function usePresence(session: PageSession): Present[] {
  const [present, setPresent] = useState<Present[]>([]);
  useEffect(() => {
    const awareness = session.provider.awareness;
    if (!awareness) return;
    const update = () => {
      const others: Present[] = [];
      for (const [clientId, state] of awareness.getStates()) {
        if (clientId === awareness.clientID) continue;
        const user = presentUser.safeParse(state.user);
        if (user.success) others.push({ clientId, ...user.data });
      }
      setPresent(others);
    };
    update();
    awareness.on("change", update);
    return () => awareness.off("change", update);
  }, [session]);
  return present;
}

function PresenceBar({ present }: { present: Present[] }) {
  if (present.length === 0) return null;
  return (
    <div
      role="group"
      aria-label="Also on this page"
      className="pointer-events-auto sticky top-0 z-10 float-right flex items-center -space-x-1.5"
    >
      {present.slice(0, 5).map((person) => (
        <Tooltip key={person.clientId}>
          <TooltipTrigger asChild>
            <span
              aria-label={person.name}
              className="flex size-6 items-center justify-center rounded-full border-2 border-background bg-(--presence) text-xs font-semibold text-white uppercase"
              // SAFETY: `--presence` only ever receives a hex color from `caretColor`.
              style={{ "--presence": person.color } as React.CSSProperties}
            >
              {person.name.slice(0, 1)}
            </span>
          </TooltipTrigger>
          <TooltipContent>{person.name} is here</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

/// The page editor on a live document (DECISIONS.md D6): typing merges with
/// everyone else's as it happens, offline too, with no saving step and never a
/// conflict. Other people's carets and names show where they are.
export function CollaborativeEditor({
  session,
  entityId,
  spaceId,
  compact,
  scrollPastEnd,
  onSectionsChange,
}: {
  session: PageSession;
  entityId: string;
  spaceId: string;
  compact: boolean;
  scrollPastEnd: boolean;
  onSectionsChange?: (sections: PageSection[]) => void;
}) {
  const lookups = useEditorLookups(spaceId, entityId);
  const pasteFiles = usePasteFiles(spaceId, entityId);
  const user = useSyncState((s) => s.user);
  const [displayName] = useSetting("general.displayName");
  // The device too, so two devices of one person tell apart: "Ada on Mac".
  const person = displayName.trim() || user?.username || "Someone";
  const name = presenceName(person, syncRuntime.device.name);
  const color = caretColor(user?.id ?? name);
  const viewOnly = useViewOnly(entityId, spaceId);
  const editable = !viewOnly && !session.readOnly;
  const editor = useEditor(
    {
      editable,
      extensions: [
        ...editorExtensions({ spaceId, pageId: entityId, ...lookups, collaborative: true }),
        // The document keeps its own history; the editor's undo follows it.
        Collaboration.configure({ document: session.doc, field: PAGE_FRAGMENT }),
        CollaborationCaret.configure({ provider: session.provider, user: { name, color } }),
      ],
      editorProps: pageEditorProps({ compact, scrollPastEnd, spaceId, pasteFiles }),
    },
    [session],
  );
  useEffect(() => (editor ? trackActiveEditor(editor) : undefined), [editor]);
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.setEditable(editable, false);
  }, [editor, editable]);
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.commands.updateUser({ name, color });
  }, [editor, name, color]);
  useSectionsReport(editor, onSectionsChange);
  // Block ids in a live document are the stored ids.
  useFocusBlockRequest(editor, entityId, (blockId) => blockId);
  const present = usePresence(session);
  return (
    <div className={cn(session.readOnly && "opacity-90")}>
      {session.readOnly && (
        <p className="mb-2 text-xs text-caution">
          This page was changed by a newer Nookly. Update to edit it here.
        </p>
      )}
      <EditorFrame
        editor={editor}
        entityId={entityId}
        resolveStoredId={async (blockId) => blockId}
        extra={pasteFiles.popover}
      >
        <PresenceBar present={present} />
      </EditorFrame>
    </div>
  );
}
