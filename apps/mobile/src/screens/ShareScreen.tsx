import type { ShareRole } from "@nookly/shared/api";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { z } from "zod";
import { useAppData } from "../data/context.tsx";
import { keys } from "../data/keys.ts";
import { Badge } from "../ui/Badge.tsx";
import {
  SEGMENTED_CLASSES,
  SEGMENT_CLASSES,
  SEGMENT_IDLE_CLASSES,
  SEGMENT_SELECTED_CLASSES,
} from "@nookly/frontend/classes";
import { cn, row, splitText } from "../ui/classes.ts";
import { Button, statusOf } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { Empty, Section, ROW_DIVIDER } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { fieldError } from "./forms.ts";

const ROLES: { role: ShareRole; label: string }[] = [
  { role: "viewer", label: "Can view" },
  { role: "editor", label: "Can edit" },
];

function RolePicker({
  value,
  onChange,
  label,
}: {
  value: ShareRole;
  onChange: (role: ShareRole) => void;
  label: string;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      className={cn(row(SEGMENTED_CLASSES), "h-10 self-start")}
    >
      {ROLES.map((r) => (
        <Pressable
          key={r.role}
          accessibilityRole="radio"
          accessibilityLabel={r.label}
          accessibilityState={{ checked: r.role === value }}
          onPress={() => onChange(r.role)}
          className={cn(
            splitText(SEGMENT_CLASSES).box,
            "justify-center px-3",
            r.role === value && splitText(SEGMENT_SELECTED_CLASSES).box,
          )}
        >
          <Text
            className={cn(
              splitText(SEGMENT_CLASSES).text,
              splitText(r.role === value ? SEGMENT_SELECTED_CLASSES : SEGMENT_IDLE_CLASSES).text,
            )}
          >
            {r.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const inviteSchema = z.object({ email: z.email("Enter an email address") });

/// Who an item is shared with, and inviting someone by email, as on the desktop.
export function ShareScreen({ entityId }: { entityId: string }) {
  const { sync } = useAppData();
  const queryClient = useQueryClient();
  const signedIn = sync.store.getState().user !== null;
  const [role, setRole] = useState<ShareRole>("viewer");
  const { data: shares = [] } = useQuery({
    queryKey: [...keys.sync.root, "outgoing"],
    queryFn: async () => (await sync.account()?.sharesByMe()) ?? [],
    enabled: signedIn,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: keys.sync.root });
  const invite = useMutation({
    mutationFn: async (email: string) => {
      const api = sync.account();
      if (!api) throw new Error("Sign in to sync first, in Settings.");
      await sync.syncNow();
      return api.share(entityId, email, role);
    },
    onSuccess: () => {
      form.reset();
      refresh();
    },
  });
  const change = useMutation({
    mutationFn: async (input: { id: string; role: ShareRole | null }) => {
      const api = sync.account();
      if (!api) return;
      if (input.role) await api.changeShareRole(input.id, input.role);
      else await api.removeShare(input.id);
    },
    onSuccess: refresh,
  });
  const form = useForm({
    defaultValues: { email: "" },
    validators: { onChange: inviteSchema, onSubmit: inviteSchema },
    onSubmit: ({ value }) => invite.mutate(value.email.trim().toLowerCase()),
  });
  const people = shares.filter((s) => s.entityId === entityId);
  return (
    <Screen>
      <Text tone="muted">
        People you invite see this item and what belongs to it, nothing else from your Spaces.
      </Text>
      <form.Field name="email">
        {(field) => (
          <Field
            label="Email"
            required
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="name@example.com"
            value={field.state.value}
            onChangeText={field.handleChange}
            onBlur={field.handleBlur}
            error={fieldError(field)}
          />
        )}
      </form.Field>
      <RolePicker label="Access for the person you invite" value={role} onChange={setRole} />
      {invite.error ? <Text tone="destructive">{invite.error.message}</Text> : null}
      <Button
        label="Invite"
        status={statusOf(invite)}
        successLabel="Sent"
        errorLabel="Couldn't invite"
        onPress={() => void form.handleSubmit()}
      />
      <Section title="People with access">
        {people.length === 0 ? <Empty text="Nobody yet." /> : null}
        {people.map((s) => (
          <View key={s.id}>
            <View className={cn("gap-2 p-4", ROW_DIVIDER)}>
              <View className="flex-row items-center gap-2">
                <Text className="flex-1" numberOfLines={1}>
                  {s.recipientEmail}
                </Text>
                {s.status === "pending" ? <Badge label="Invited" /> : null}
              </View>
              <View className="flex-row items-center gap-2">
                <RolePicker
                  label={`Access for ${s.recipientEmail}`}
                  value={s.role}
                  onChange={(next) => change.mutate({ id: s.id, role: next })}
                />
                <Button
                  label="Remove Access"
                  variant="ghost"
                  onPress={() => change.mutate({ id: s.id, role: null })}
                />
              </View>
            </View>
          </View>
        ))}
      </Section>
    </Screen>
  );
}
