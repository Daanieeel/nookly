import {
  SECURITY_STEPS,
  type SecurityAction,
  type SecurityOutcome,
  type SecuritySummary,
  errorToShow,
  isWrongCode,
  runSecurityAction,
} from "@nookly/shared/api";
import { IconKey, IconMail, IconDeviceMobile } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { FormField } from "#/components/form-field.tsx";
import { QrImage } from "#/components/qr-image.tsx";
import { qk } from "#/lib/query-keys.ts";
import { Badge } from "@nookly/ui/components/badge";
import { Button } from "@nookly/ui/components/button";
import { cn } from "@nookly/ui/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { IconInput } from "@nookly/ui/components/icon-input";
import { CopyButton } from "@nookly/ui/components/copy-button";
import { OtpCodeInput } from "@nookly/ui/components/input-otp";
import { DeleteAccount } from "./DeleteAccount.tsx";
import { useSecurityDialog } from "./security-dialog-store.ts";
import { SignOutDialog } from "./SignOutDialog.tsx";
import { signedInAccount, syncRuntime, useSyncState } from "./sync-instance.ts";
import { useAccountChange } from "./useAccountChange.ts";

const CODE_LENGTH = 6;

type View = SecurityOutcome | { name: "confirm"; action: SecurityAction } | { name: "addEmail" };

/// Where a step puts its buttons: the dialog's footer. A step's form is above it, so its
/// submit button names the form with `form`.
type Slot = HTMLElement | null;

function FooterActions({ slot, children }: { slot: Slot; children: ReactNode }) {
  return slot ? createPortal(children, slot) : null;
}

/// What a change does, then the change. Whether the person has to confirm it is them is
/// the server's to say.
function ConfirmStep({
  action,
  slot,
  onBack,
  onDone,
}: {
  action: SecurityAction;
  slot: Slot;
  onBack: () => void;
  onDone: (next: SecurityOutcome) => void;
}) {
  const run = useAccountChange(
    () => runSecurityAction(signedInAccount(), action),
    (next) => onDone(next),
  );
  const step = SECURITY_STEPS[action];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">{step.title}</p>
      <p className="text-sm text-muted-foreground">{step.text}</p>
      <FieldError message={errorToShow(run.error)} />
      <FooterActions slot={slot}>
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button type="button" disabled={run.isPending} onClick={() => run.mutate()}>
          <StatusButtonContent
            status={statusOf(run)}
            label="Continue"
            successLabel="Done"
            errorLabel="Couldn't continue"
          />
        </Button>
      </FooterActions>
    </div>
  );
}

/// The new authenticator app: scan the code (or type the key), then prove it works.
function ScanStep({
  uri,
  keyText,
  slot,
  onBack,
  onDone,
}: {
  uri: string;
  keyText: string;
  slot: Slot;
  onBack: () => void;
  onDone: (codes: string[]) => void;
}) {
  const id = useId();
  const formId = useId();
  const [code, setCode] = useState("");
  const queryClient = useQueryClient();
  const confirm = useMutation({
    mutationFn: (digits: string) => signedInAccount().confirmAuthenticator(digits),
    onSuccess: async (codes) => {
      await queryClient.invalidateQueries({ queryKey: qk.sync.security });
      onDone(codes);
    },
    // A wrong code is cleared so the next one starts from the first box.
    onError: () => setCode(""),
  });
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (code.length === CODE_LENGTH) confirm.mutate(code);
      }}
    >
      <div className="flex flex-col items-center gap-3">
        <p className="text-sm text-muted-foreground">Scan it with your authenticator app.</p>
        <QrImage text={uri} label="QR code for your authenticator app" size={232} />
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span aria-hidden className="h-px flex-1 bg-border" />
        or set up manually
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>
      <div className="flex max-w-full items-center justify-center gap-1">
        <code className="min-w-0 font-mono text-xs tracking-wider break-all select-all">
          {keyText}
        </code>
        <CopyButton
          value={keyText}
          aria-label="Copy key"
          className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
        />
      </div>
      <div className="flex flex-col items-center gap-2">
        <OtpCodeInput
          id={id}
          aria-label="Code from the app"
          length={CODE_LENGTH}
          value={code}
          onChange={(next) => {
            setCode(next);
            if (confirm.isError) confirm.reset();
          }}
          onComplete={(digits) => confirm.mutate(digits)}
          disabled={confirm.isPending}
          invalid={confirm.isError}
        />
      </div>
      {/* A wrong code is shown by the red boxes; anything else is said. */}
      <FieldError
        message={confirm.error && !isWrongCode(confirm.error) ? confirm.error.message : null}
      />
      <FooterActions slot={slot}>
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button
          type="submit"
          form={formId}
          disabled={confirm.isPending || code.length !== CODE_LENGTH}
        >
          <StatusButtonContent
            status={statusOf(confirm)}
            label="Turn On"
            successLabel="Turned on"
            errorLabel="Wrong code"
          />
        </Button>
      </FooterActions>
    </form>
  );
}

