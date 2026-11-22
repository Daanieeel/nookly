import { UNSORTED_VIEW, needsUnsortedView } from "@nookly/shared/file-views";
import { createView } from "@nookly/shared/data";
import { useEffect } from "react";
import { z } from "zod";
import { useLocalWrite } from "../data/context.tsx";
import { usePreference } from "../data/preferences.ts";
import { useViews } from "../data/queries.ts";

const done = z.boolean();

/// Where this phone remembers that a Space got its starter views.
export const starterViewsKey = (spaceId: string) => `files.starterViews.${spaceId}`;

/// Gives a Space the Unsorted view on its first visit to Files, unless it has one like it,
/// as the desktop does. Once per Space on this phone, so a deleted one stays deleted.
export function useStarterViews(spaceId: string) {
  const { data: views, isSuccess } = useViews({ spaceId, module: "files" });
  const [started, markStarted] = usePreference(starterViewsKey(spaceId), done, false);
  const add = useLocalWrite((db, _: undefined) =>
    createView(db, spaceId, {
      title: UNSORTED_VIEW.title,
      module: "files",
      config: UNSORTED_VIEW.config,
    }),
  );
  const { mutate } = add;
  useEffect(() => {
    if (!isSuccess || started) return;
    markStarted(true);
    if (needsUnsortedView(views.map((v) => ({ title: v.entity.title, config: v.config })))) {
      mutate(undefined);
    }
  }, [isSuccess, started, views, markStarted, mutate]);
}
