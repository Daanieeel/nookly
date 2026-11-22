import { IconLink, IconLogout, IconRefresh, IconSchool } from "@tabler/icons-react-native";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { useMoodleCalendar, useSetMoodleCalendar } from "../../moodle/queries.ts";
import { useMoodleService } from "../../moodle/service.tsx";
import { Button, statusOf } from "../../ui/Button.tsx";
import { UrlField } from "../../ui/UrlField.tsx";
import { FormSection } from "../../ui/kit/Form.tsx";
import { GroupedSection } from "../../ui/kit/GroupedSection.tsx";
import { IconBadge } from "../../ui/kit/IconBadge.tsx";
import { ListRow } from "../../ui/kit/ListRow.tsx";
import { Text } from "../../ui/Text.tsx";
import { useTheme } from "../../ui/theme.ts";
import { ago } from "../dates.ts";

/// Calendar connections, as the desktop's dialog: Moodle's deadlines and classes from the
/// site's calendar export link, shown on the calendar and never changed. Google Calendar and
/// iCloud are only on the desktop for now.

function ConnectMoodleCalendar() {
  const { calendar } = useMoodleService();
  const set = useSetMoodleCalendar();
  const [link, setLink] = useState("");
  const connect = useMutation({ mutationFn: calendar.connect, onSuccess: set });
  return (
    <View className="gap-3">
      <Text variant="small" tone="muted" className="px-4">
        Moodle shows your deadlines and classes as a calendar link, which also works when your
        university uses single sign on. In Moodle, open Calendar, then Import or export calendars.
        Choose Export calendar, pick the events and period, then Get calendar URL. Paste the link
        below and treat it like a password.
      </Text>
      <FormSection>
        <UrlField
          label="Calendar link"
          icon={IconLink}
          placeholder="moodle.example.edu/calendar/export_execute.php?..."
          secureTextEntry
          value={link}
          onValueChange={setLink}
          onSubmitEditing={() => link.trim() && connect.mutate(link)}
        />
      </FormSection>
      {connect.error ? (
        <Text tone="destructive" className="px-4">
          {connect.error.message}
        </Text>
      ) : null}
      <View className="items-start px-4">
        <Button
          label="Connect Moodle"
          variant="secondary"
          status={statusOf(connect)}
          disabled={!link.trim()}
          onPress={() => connect.mutate(link)}
        />
      </View>
    </View>
  );
}

export function CalendarConnectionsPage() {
  const theme = useTheme();
  const { calendar } = useMoodleService();
  const set = useSetMoodleCalendar();
  const { data: feed, isPending } = useMoodleCalendar();
  const refresh = useMutation({ mutationFn: calendar.sync, onSuccess: set });
  const disconnect = useMutation({
    mutationFn: calendar.disconnect,
    onSuccess: () => set(null),
  });
  if (isPending) return null;
  const count = feed?.events.length ?? 0;
  return (
    <View className="gap-5">
      <Text variant="small" tone="muted" className="px-4">
        Show events from your own calendars next to your sessions. Nookly only reads them and never
        changes anything in your calendars.
      </Text>
      {feed ? (
        <>
          <GroupedSection title="Moodle" margin={0}>
            <ListRow
              badge={<IconBadge glyph={IconSchool} tint="blue" />}
              title={feed.site}
              subtitle={
                feed.syncedAt ? `Updated ${ago(new Date(feed.syncedAt).toISOString())}` : undefined
              }
              detail={`${count} ${count === 1 ? "event" : "events"}`}
            />
          </GroupedSection>
          {feed.error ? (
            <Text tone="caution" className="px-4">
              {feed.error}
            </Text>
          ) : null}
          <View className="flex-row flex-wrap gap-2 px-4">
            <Button
              label="Refresh Now"
              variant="secondary"
              icon={<IconRefresh size={16} color={theme.colors.foreground} />}
              status={statusOf(refresh)}
              onPress={() => refresh.mutate()}
            />
            <Button
              label="Disconnect Moodle"
              variant="ghost"
              icon={<IconLogout size={16} color={theme.colors.foreground} />}
              status={statusOf(disconnect)}
              onPress={() => disconnect.mutate()}
            />
          </View>
        </>
      ) : (
        <ConnectMoodleCalendar />
      )}
    </View>
  );
}
