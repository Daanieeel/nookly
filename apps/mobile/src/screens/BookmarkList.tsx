import { type BookmarkRecord, createBookmark, setBookmarkMetadata } from "@nookly/shared/data";
import { CARD_CLASSES } from "@nookly/ui/classes";
import { IconArrowUp, IconBookmark, IconInfoCircle, IconLink } from "@tabler/icons-react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Image, Linking, Pressable, TextInput, View } from "react-native";
import { fetchPageMetadata } from "../data/bookmark-fetch.ts";
import { useLocalWrite } from "../data/context.tsx";
import { useBookmarks } from "../data/queries.ts";
import { IconButton } from "../ui/Button.tsx";
import { cn } from "../ui/classes.ts";
import { Grid } from "../ui/Grid.tsx";
import { ListTitle } from "../ui/ListBar.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";

const hostOf = (url: string) => url.replace(/^https?:\/\//, "").split("/")[0];

/// A bookmark as a rich link card: the page's picture, its icon and title, what it says, its
/// host and when it was added. Tapping it opens the link; the button in the corner opens its
/// details.
function BookmarkCard({ bookmark }: { bookmark: BookmarkRecord }) {
  const router = useRouter();
  const theme = useTheme();
  const added = new Date(bookmark.entity.createdAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
  return (
    <View className={cn(CARD_CLASSES, "gap-0 overflow-hidden py-0")}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={bookmark.entity.title}
        onPress={() => void Linking.openURL(bookmark.url)}
        className="active:opacity-80"
      >
        <View className="aspect-[1.91] items-center justify-center bg-muted">
          {bookmark.previewImageUrl ? (
            <Image
              source={{ uri: bookmark.previewImageUrl }}
              resizeMode="cover"
              className="size-full"
            />
          ) : (
            <IconBookmark size={32} color={theme.colors.mutedForeground} />
          )}
        </View>
        <View className="gap-1 p-3">
          <View className="flex-row items-center gap-2 pr-8">
            {bookmark.faviconUrl ? (
              <Image source={{ uri: bookmark.faviconUrl }} className="size-4 rounded" />
            ) : null}
            <Text numberOfLines={1} className="flex-1 font-medium">
              {bookmark.entity.title}
            </Text>
          </View>
          {bookmark.description ? (
            <Text variant="small" tone="muted" numberOfLines={2}>
              {bookmark.description}
            </Text>
          ) : null}
          <Text variant="small" tone="muted" numberOfLines={1}>
            {`${hostOf(bookmark.url)} · ${added}`}
          </Text>
        </View>
      </Pressable>
      <View className="absolute right-1 top-1">
        <IconButton
          label={`Details of ${bookmark.entity.title}`}
          icon={<IconInfoCircle size={20} color={theme.colors.mutedForeground} />}
          onPress={() => router.push(`/entity/${bookmark.entity.id}`)}
        />
      </View>
    </View>
  );
}

/// A Space's Bookmarks as rich link cards, with a bar under them to paste a URL: the page is
/// read for its title, icon, picture and description once there is a connection.
export function BookmarkList({ spaceId }: { spaceId: string }) {
  const theme = useTheme();
  const { data: bookmarks = [] } = useBookmarks(spaceId);
  const [url, setUrl] = useState("");
  // The page is read after the bookmark is saved; offline it is read when the bookmark is
  // opened.
  const read = useLocalWrite(async (db, input: { id: string; link: string }) =>
    setBookmarkMetadata(db, input.id, await fetchPageMetadata(input.link)),
  );
  const save = useLocalWrite(async (db, address: string) => {
    const link = /^[a-z]+:\/\//i.test(address.trim())
      ? address.trim()
      : `https://${address.trim()}`;
    return { id: await createBookmark(db, spaceId, link), link };
  });
  const submit = () =>
    url.trim() &&
    save.mutate(url, {
      onSuccess: (made) => {
        setUrl("");
        read.mutate(made);
      },
    });
  return (
    <View className="gap-4">
      <ListTitle title="Bookmarks" count={bookmarks.length} />
      {bookmarks.length === 0 ? (
        <Text tone="muted" className="p-4 text-center">
          No bookmarks yet. Paste a URL below to save one.
        </Text>
      ) : (
        <Grid min={280} max={3}>
          {bookmarks.map((b) => (
            <BookmarkCard key={b.entity.id} bookmark={b} />
          ))}
        </Grid>
      )}
      <View className={cn(CARD_CLASSES, "flex-row items-center gap-2 p-3")}>
        <IconLink size={18} color={theme.colors.mutedForeground} />
        <TextInput
          accessibilityLabel="Paste a URL to save it"
          value={url}
          onChangeText={setUrl}
          onSubmitEditing={submit}
          placeholder="Paste a URL to save it"
          placeholderTextColor={theme.colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          className="h-10 flex-1 font-sans text-sm text-foreground"
        />
        {url.trim() ? (
          <IconButton
            label="Save Bookmark"
            icon={<IconArrowUp size={20} color={theme.colors.foreground} />}
            onPress={submit}
          />
        ) : null}
      </View>
      {save.error ? <Text tone="destructive">{save.error.message}</Text> : null}
    </View>
  );
}
