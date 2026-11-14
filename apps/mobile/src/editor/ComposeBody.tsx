import { pageBlocks } from "@nookly/shared/blocks";
import { type LocalDb, saveRowsPage } from "@nookly/shared/data";
import { useCallback, useEffect, useState } from "react";
import * as Y from "yjs";
import { PageDocEditor } from "./LivePage.tsx";

/// The body of something being made (a jot's text, a task's description): the page editor
/// with its `/` menu, on a document kept here until the thing exists.
export function useComposeDoc() {
  const [doc, setDoc] = useState(() => new Y.Doc());
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const check = () => setFilled(hasText(doc));
    doc.on("update", check);
    return () => doc.off("update", check);
  }, [doc]);
  /// A fresh, empty body for the next one.
  const reset = useCallback(() => {
    setDoc(new Y.Doc());
    setFilled(false);
  }, []);
  return { doc, filled, reset };
}

/// Whether the body holds any text yet.
export function hasText(doc: Y.Doc): boolean {
  return pageBlocks(doc).some((block) => block.content.trim() !== "");
}

/// Writes the body as the new item's blocks.
export async function saveComposeBody(db: LocalDb, entityId: string, doc: Y.Doc) {
  await saveRowsPage(db, entityId, doc, new Map());
}

export function ComposeBody({ doc, placeholder }: { doc: Y.Doc; placeholder: string }) {
  return (
    <PageDocEditor
      key={doc.guid}
      doc={doc}
      awareness={null}
      entityId="compose"
      editable
      fill={false}
      placeholder={placeholder}
    />
  );
}
