import { type ImportPreview, importNooklyFile, previewNooklyFile } from "@nookly/shared/data";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import { Button, statusOf } from "../ui/Button.tsx";
import { useFilePicker } from "../ui/file-picker.tsx";
import { Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { useCloseSheet } from "../ui/sheet/route.tsx";
import { Text } from "../ui/Text.tsx";
import { useTargetSpace } from "./NewScreens.tsx";
import { SpacePicker } from "./SpacePicker.tsx";
import { CoursePicker } from "./StudyPickers.tsx";

/// What an import would make, as the desktop's import dialog lists it.
function PreviewCard({ preview }: { preview: ImportPreview }) {
  return (
    <Section title="This file holds">
      <View className="gap-1 p-4">
        <Text variant="heading">{preview.title || "Untitled"}</Text>
        {preview.facts.map((fact) => (
          <Text key={fact} tone="muted">
            {fact}
          </Text>
        ))}
        <Text tone="muted">
          {preview.count} {preview.countLabel}
          {preview.count === 1 ? "" : "s"}
        </Text>
        {preview.items.slice(0, 5).map((item, index) => (
          <Text
            // Lines of a file, in order, can repeat.
            // oxlint-disable-next-line react/no-array-index-key
            key={index}
            variant="small"
            tone="muted"
            numberOfLines={1}
          >
            {item.label}: {item.text}
          </Text>
        ))}
        {preview.converted > 0 ? (
          <Text variant="small" tone="caution">
            {preview.converted} {preview.converted === 1 ? "part arrives" : "parts arrive"} as plain
            text, since this phone has no editor for {preview.converted === 1 ? "it" : "them"}.
          </Text>
        ) : null}
      </View>
    </Section>
  );
}

/// Bring in a page, a task, a deck or an assignment from a Nookly file (saved on the
/// desktop or another phone): choose the file, check what it holds, then import it as a new
/// item in a Space.
export function ImportScreen({ spaceId }: { spaceId?: string }) {
  const router = useRouter();
  const close = useCloseSheet();
  const picker = useFilePicker();
  const [space, setSpace] = useTargetSpace(spaceId);
  const [text, setText] = useState<string | null>(null);
  const [course, setCourse] = useState<string | null>(null);
  const read = useMutation({
    mutationFn: async () => {
      const picked = await picker.pickText(["application/json", "text/plain"]);
      if (picked === null) return null;
      // Read before it is kept, so a file that is no good never shows as chosen.
      return { text: picked, preview: previewNooklyFile(picked) };
    },
    onSuccess: (read) => {
      if (read) {
        setText(read.text);
        setCourse(null);
      }
    },
  });
  const make = useLocalWrite((db, _: undefined) => {
    if (!space || text === null) throw new Error("Choose a file first.");
    return importNooklyFile(db, space, text, course);
  });
  const preview = read.data?.preview ?? null;
  const needsCourse = preview?.parentType === "course";
  return (
    <Screen>
      {spaceId ? null : <SpacePicker value={space} onChange={setSpace} />}
      <Button
        label="Choose File"
        variant="secondary"
        status={statusOf(read)}
        errorLabel="Couldn't read it"
        onPress={() => read.mutate()}
      />
      {read.error ? <Text tone="destructive">{read.error.message}</Text> : null}
      {preview ? <PreviewCard preview={preview} /> : null}
      {preview && needsCourse && space ? (
        <View className="gap-2">
          <Text variant="label" tone="muted">
            Goes in the course
          </Text>
          <CoursePicker spaceId={space} value={course} onChange={setCourse} />
        </View>
      ) : null}
      {make.error ? <Text tone="destructive">{make.error.message}</Text> : null}
      {preview ? (
        <Button
          label="Import"
          disabled={!space || (needsCourse && !course)}
          status={statusOf(make)}
          errorLabel="Couldn't import it"
          onPress={() =>
            make.mutate(undefined, { onSuccess: (id) => close(() => router.push(`/entity/${id}`)) })
          }
        />
      ) : null}
    </Screen>
  );
}
