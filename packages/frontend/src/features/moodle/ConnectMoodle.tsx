import {
  IconBook2,
  IconChartBar,
  IconChecklist,
  IconLock,
  IconSpeakerphone,
  IconWorld,
} from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { FormField, fieldMessage, hasVisibleErrors } from "#/components/form-field.tsx";
import { BrandButton } from "@nookly/ui/components/brand-button";
import { MoodleIcon } from "@nookly/ui/components/moodle-icon";
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
    <div className="relative isolate flex min-h-full items-center justify-center overflow-hidden rounded-xl px-4 py-12">
      <Backdrop />
      <div className="flex w-full max-w-md flex-col gap-7 rounded-2xl border border-border bg-card/80 p-8 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4 text-center">
          <ModuleChips />
          <div className="flex flex-col gap-1.5">
            <h1 className="text-xl font-semibold tracking-tight">
              {reconnect ? "Connect Moodle again" : "Connect your Moodle"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Read your courses, files, assignments, grades and announcements here, without opening
              the website.
            </p>
          </div>
        </div>

        <form
          className="flex flex-col gap-4"
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
                <div className="relative">
                  <IconWorld
                    size={18}
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="moodle-site"
                    placeholder="moodle.youruniversity.edu"
                    className="h-12 pl-10 text-base"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              </FormField>
            )}
          </siteForm.Field>
          <FieldError message={open.isError && messageOf(open.error)} />
          <siteForm.Subscribe selector={hasVisibleErrors}>
            {(blocked) => (
              <BrandButton type="submit" disabled={blocked}>
                <StatusButtonContent
                  status={statusOf(open)}
                  icon={<MoodleIcon className="size-7" />}
                  label="Sign in with Moodle"
                  errorLabel="Try again"
                />
              </BrandButton>
            )}
          </siteForm.Subscribe>
          {open.isSuccess && (
            <p className="text-center text-xs text-muted-foreground" role="status">
              Sign in in the window that opened. Nookly continues by itself when you are done.
            </p>
          )}
          {signIn?.kind === "finishing" && (
            <p className="text-center text-xs text-muted-foreground" role="status">
              Finishing the sign in...
            </p>
          )}
          <FieldError message={signIn?.kind === "failed" && signIn.message} />
        </form>

        <p className="flex items-start justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <IconLock size={13} aria-hidden="true" className="mt-px shrink-0" />
          You sign in on your university's own page. Nookly never sees your password and only reads
          from Moodle.
        </p>
      </div>
    </div>
  );
}

/// What Moodle brings into Nookly, as four tilted tiles.
function ModuleChips() {
  const chips = [
    { Icon: IconBook2, tilt: "-rotate-6" },
    { Icon: IconChecklist, tilt: "rotate-3" },
    { Icon: IconChartBar, tilt: "-rotate-3" },
    { Icon: IconSpeakerphone, tilt: "rotate-6" },
  ];
  return (
    <div className="flex items-center gap-2" aria-hidden="true">
      {chips.map(({ Icon, tilt }) => (
        <div
          key={tilt}
          className={`flex size-11 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground shadow-xs ${tilt}`}
        >
          <Icon size={20} />
        </div>
      ))}
    </div>
  );
}

/// A soft orange glow and two faint rings behind the card.
function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute top-1/2 left-1/2 size-160 -translate-1/2 rounded-full border border-border/60" />
      <div className="absolute top-1/2 left-1/2 size-240 -translate-1/2 rounded-full border border-border/40" />
      <div className="absolute top-0 left-1/2 h-64 w-xl max-w-full -translate-x-1/2 -translate-y-1/3 rounded-full bg-brand-moodle/20 blur-3xl" />
    </div>
  );
}
