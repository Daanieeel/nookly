import { IconSchool } from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { z } from "zod";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { FormField, fieldMessage, hasVisibleErrors } from "#/components/form-field.tsx";
import { Button } from "@nookly/ui/components/button";
import { CopyButton } from "@nookly/ui/components/copy-button";
import { Input } from "@nookly/ui/components/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { moodleBeginLogin } from "#/lib/api/moodle.ts";
import { completeMoodleLogin, messageOf } from "./moodle-login.ts";

const siteSchema = z.object({ site: z.string().trim().min(1, "Enter the address of your Moodle") });
const linkSchema = z.object({ link: z.string().trim().min(1, "Paste the link Moodle sent back") });

/// Signing in happens on the university's own page in the browser, so single sign on and two
/// step login work. Moodle then sends the browser back to a `nookly://` link, which opens
/// Nookly and finishes the sign in (`App.tsx`). Pasting that link is the way around a
/// browser that doesn't open it.
export function ConnectMoodle({
  reconnect,
  siteUrl,
}: {
  reconnect: boolean;
  siteUrl: string | null;
}) {
  const queryClient = useQueryClient();
  const start = useMutation({
    mutationFn: async (site: string) => {
      const address = await moodleBeginLogin(site);
      await openUrl(address);
      return address;
    },
  });
  const siteForm = useForm({
    defaultValues: { site: siteUrl ?? "" },
    validators: { onChange: siteSchema },
    onSubmit: ({ value }) => {
      if (!start.isPending) start.mutate(value.site);
    },
  });
  const finish = useMutation({
    mutationFn: (link: string) => completeMoodleLogin(queryClient, link),
  });
  const linkForm = useForm({
    defaultValues: { link: "" },
    validators: { onChange: linkSchema },
    onSubmit: ({ value }) => {
      if (!finish.isPending) finish.mutate(value.link);
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
        <FieldError message={start.isError && messageOf(start.error)} />
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
                status={statusOf(start)}
                label="Sign in with Moodle"
                errorLabel="Try again"
              />
            </Button>
          )}
        </siteForm.Subscribe>
        {start.isSuccess && (
          <p className="text-xs text-muted-foreground" role="status">
            Sign in in your browser. Nookly opens again by itself when you are done.
          </p>
        )}
      </form>

      {start.isSuccess && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="moodle-address" className="text-xs text-muted-foreground">
            Sign in address
          </label>
          <div className="flex items-center gap-1">
            <Input id="moodle-address" readOnly value={start.data} className="text-xs" />
            <Tooltip>
              <TooltipTrigger asChild>
                <CopyButton
                  value={start.data}
                  aria-label="Copy Sign In Address"
                  className="flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-accent"
                />
              </TooltipTrigger>
              <TooltipContent>Copy Sign In Address</TooltipContent>
            </Tooltip>
          </div>
          <p className="text-xs text-muted-foreground">
            Opened a blank page? Paste this address into your browser yourself.
          </p>
        </div>
      )}

      {start.isSuccess && (
        <form
          className="flex flex-col gap-2 border-t border-border pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void linkForm.handleSubmit();
          }}
        >
          <p className="text-xs text-muted-foreground">
            Nookly didn't open? Your browser may show a link that starts with nookly://token=. Copy
            it and paste it here.
          </p>
          <linkForm.Field name="link">
            {(field) => (
              <FormField label="Link from Moodle" htmlFor="moodle-link" error={fieldMessage(field)}>
                <Input
                  id="moodle-link"
                  type="password"
                  autoComplete="off"
                  placeholder="nookly://token=..."
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </FormField>
            )}
          </linkForm.Field>
          <linkForm.Subscribe selector={hasVisibleErrors}>
            {(blocked) => (
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                className="self-start"
                disabled={blocked}
              >
                <StatusButtonContent
                  status={statusOf(finish)}
                  label="Finish sign in"
                  errorLabel="Try again"
                />
              </Button>
            )}
          </linkForm.Subscribe>
        </form>
      )}
    </div>
  );
}
