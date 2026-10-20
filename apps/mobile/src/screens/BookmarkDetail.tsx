import { getBookmarkDetails, setBookmarkMetadata, updateBookmark } from "@nookly/shared/data";
import { IconCalendarEvent, IconLink } from "@tabler/icons-react-native";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Image, Linking, View } from "react-native";
import { z } from "zod";
import { fetchPageMetadata } from "../data/bookmark-fetch.ts";
import { useDb, useLocalWrite } from "../data/context.tsx";
import { keys } from "../data/keys.ts";
import { Button, statusOf } from "../ui/Button.tsx";
import { useClipboard } from "../ui/clipboard.tsx";
import { Field } from "../ui/Field.tsx";
import { DetailsPart, MainPart, usePart } from "../ui/parts.tsx";
import { PropertyList } from "../ui/Property.tsx";
import { InfoRow } from "../ui/property-rows.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { dayLabel } from "./dates.ts";

const address = z.url("Enter a web address");

/// A bookmark: the page's picture, icon and description in the page; its address and
/// the rest in the details. What its page says is fetched once when the bookmark is first
/// opened and again on request.
export function BookmarkDetail({ id, readOnly }: { id: string; readOnly: boolean }) {
  const db = useDb();
  const part = usePart();
  const theme = useTheme();
  const clipboard = useClipboard();
  const { data: bookmark } = useQuery({
    queryKey: [...keys.entity(id), "bookmark"],
    queryFn: () => getBookmarkDetails(db, id),
  });
  const save = useLocalWrite((d, input: { url: string; description: string }) =>
    updateBookmark(d, id, input.url, input.description || null),
  );
  const refresh = useLocalWrite(async (d, url: string) =>
    setBookmarkMetadata(d, id, await fetchPageMetadata(url)),
  );
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const storedUrl = bookmark?.url;
  const storedNote = bookmark?.description;
  useEffect(() => setUrl(storedUrl ?? ""), [storedUrl]);
  useEffect(() => setNote(storedNote ?? ""), [storedNote]);
  // A bookmark never read is read once, quietly; offline it just stays as it is. Only the
  // page does it, so the details beside it don't ask twice.
  const unread = bookmark ? bookmark.fetchedAt === null : false;
  useEffect(() => {
    if (part !== "details" && unread && storedUrl && !readOnly) refresh.mutate(storedUrl);
    // Once per bookmark opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part, unread, storedUrl, readOnly]);
  if (!bookmark) return null;
  const urlError = address.safeParse(url).success ? undefined : "Enter a web address";
  const saveUrl = () => {
    if (!urlError && url !== bookmark.url) {
      save.mutate({ url: url.trim(), description: note });
    }
  };
  return (
    <>
      <MainPart>
        <View className="gap-3">
          {bookmark.previewImageUrl ? (
            <Image
              accessibilityLabel="Preview"
              source={{ uri: bookmark.previewImageUrl }}
              resizeMode="cover"
              className="aspect-[1.91] w-full rounded-lg bg-muted"
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
          <Field
            label="Note"
            multiline
            value={note}
            editable={!readOnly}
            onChangeText={setNote}
            onEndEditing={() =>
              note !== (bookmark.description ?? "") &&
              save.mutate({ url: bookmark.url, description: note })
            }
          />
          {refresh.error ? (
            <Text variant="small" tone="muted">
              {refresh.error.message} The page's details will come when you try again.
            </Text>
          ) : null}
          <View className="flex-row flex-wrap gap-2">
            <Button
              variant="secondary"
              label="Open in Browser"
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
          </View>
        </View>
      </MainPart>
      <DetailsPart>
        <View className="gap-3">
          <Field
            label="Address"
            required
            value={url}
            editable={!readOnly}
            autoCapitalize="none"
            keyboardType="url"
            onChangeText={setUrl}
            onEndEditing={saveUrl}
            error={url !== bookmark.url ? urlError : undefined}
          />
          <View className="items-start">
            <Button
              variant="ghost"
              label="Copy Address"
              onPress={() => void clipboard.copy(bookmark.url)}
            />
          </View>
          <PropertyList>
            <InfoRow
              icon={<IconLink size={20} color={theme.colors.mutedForeground} />}
              label="Key"
              value={bookmark.entity.key}
            />
            <InfoRow
              icon={<IconCalendarEvent size={20} color={theme.colors.mutedForeground} />}
              label="Added"
              value={dayLabel(bookmark.entity.createdAt.slice(0, 10))}
            />
          </PropertyList>
        </View>
      </DetailsPart>
    </>
  );
}
