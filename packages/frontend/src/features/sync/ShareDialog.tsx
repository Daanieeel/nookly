import type { Share, ShareRole } from "@nookly/shared/api";
import { IconUserMinus } from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { z } from "zod";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { FormField, fieldMessage, hasVisibleErrors } from "#/components/form-field.tsx";
import type { Entity } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { qk } from "#/lib/query-keys.ts";
import { Badge } from "@nookly/ui/components/badge";
import { Button } from "@nookly/ui/components/button";
import { CopyButton } from "@nookly/ui/components/copy-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { Input } from "@nookly/ui/components/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { syncRuntime } from "./sync-instance.ts";

const ROLES: { role: ShareRole; label: string }[] = [
  { role: "viewer", label: "Can view" },
  { role: "editor", label: "Can edit" },
];

/// Two choices side by side: view or edit.
function RoleToggle({
  value,
  onChange,
  label,
}: {
  value: ShareRole;
  onChange: (role: ShareRole) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex h-8 shrink-0 items-center rounded-md border border-input bg-secondary p-0.5"
    >
      {ROLES.map((option) => (
        <button
          key={option.role}
          type="button"
          role="radio"
          aria-checked={value === option.role}
          onClick={() => onChange(option.role)}
          className={cn(
            "h-full rounded-sm px-2 text-xs transition-colors",
            value === option.role
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function PersonRow({ share }: { share: Share }) {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: qk.sync.sharesByMe });
  const changeRole = useMutation({
    mutationFn: (role: ShareRole) =>
      syncRuntime.account()?.changeShareRole(share.id, role) ?? Promise.resolve(),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => syncRuntime.account()?.removeShare(share.id) ?? Promise.resolve(),
    onSuccess: refresh,
  });
  return (
    <li className="flex items-center gap-2 py-1.5 text-sm">
      <span className="truncate">{share.recipientEmail}</span>
      {share.status === "pending" && <Badge>Invited</Badge>}
      <div className="ml-auto flex items-center gap-1">
        <RoleToggle
          label={`Access for ${share.recipientEmail}`}
          value={changeRole.variables ?? share.role}
          onChange={(role) => changeRole.mutate(role)}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="iconSm"
              variant="ghost"
              aria-label="Remove Access"
              onClick={() => remove.mutate()}
            >
              <IconUserMinus />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remove Access</TooltipContent>
        </Tooltip>
      </div>
    </li>
  );
}

const inviteSchema = z.object({ email: z.email("Enter an email address") });

/// Who a page is shared with, and inviting someone by email. People without an
/// account get a link that works once they sign up with that address.
export function ShareDialog({
  entity,
  open,
  onOpenChange,
}: {
  entity: Entity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const emailId = useId();
  const [role, setRole] = useState<ShareRole>("viewer");
  const { data: shares = [] } = useQuery({
    queryKey: qk.sync.sharesByMe,
    queryFn: async () => (await syncRuntime.account()?.sharesByMe()) ?? [],
    enabled: open,
  });
  const invite = useMutation({
    mutationFn: async (email: string) => {
      const api = syncRuntime.account();
      if (!api) throw new Error("Sign in to sync first, under Settings, Sync.");
      // The page has to be on the server before it can be shared.
      await syncRuntime.syncNow();
      return api.share(entity.id, email, role);
    },
    onSuccess: () => {
      form.reset();
      void queryClient.invalidateQueries({ queryKey: qk.sync.sharesByMe });
    },
  });
  const form = useForm({
    defaultValues: { email: "" },
    validators: { onChange: inviteSchema, onSubmit: inviteSchema },
    onSubmit: ({ value }) => invite.mutate(value.email.trim().toLowerCase()),
  });
  const people = shares.filter((s) => s.entityId === entity.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share "{displayTitle(entity)}"</DialogTitle>
          <DialogDescription>
            People you invite see this page and its contents, nothing else from your Spaces.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="email">
            {(field) => (
              <FormField
                label="Email"
                htmlFor={emailId}
                required
                error={fieldMessage(field)}
                className="flex-1"
              >
                <Input
                  id={emailId}
                  type="email"
                  autoComplete="off"
                  placeholder="name@example.com"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              </FormField>
            )}
          </form.Field>
          <RoleToggle label="Access for the person you invite" value={role} onChange={setRole} />
          <form.Subscribe selector={hasVisibleErrors}>
            {(blocked) => (
              <Button type="submit" size="sm" disabled={blocked}>
                <StatusButtonContent
                  status={statusOf(invite)}
                  label="Invite"
                  successLabel="Sent"
                  errorLabel="Couldn't invite"
                />
              </Button>
            )}
          </form.Subscribe>
        </form>
        <FieldError message={invite.error?.message} />
        {invite.data && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            An email is on its way. You can also send the invite link yourself.
            <Tooltip>
              <TooltipTrigger asChild>
                <CopyButton
                  value={invite.data.inviteUrl}
                  aria-label="Copy Invite Link"
                  className="rounded-sm p-1 hover:bg-accent"
                />
              </TooltipTrigger>
              <TooltipContent>Copy Invite Link</TooltipContent>
            </Tooltip>
          </p>
        )}
        {people.length > 0 && (
          <ul aria-label="People with access" className="divide-y divide-border">
            {people.map((s) => (
              <PersonRow key={s.id} share={s} />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
