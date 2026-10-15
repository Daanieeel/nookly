import { createJotFromText } from "@nookly/shared/data";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useLocalWrite } from "../data/context.tsx";
import { usePreference } from "../data/preferences.ts";
import { useSpaces } from "../data/queries.ts";
import { Button, statusOf } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { Screen } from "../ui/Screen.tsx";
import { SpacePicker } from "./SpacePicker.tsx";
import { z } from "zod";

/// Quick Jot: a thought, saved at once as a jot in the Space last used. Refine it into a
/// note later, from the Dashboard.
export function QuickJotScreen() {
  const router = useRouter();
  const { data: spaces = [] } = useSpaces();
  const [last, setLast] = usePreference<string | null>(
    "quick-jot.space",
    z.string().nullable(),
    null,
  );
  const space = spaces.find((s) => s.id === last)?.id ?? spaces[0]?.id ?? null;
  const [text, setText] = useState("");
  const save = useLocalWrite((db, body: string) => {
    if (!space) throw new Error("Make a Space first.");
    return createJotFromText(db, space, body);
  });
  const submit = () =>
    save.mutate(text, {
      onSuccess: () => {
        if (space) setLast(space);
        router.back();
      },
    });
  return (
    <Screen>
      <SpacePicker value={space} onChange={setLast} />
      <Field
        label="Jot"
        multiline
        autoFocus
        placeholder="What's on your mind?"
        value={text}
        onChangeText={setText}
        error={save.error?.message}
      />
      <Button
        label="Save Jot"
        status={statusOf(save)}
        errorLabel="Couldn't save"
        onPress={submit}
      />
    </Screen>
  );
}
