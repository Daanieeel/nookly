import {
  SECURITY_STEPS,
  type SecurityAction,
  type SecurityOutcome,
  type SecuritySummary,
  isWrongCode,
  runSecurityAction,
} from "@nookly/shared/api";
import { IconKey, IconMail, IconDeviceMobile } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { FormField } from "#/components/form-field.tsx";
import { PasswordInput } from "#/components/password-input.tsx";
import { QrImage } from "#/components/qr-image.tsx";
import { qk } from "#/lib/query-keys.ts";
import { Badge } from "@nookly/ui/components/badge";
import { Button } from "@nookly/ui/components/button";
import { CopyButton } from "@nookly/ui/components/copy-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { IconInput } from "@nookly/ui/components/icon-input";
import { BlurredSecret } from "@nookly/ui/components/blurred-secret";
import { OtpCodeInput } from "@nookly/ui/components/input-otp";
import { useSecurityDialog } from "./security-dialog-store.ts";
import { syncRuntime, useSyncState } from "./sync-instance.ts";

const CODE_LENGTH = 6;

type View = SecurityOutcome | { name: "password"; action: SecurityAction } | { name: "addEmail" };

function account() {
  const api = syncRuntime.account();
  if (!api) throw new Error("Sign in first.");
  return api;
}

/// Where a step puts its buttons: the dialog's footer. A step's form is above it, so its
/// submit button names the form with `form`.
type Slot = HTMLElement | null;

function FooterActions({ slot, children }: { slot: Slot; children: ReactNode }) {
  return slot ? createPortal(children, slot) : null;
}

/// A password, then what it unlocks.
function PasswordStep({
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
  const id = useId();
  const formId = useId();
  const [password, setPassword] = useState("");
  const queryClient = useQueryClient();
  const run = useMutation({
    mutationFn: () => runSecurityAction(account(), action, password),
    onSuccess: async (next) => {
      await queryClient.invalidateQueries({ queryKey: qk.sync.security });
      if (next.name === "overview") await syncRuntime.twoFactorChanged().catch(() => {});
      onDone(next);
    },
  });
  const step = SECURITY_STEPS[action];
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (password) run.mutate();
      }}
    >
      <p className="text-sm font-medium">{step.title}</p>
      <p className="text-sm text-muted-foreground">{step.text}</p>
      <FormField label="Password" htmlFor={id} required>
        <PasswordInput
          id={id}
          placeholder="Password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </FormField>
      <FieldError message={run.error ? run.error.message : null} />
      <FooterActions slot={slot}>
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" form={formId} disabled={run.isPending || !password}>
          <StatusButtonContent
            status={statusOf(run)}
            label="Continue"
            successLabel="Done"
            errorLabel="Couldn't continue"
          />
        </Button>
      </FooterActions>
    </form>
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
    mutationFn: (digits: string) => account().confirmAuthenticator(digits),
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
      <BlurredSecret value={keyText} label="key" />
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
        once if you lose your authenticator app. They are not shown again.
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
  const queryClient = useQueryClient();
  const add = useMutation({
    mutationFn: () => account().addEmail(email),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.sync.security });
      await syncRuntime.twoFactorChanged().catch(() => {});
      onDone();
    },
  });
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
      <FieldError message={add.error ? add.error.message : null} />
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

function Overview({ summary, go }: { summary: SecuritySummary; go: (view: View) => void }) {
  const email = summary.email;
  const resend = useMutation({
    mutationFn: async () => {
      if (email.address) await account().resendVerification(email.address);
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
        detail={
          email.address
            ? email.confirmed
              ? `A code sent to ${email.address}.`
              : `Confirm ${email.address} first.`
            : null
        }
        on={email.enabled}
      >
        {email.enabled ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => go({ name: "password", action: "emailOff" })}
          >
            Turn Off Emailed Codes
          </Button>
        ) : email.possible ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => go({ name: "password", action: "emailOn" })}
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
            onClick={() => go({ name: "password", action: "authenticatorOff" })}
          >
            Remove Authenticator App
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => go({ name: "password", action: "authenticatorOn" })}
          >
            Set Up Authenticator App
          </Button>
        )}
      </MethodRow>
      {summary.enabled ? (
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
            onClick={() => go({ name: "password", action: "newCodes" })}
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
  const open = user !== null && (requested || required || held);
  const [view, setView] = useState<View>({ name: "overview" });
  const { data: summary, error } = useQuery({
    queryKey: qk.sync.security,
    queryFn: () => account().security(),
    enabled: open,
  });
  const signOut = useMutation({ mutationFn: () => syncRuntime.signOut() });
  // The footer's right side, where the step on show puts its buttons.
  const [slot, setSlot] = useState<Slot>(null);
  const overview = () => setView({ name: "overview" });
  const close = () => {
    overview();
    setHeld(false);
    useSecurityDialog.getState().close();
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !required && close()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-md grid-cols-1 gap-4 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {required || held ? "Set up two-factor sign in" : "Two-factor sign in"}
          </DialogTitle>
          <DialogDescription>
            {required
              ? "Sign in needs a second step. Sync starts once it is set up."
              : held
                ? "Codes are emailed to you. An authenticator app is safer."
                : "A second step after your password keeps your account safe even if the password leaks."}
          </DialogDescription>
        </DialogHeader>
        <FieldError message={error ? error.message : null} />
        {summary && !summary.available ? (
          <p className="text-sm text-muted-foreground">
            Your account signs in with another account, so it has no password to protect. Nothing to
            set up here.
          </p>
        ) : null}
        {summary?.available && view.name === "overview" ? (
          <Overview summary={summary} go={setView} />
        ) : null}
        {view.name === "password" ? (
          <PasswordStep
            action={view.action}
            slot={slot}
            onBack={overview}
            onDone={(next) => setView(next)}
          />
        ) : null}
        {view.name === "scan" ? (
          <ScanStep
            uri={view.uri}
            keyText={view.key}
            slot={slot}
            onBack={overview}
            onDone={(codes) => setView({ name: "codes", codes })}
          />
        ) : null}
        {view.name === "codes" ? (
          <CodesStep
            codes={view.codes}
            slot={slot}
            onDone={() => {
              overview();
              void syncRuntime.twoFactorChanged().catch(() => {});
            }}
          />
        ) : null}
        {view.name === "addEmail" ? (
          <AddEmailStep slot={slot} onBack={overview} onDone={overview} />
        ) : null}
        <DialogFooter className="sm:justify-between">
          {required ? (
            <Button
              type="button"
              variant="destructive"
              disabled={signOut.isPending}
              onClick={() => signOut.mutate()}
            >
              Sign Out
            </Button>
          ) : null}
          <div ref={setSlot} className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row">
            {view.name === "overview" && !required ? (
              <Button type="button" variant="secondary" onClick={close}>
                {held && summary?.authenticator.enabled === false
                  ? "Proceed Without Authenticator"
                  : "Done"}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
