import { pageBlocks } from "@nookly/shared/blocks";
import { createPage } from "@nookly/shared/data";
import { useState } from "react";
import { View } from "react-native";
import { z } from "zod";
import { useLocalWrite } from "../data/context.tsx";
import { usePreference } from "../data/preferences.ts";
import { useSpaces } from "../data/queries.ts";
import { ComposeBody, saveComposeBody, useComposeDoc } from "../editor/ComposeBody.tsx";
import { EditorToolbar } from "../editor/EditorToolbar.tsx";
import { ComposeFooter, ComposeHeader, PillSelect } from "../ui/sheet/Compose.tsx";
import { useCloseSheet } from "../ui/sheet/route.tsx";
import { Text } from "../ui/Text.tsx";
import { spaceOption } from "./option-badges.tsx";

/// Quick Jot, as Linear writes a new issue (D65): close, the Space it goes into and send
/// at the top, then the jot itself in the page editor, with its formatting on the
/// keyboard. Like the desktop's, a jot has no title: it is its text. It goes into the Space
/// used last; refine it into a note later, from the Dashboard.
export function QuickJotScreen() {
  const close = useCloseSheet();
  const { data: spaces = [] } = useSpaces();
  const [last, setLast] = usePreference<string | null>(
    "quick-jot.space",
    z.string().nullable(),
    null,
  );
  const space = spaces.find((s) => s.id === last)?.id ?? spaces[0]?.id ?? null;
  const body = useComposeDoc();
  const [error, setError] = useState<string | null>(null);
  const save = useLocalWrite(async (db, _: undefined) => {
    if (!space) throw new Error("Make a Space first.");
    const first = pageBlocks(body.doc).find((block) => block.content.trim() !== "");
    // Named by its first line, as a jot written in one text box always was.
    const title = (first?.content.split("\n")[0] ?? "").trim().slice(0, 80);
    const id = await createPage(db, space, "jot", title);
    await saveComposeBody(db, id, body.doc);
    return id;
  });
  const send = () =>
    save.mutate(undefined, {
      onSuccess: () => {
        if (space) setLast(space);
        close();
      },
      onError: (e) => setError(e.message),
    });
  return (
    <View className="gap-2">
      <ComposeHeader
        sendLabel="Save Jot"
        canSend={body.filled && space !== null && !save.isPending}
        onSend={send}
        context={
          <PillSelect
            label="Space"
            value={space}
            options={spaces.map(spaceOption)}
            onChange={setLast}
          />
        }
      />
      <ComposeBody doc={body.doc} placeholder="Jot something down" />
      {error ? (
        <Text tone="destructive" variant="small">
          {error}
        </Text>
      ) : null}
      <ComposeFooter toolbar={<EditorToolbar inline />} />
    </View>
  );
}