/// The recovery codes, shown once: each opens the account if the other methods are lost.
function CodesStep({ codes, slot, onDone }: { codes: string[]; slot: Slot; onDone: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Save these recovery codes somewhere safe, like a password manager. Each one signs you in
        once if you can't use your other ways to sign in. They are not shown again.
      </p>
      <ul
        aria-label="Recovery codes"
        className="grid grid-cols-2 gap-1.5 rounded-lg border border-border bg-muted/40 p-3 font-mono text-sm"
      >
        {codes.map((code) => (
          <li key={code} className="select-all">
            {code}
          </li>
        ))}
      </ul>
      <FooterActions slot={slot}>
        <CopyButton
          value={codes.join("\n")}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
        >
          Copy Codes
        </CopyButton>
        <Button type="button" onClick={onDone}>
          I Saved Them
        </Button>
      </FooterActions>
    </div>
  );
}

/// An account made without an email can't have codes emailed: it adds one, and confirms it.
function AddEmailStep({
  slot,
  onBack,
  onDone,
}: {
  slot: Slot;
  onBack: () => void;
  onDone: () => void;
}) {
  const id = useId();
  const formId = useId();
  const [email, setEmail] = useState("");
  const add = useAccountChange(
    () => signedInAccount().addEmail(email),
    () => onDone(),
  );
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (email.trim()) add.mutate();
      }}
    >
      <p className="text-sm text-muted-foreground">
        We send a link to confirm the address. Once it is confirmed, codes can be emailed to it.
      </p>
      <FormField label="Email" htmlFor={id} required>
        <IconInput
          icon={IconMail}
          id={id}
          placeholder="ada@example.com"
          type="email"
          autoFocus
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </FormField>
      <FieldError message={errorToShow(add.error)} />
      <FooterActions slot={slot}>
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" form={formId} disabled={add.isPending || !email.trim()}>
          <StatusButtonContent
            status={statusOf(add)}
            label="Send Confirmation"
            successLabel="Sent"
            errorLabel="Couldn't send"
          />
        </Button>
      </FooterActions>
    </form>
  );
}

function MethodRow({
  icon,
  title,
  detail,
  on,
  children,
}: {
  icon: ReactNode;
  title: string;
  detail?: ReactNode;
  on: boolean;
  children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <span className="text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          {title}
          {on ? <Badge variant="secondary">On</Badge> : null}
        </p>
        {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      </div>
      {children}
    </li>
  );
}

function Overview({
  summary,
  setup,
  go,
}: {
  summary: SecuritySummary;
  setup: boolean;
  go: (view: View) => void;
}) {
  const email = summary.email;
  const resend = useMutation({
    mutationFn: async () => {
      if (email.address) await signedInAccount().resendVerification(email.address);
    },
  });
  return (
    <ul
      aria-label="Ways to sign in"
      className="flex flex-col divide-y divide-border/60 rounded-lg border border-border bg-card"
    >
      <MethodRow
        icon={<IconMail size={18} />}
        title="Emailed codes"
        detail={email.address && email.confirmed ? `A code sent to ${email.address}.` : null}
        on={email.enabled}
      >
        {email.enabled ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => go({ name: "confirm", action: "emailOff" })}
          >
            Turn Off Emailed Codes
          </Button>
        ) : email.possible ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => go({ name: "confirm", action: "emailOn" })}
          >
            Turn On Emailed Codes
          </Button>
        ) : email.address ? (
          <Button size="sm" variant="secondary" onClick={() => resend.mutate()}>
            <StatusButtonContent
              status={statusOf(resend)}
              label="Send Confirmation Link"
              successLabel="Sent"
              errorLabel="Couldn't send"
            />
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => go({ name: "addEmail" })}>
            Add an Email Address
          </Button>
        )}
      </MethodRow>
      <MethodRow
        icon={<IconDeviceMobile size={18} />}
        title="Authenticator app"
        on={summary.authenticator.enabled}
      >
        {summary.authenticator.enabled ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => go({ name: "confirm", action: "authenticatorOff" })}
          >
            Remove Authenticator App
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => go({ name: "confirm", action: "authenticatorOn" })}
          >
            Set Up Authenticator App
          </Button>
        )}
      </MethodRow>
      {summary.enabled && !setup ? (
        <MethodRow
          icon={<IconKey size={18} />}
          title="Recovery codes"
          detail={
            summary.backupCodesLeft === 1
              ? "1 code left."
              : `${summary.backupCodesLeft} codes left.`
          }
          on={false}
        >
          <Button
            size="sm"
            variant="secondary"
            onClick={() => go({ name: "confirm", action: "newCodes" })}
          >
            Get New Codes
          </Button>
        </MethodRow>
      ) : null}
    </ul>
  );
}

