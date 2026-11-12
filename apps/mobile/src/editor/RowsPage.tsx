import { type PageSnapshot, openRowsPage, saveRowsPage, takeRowChanges } from "@nookly/shared/data";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import type * as Y from "yjs";
import { afterLocalWrite, useAppData } from "../data/context.tsx";
import { useBlocks } from "../data/queries.ts";
import { PageDocEditor } from "./LivePage.tsx";

/// How long after the last keystroke the page's rows are written.
const SAVE_DELAY_MS = 500;

/// A page edited with the page editor while it has no live document (an item's
/// description, a page made here the server has not seen yet, offline and never opened):
/// the same editor and `/` menu as a live page, on a document kept only on this phone and
/// written back as block rows. Only what was edited is written, so another device's edit of
/// another block is never put back to its old text (`@nookly/shared/data` `page-rows`).
export function RowsPage({
  entityId,
  editable,
  fill,
}: {
  entityId: string;
  editable: boolean;
  /// Whether the editor reaches down to the bottom of the screen (a page of its own).
  fill: boolean;
}) {
  const { db, sync } = useAppData();
  const queryClient = useQueryClient();
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const snapshot = useRef<PageSnapshot>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(Promise.resolve());

  useEffect(() => {
    let live = true;
    let opened: Y.Doc | null = null;
    const save = () => {
      if (!opened) return;
      const target = opened;
      saving.current = saving.current.then(async () => {
        snapshot.current = await saveRowsPage(db, entityId, target, snapshot.current);
        afterLocalWrite(queryClient, sync);
      });
    };
    // Blocks taken in from sync also land here; writing them back finds nothing changed.
    const onUpdate = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(save, SAVE_DELAY_MS);
    };
    void openRowsPage(db, entityId).then((page) => {
      if (!live) return;
      opened = page.doc;
      snapshot.current = page.snapshot;
      page.doc.on("update", onUpdate);
      setDoc(page.doc);
    });
    return () => {
      live = false;
      opened?.off("update", onUpdate);
      // Leaving the page writes what is still waiting.
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        save();
      }
    };
  }, [db, entityId, queryClient, sync]);

  // A block changed elsewhere (sync) comes into the open page unless it was edited here.
  const { data: blocks } = useBlocks(entityId);
  useEffect(() => {
    if (!doc || !blocks) return;
    saving.current = saving.current.then(async () => {
      if (timer.current) return;
      snapshot.current = await takeRowChanges(db, entityId, doc, snapshot.current);
    });
  }, [blocks, db, doc, entityId]);

  if (!doc) {
    return (
      <View className="min-h-40 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <PageDocEditor
      key={doc.guid}
      doc={doc}
      awareness={null}
      entityId={entityId}
      editable={editable}
      fill={fill}
    />
  );
}
