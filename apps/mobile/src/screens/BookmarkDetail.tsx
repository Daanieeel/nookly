import { listBookmarks, updateBookmark } from "@nookly/shared/data";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { Linking, View } from "react-native";
import { z } from "zod";
import { useDb, useLocalWrite } from "../data/context.tsx";
import { keys } from "../data/keys.ts";
import { Button, statusOf } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { useTheme } from "../ui/theme.ts";
import { fieldError } from "./forms.ts";

const schema = z.object({ url: z.url("Enter a web address"), description: z.string().max(2000) });

export function BookmarkDetail({ id, readOnly }: { id: string; readOnly: boolean }) {
  const theme = useTheme();
  const db = useDb();
  const { data: bookmark } = useQuery({
    queryKey: keys.bookmarks(null),
    queryFn: () => listBookmarks(db),
    select: (all) => all.find((b) => b.entity.id === id),
  });
  const save = useLocalWrite((d, input: z.infer<typeof schema>) =>
    updateBookmark(d, id, input.url, input.description || null),
  );
  const form = useForm({
    defaultValues: { url: bookmark?.url ?? "", description: bookmark?.description ?? "" },
    validators: { onChange: schema },
    onSubmit: ({ value }) => save.mutate(value),
  });
  if (!bookmark) return null;
  return (
    <View style={{ gap: theme.space(3) }}>
      <form.Field name="url">
        {(field) => (
          <Field
            label="Address"
            required
            value={field.state.value}
            editable={!readOnly}
            autoCapitalize="none"
            keyboardType="url"
            onChangeText={field.handleChange}
            onBlur={field.handleBlur}
            error={fieldError(field)}
          />
        )}
      </form.Field>
      <form.Field name="description">
        {(field) => (
          <Field
            label="Note"
            multiline
            value={field.state.value}
            editable={!readOnly}
            onChangeText={field.handleChange}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      <View style={{ flexDirection: "row", gap: theme.space(2) }}>
        <Button label="Open" onPress={() => void Linking.openURL(bookmark.url)} />
        {!readOnly ? (
          <Button
            label="Save"
            variant="primary"
            status={statusOf(save)}
            successLabel="Saved"
            errorLabel="Couldn't save"
            onPress={() => void form.handleSubmit()}
          />
        ) : null}
      </View>
    </View>
  );
}
