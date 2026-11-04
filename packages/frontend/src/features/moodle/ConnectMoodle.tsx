import { IconSchool } from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { FormField, fieldMessage, hasVisibleErrors } from "#/components/form-field.tsx";
import { Button } from "@nookly/ui/components/button";
import { Input } from "@nookly/ui/components/input";
import { moodleOpenLogin } from "#/lib/api/moodle.ts";
import { qk } from "#/lib/query-keys.ts";
import { type SignInState, messageOf, useSignInState } from "./moodle-login.ts";

const siteSchema = z.object({ site: z.string().trim().min(1, "Enter the address of your Moodle") });

/// Signing in happens on the university's own page, so single sign on and two step login work.
/// It opens in the system's sign in sheet on macOS, which offers the passwords saved in Apple
/// Passwords, and in a window of Nookly's own elsewhere. Both catch Moodle's redirect themselves
/// (`moodle_open_login`), because a browser would not hand it back to the app.
export function ConnectMoodle({
  reconnect,
  siteUrl,
}: {
  reconnect: boolean;
  siteUrl: string | null;
}) {
  const queryClient = useQueryClient();
  const signIn = useSignInState();
  const open = useMutation({
    mutationFn: (site: string) => moodleOpenLogin(site),
    // A new try starts without the last one's reason.
    onMutate: () => queryClient.setQueryData<SignInState>(qk.moodle.signIn, null),
  });
  const siteForm = useForm({
    defaultValues: { site: siteUrl ?? "" },
    validators: { onChange: siteSchema },
    onSubmit: ({ value }) => {
      if (!open.isPending) open.mutate(value.site);
    },
  });
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <IconSchool size={18} />
        </div>
        <h1 className="text-lg font-semibold">
          {reconnect ? "Connect Moodle again" : "Connect your Moodle"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Read your courses, files, assignments, grades and announcements here, without opening the
          website. Nookly only reads from Moodle and never changes anything there.
        </p>
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void siteForm.handleSubmit();
        }}
      >
        <siteForm.Field name="site">
          {(field) => (
            <FormField
              label="Moodle address"
              required
              htmlFor="moodle-site"
              error={fieldMessage(field)}
            >
              <Input
                id="moodle-site"
                placeholder="moodle.youruniversity.edu"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </FormField>
          )}
        </siteForm.Field>
        <FieldError message={open.isError && messageOf(open.error)} />
        <siteForm.Subscribe selector={hasVisibleErrors}>
          {(blocked) => (
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              className="self-start"
              disabled={blocked}
            >
              <StatusButtonContent
                status={statusOf(open)}
                label="Sign in with Moodle"
                errorLabel="Try again"
              />
            </Button>
          )}
        </siteForm.Subscribe>
        {open.isSuccess && (
          <p className="text-xs text-muted-foreground" role="status">
            Sign in in the window that opened. Nookly continues by itself when you are done.
          </p>
        )}
      </form>

      {signIn?.kind === "finishing" && (
        <p className="text-xs text-muted-foreground" role="status">
          Finishing the sign in...
        </p>
      )}
      <FieldError message={signIn?.kind === "failed" && signIn.message} />
    </div>
  );
}
