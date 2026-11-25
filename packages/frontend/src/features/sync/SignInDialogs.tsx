import { EMAIL_CHANGE_COPY, codeSentText, emailSchema, errorToShow } from "@nookly/shared/api";
import { IconMail } from "@tabler/icons-react";
import { useId, useState } from "react";
import { FieldError, StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { FormField } from "#/components/form-field.tsx";
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
import { OtpCodeInput } from "@nookly/ui/components/input-otp";
import { NewPasswordFields, useNewPassword } from "./NewPasswordFields.tsx";
import { signedInAccount } from "./sync-instance.ts";
import { useAccountChange } from "./useAccountChange.ts";

const CODE_LENGTH = 6;

/// A new address for a way of signing in, confirmed with the code sent to it. With `add`,
/// it is how Nookly Signin is added: its address, the code, and a password.
function EmailForm({
  provider,
  add,
  onDone,
}: {
  provider: string;
  add: boolean;
  onDone: () => void;
}) {
  const emailId = useId();
  const [email, setEmail] = useState("");
  // The address the code went to; null while it is being typed.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const password = useNewPassword();
  const valid = emailSchema.safeParse(email.trim());
  const send = useAccountChange(
    (address: string) => signedInAccount().sendEmailCode(provider, address),
    (_, address) => setSentTo(address),
  );
  const save = useAccountChange(
    (input: { email: string; password: string | null }) =>
      input.password === null
        ? signedInAccount().changeEmail(provider, input.email, code)
        : signedInAccount().addPassword(input.email, code, input.password),
    onDone,
  );
  const label = EMAIL_CHANGE_COPY[add ? "add" : "change"].title;
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (sentTo === null) {
          if (valid.success) send.mutate(valid.data);
          return;
        }
        if (code.length !== CODE_LENGTH) return;
        const chosen = add ? password.submit() : null;
        if (add && chosen === null) return;
        save.mutate({ email: sentTo, password: chosen });
      }}
    >
      {sentTo === null ? (
        <FormField label="Email" htmlFor={emailId} required>
          <IconInput
            icon={IconMail}
            id={emailId}
            type="email"
            placeholder="ada@example.com"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </FormField>
      ) : (
        <>
          <div className="flex flex-col items-center gap-2">
            <OtpCodeInput
              aria-label="Code from the email"
              length={CODE_LENGTH}
              autoFocus
              value={code}
              onChange={(next) => {
                setCode(next);
                if (save.isError) save.reset();
              }}
              invalid={save.isError}
            />
            <p className="text-center text-xs text-muted-foreground">{codeSentText(sentTo)}</p>
          </div>
          {add ? <NewPasswordFields password={password} /> : null}
        </>
      )}
      <FieldError message={errorToShow(send.error) ?? errorToShow(save.error)} />
      <DialogFooter>
        {sentTo === null ? null : (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSentTo(null);
              setCode("");
              save.reset();
              send.reset();
            }}
          >
            Back
          </Button>
        )}
        {sentTo === null ? (
          <Button type="submit" disabled={send.isPending || !valid.success}>
            <StatusButtonContent
              status={statusOf(send)}
              label="Send Code"
              successLabel="Sent"
              errorLabel="Couldn't send"
            />
          </Button>
        ) : (
          <Button type="submit" disabled={save.isPending || code.length !== CODE_LENGTH}>
            <StatusButtonContent
              status={statusOf(save)}
              label={label}
              successLabel="Saved"
              errorLabel="Couldn't save"
            />
          </Button>
        )}
      </DialogFooter>
    </form>
  );
}

export function EmailDialog({
  request,
  onClose,
}: {
  request: { provider: string; add: boolean } | null;
  onClose: () => void;
}) {
  const copy = EMAIL_CHANGE_COPY[request?.add === true ? "add" : "change"];
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.text}</DialogDescription>
        </DialogHeader>
        {request ? <EmailForm {...request} onDone={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PasswordForm({ onClose }: { onClose: () => void }) {
  const password = useNewPassword();
  const change = useAccountChange((next: string) => signedInAccount().setPassword(next), onClose);
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const next = password.submit();
        if (next !== null) change.mutate(next);
      }}
    >
      <NewPasswordFields password={password} />
      <FieldError message={errorToShow(change.error)} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={change.isPending}>
          <StatusButtonContent
            status={statusOf(change)}
            label="Change Password"
            successLabel="Changed"
            errorLabel="Couldn't change it"
          />
        </Button>
      </DialogFooter>
    </form>
  );
}

export function PasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
          <DialogDescription className="sr-only">Enter a new password twice.</DialogDescription>
        </DialogHeader>
        <PasswordForm onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}