/// Two-factor sign in: the authenticator app, emailed codes and recovery codes. Opened from
/// Settings, and opened for good, with no way past it, while the server requires it of an
/// account that has none.
export function SecurityDialog() {
  const user = useSyncState((state) => state.user);
  const requested = useSecurityDialog((state) => state.open);
  const required = user?.twoFactorRequired === true;
  // Once emailed codes are on, the account no longer owes two-factor, but the dialog stays to
  // offer an authenticator app, until it is closed or the person goes on without one.
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (required) setHeld(true);
  }, [required]);
  // While it is being set up (owed, or just done and not yet confirmed with the recovery codes)
  // there is no way past it but going on, signing out, or deleting the account.
  const setup = required || held;
  const open = user !== null && (requested || required || held);
  // Recovery codes an authenticator app made, kept until Continue shows them.
  const [pendingCodes, setPendingCodes] = useState<string[] | null>(null);
  const [view, setView] = useState<View>({ name: "overview" });
  const { data: summary, error } = useQuery({
    queryKey: qk.sync.security,
    queryFn: () => signedInAccount().security(),
    enabled: open,
  });
  const [signingOut, setSigningOut] = useState(false);
  // The footer's right side, where the step on show puts its buttons.
  const [slot, setSlot] = useState<Slot>(null);
  const overview = () => setView({ name: "overview" });
  const close = () => {
    overview();
    setHeld(false);
    setPendingCodes(null);
    useSecurityDialog.getState().close();
  };
  // Signed out or deleted: nothing of that account's setup carries over to the next one.
  const signedOut = user === null;
  useEffect(() => {
    if (signedOut) close();
  }, [signedOut]);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !setup && close()}>
      <DialogContent
        className={cn(
          "max-h-[calc(100dvh-2rem)] max-w-md grid-cols-1 gap-4 overflow-y-auto",
          // No way past it but going on, signing out or deleting: the close button goes.
          setup && "[&>button]:hidden",
        )}
      >
        <DialogHeader>
          <DialogTitle>{setup ? "Set up two-factor sign in" : "Two-factor sign in"}</DialogTitle>
          <DialogDescription>
            {required
              ? "Sign in needs a second step. Sync starts once it is set up."
              : held
                ? "Add another way to sign in, or continue."
                : "A second step when you sign in keeps your account safe even if a password leaks."}
          </DialogDescription>
        </DialogHeader>
        <FieldError message={error ? error.message : null} />
        {summary && !summary.available ? (
          <p className="text-sm text-muted-foreground">
            Your server offers two-factor sign in only for accounts with a password.
          </p>
        ) : null}
        {summary?.available && view.name === "overview" ? (
          <Overview summary={summary} setup={setup} go={setView} />
        ) : null}
        {view.name === "confirm" ? (
          <ConfirmStep
            action={view.action}
            slot={slot}
            onBack={overview}
            onDone={(next) => {
              if (next.name === "codes") setPendingCodes(null);
              setView(next);
            }}
          />
        ) : null}
        {view.name === "scan" ? (
          <ScanStep
            uri={view.uri}
            keyText={view.key}
            slot={slot}
            onBack={overview}
            onDone={(codes) => {
              if (!setup)
                return setView(codes.length > 0 ? { name: "codes", codes } : { name: "overview" });
              // Back to the list: another way can be added, and Continue shows the codes.
              if (codes.length > 0) setPendingCodes(codes);
              overview();
              void syncRuntime.twoFactorChanged().catch(() => {});
            }}
          />
        ) : null}
        {view.name === "codes" ? (
          <CodesStep
            codes={view.codes}
            slot={slot}
            onDone={() => {
              if (setup) close();
              else overview();
              void syncRuntime.twoFactorChanged().catch(() => {});
            }}
          />
        ) : null}
        {view.name === "addEmail" ? (
          <AddEmailStep slot={slot} onBack={overview} onDone={overview} />
        ) : null}
        <DialogFooter className="sm:justify-between">
          {required ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              <Button type="button" variant="destructive" onClick={() => setSigningOut(true)}>
                Sign Out
              </Button>
              <DeleteAccount />
            </div>
          ) : null}
          <div ref={setSlot} className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row">
            {view.name === "overview" && setup && summary?.enabled ? (
              <Button
                type="button"
                onClick={() =>
                  setView(
                    pendingCodes
                      ? { name: "codes", codes: pendingCodes }
                      : { name: "confirm", action: "newCodes" },
                  )
                }
              >
                Continue
              </Button>
            ) : null}
            {view.name === "overview" && !setup ? (
              <Button type="button" variant="secondary" onClick={close}>
                Done
              </Button>
            ) : null}
          </div>
        </DialogFooter>
        <SignOutDialog open={signingOut} onOpenChange={setSigningOut} keepByDefault />
      </DialogContent>
    </Dialog>
  );
}
