import { getBookmarkDetails, setBookmarkMetadata, updateBookmark } from "@nookly/shared/data";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Image, Linking, View } from "react-native";
import { z } from "zod";
import { fetchPageMetadata } from "../data/bookmark-fetch.ts";
import { useDb, useLocalWrite } from "../data/context.tsx";
import { keys } from "../data/keys.ts";
import { Button, statusOf } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { Text } from "../ui/Text.tsx";
import { fieldError } from "./forms.ts";

const schema = z.object({ url: z.url("Enter a web address"), description: z.string().max(2000) });

/// A bookmark's address, its note and what its page says (icon, picture, description),
/// fetched once when the bookmark is first opened and again on request.
export function BookmarkDetail({ id, readOnly }: { id: string; readOnly: boolean }) {
  const db = useDb();
  const { data: bookmark } = useQuery({
    queryKey: [...keys.entity(id), "bookmark"],
    queryFn: () => getBookmarkDetails(db, id),
  });
  const save = useLocalWrite((d, input: z.infer<typeof schema>) =>
    updateBookmark(d, id, input.url, input.description || null),
  );
  const refresh = useLocalWrite(async (d, url: string) =>
    setBookmarkMetadata(d, id, await fetchPageMetadata(url)),
  );
  const form = useForm({
    defaultValues: { url: bookmark?.url ?? "", description: bookmark?.description ?? "" },
    validators: { onChange: schema },
    onSubmit: ({ value }) => save.mutate(value),
  });
  // A bookmark never read is read once, quietly; offline it just stays as it is.
  const unread = bookmark ? bookmark.fetchedAt === null : false;
  const url = bookmark?.url;
  useEffect(() => {
    if (unread && url && !readOnly) refresh.mutate(url);
    // Once per bookmark opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread, url, readOnly]);
  if (!bookmark) return null;
  return (
    <View className="gap-3">
      {bookmark.previewImageUrl ? (
        <Image
          accessibilityLabel="Preview"
          source={{ uri: bookmark.previewImageUrl }}
          resizeMode="cover"
          className="h-40 w-full rounded-lg bg-muted"
        />
      ) : null}
      <View className="flex-row items-center gap-2">
        {bookmark.faviconUrl ? (
          <Image
            accessibilityLabel="Icon"
            source={{ uri: bookmark.faviconUrl }}
            className="size-5 rounded"
          />
        ) : null}
        <Text variant="small" tone="muted" numberOfLines={1} className="flex-1">
          {bookmark.url}
        </Text>
      </View>
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
      {refresh.error ? (
        <Text variant="small" tone="muted">
          {refresh.error.message} The page's details will come when you try again.
        </Text>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        <Button
          variant="secondary"
          label="Open"
          onPress={() => void Linking.openURL(bookmark.url)}
        />
        {!readOnly ? (
          <Button
            variant="ghost"
            label="Refresh Details"
            status={statusOf(refresh)}
            successLabel="Updated"
            errorLabel="Couldn't reach it"
            onPress={() => refresh.mutate(bookmark.url)}
          />
        ) : null}
        {!readOnly ? (
          <Button
            label="Save"
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
