import { USERNAME_PATTERN, USERNAME_RULE, suggestUsername } from "@nookly/shared/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { IconUser } from "@tabler/icons-react";
import { useEffect, useId } from "react";
import { z } from "zod";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { FormField, fieldMessage } from "#/components/form-field.tsx";
import { Button } from "@nookly/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { IconInput } from "@nookly/ui/components/icon-input";
import { syncRuntime, useSyncState } from "./sync-instance.ts";
import { useUsernameGate } from "./username-gate-store.ts";

const usernameSchema = z.object({
  username: z.string().trim().regex(USERNAME_PATTERN, USERNAME_RULE),
});

/// Shown once after signing in with another account, which has no username yet. Putting
/// it off is fine: the account works under the name the other account gave it.
export function UsernameGate() {
  const user = useSyncState((state) => state.user);
  const dismissed = useUsernameGate((state) => state.dismissed);
  const queryClient = useQueryClient();
  const id = useId();
  const choose = useMutation({
    mutationFn: (username: string) => syncRuntime.chooseUsername(username),
    onSuccess: () => void queryClient.invalidateQueries(),
  });
  const open = user?.needsUsername === true && !dismissed;
  const form = useForm({
    defaultValues: { username: "" },
    validators: { onChange: usernameSchema, onSubmit: usernameSchema },
    onSubmit: ({ value }) => choose.mutate(value.username.trim()),
  });
  // The suggestion follows the account that just signed in.
  useEffect(() => {
    if (user?.needsUsername) form.setFieldValue("username", suggestUsername(user.username));
  }, [form, user?.id, user?.needsUsername, user?.username]);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && useUsernameGate.getState().dismiss()}>
      <DialogContent className="max-w-md gap-4">
        <DialogHeader>
          <DialogTitle>Choose a username</DialogTitle>
          <DialogDescription>
            Your account was made with another account, so it has no username yet. People you share
            with see it. You can pick it once.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="username">
            {(field) => (
              <FormField
                label="Username"
                htmlFor={id}
                required
                hint="Letters, numbers, dots and underscores."
                error={fieldMessage(field)}
              >
                <IconInput
                  icon={IconUser}
                  id={id}
                  autoComplete="username"
                  autoCapitalize="none"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                />
              </FormField>
            )}
          </form.Field>
          <FieldError message={choose.error ? choose.error.message : null} />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => useUsernameGate.getState().dismiss()}
            >
              Not Now
            </Button>
            <Button type="submit" disabled={choose.isPending}>
              <StatusButtonContent
                status={statusOf(choose)}
                label="Save Username"
                successLabel="Saved"
                errorLabel="Couldn't save it"
              />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
