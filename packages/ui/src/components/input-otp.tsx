import * as React from "react";
import { OTPInput, OTPInputContext, REGEXP_ONLY_DIGITS } from "input-otp";

import { cn } from "@nookly/ui/lib/utils";

/// A one time code: one box per character, typed, pasted or filled in by the system. Built on
/// `input-otp` (the shadcn `input-otp` component), dressed like `Input`: raised boxes with the
/// same edge, shadow and focus ring. `InputOTP` is the field, `InputOTPGroup` runs boxes
/// together and `InputOTPSlot` is one box; `OtpCodeInput` is the usual six digits in two groups.
function InputOTP({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<typeof OTPInput> & { containerClassName?: string }) {
  return (
    <OTPInput
      data-slot="input-otp"
      // No room is made for a password manager's badge: there is none on a code.
      pushPasswordManagerStrategy="none"
      containerClassName={cn(
        "flex items-center justify-center gap-3 has-disabled:opacity-50",
        containerClassName,
      )}
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  );
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-group"
      className={cn("flex items-center gap-1.5", className)}
      {...props}
    />
  );
}

function InputOTPSlot({
  index,
  className,
  ...props
}: React.ComponentProps<"div"> & { index: number }) {
  const context = React.useContext(OTPInputContext);
  const { char, hasFakeCaret, isActive } = context?.slots[index] ?? {};
  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        "relative flex h-11 w-10 items-center justify-center rounded-md border border-input bg-raised text-lg font-medium shadow-control transition-colors outline-none focus-ring-active aria-invalid:border-destructive aria-invalid:[--ring:var(--destructive)]",
        className,
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-5 w-px animate-caret-blink bg-foreground motion-reduce:animate-none" />
        </div>
      )}
    </div>
  );
}

/// Six digits, in two groups of three. `onComplete` fires when the last one is in.
function OtpCodeInput({
  length = 6,
  invalid = false,
  ...props
}: Omit<React.ComponentProps<typeof InputOTP>, "maxLength" | "children" | "render"> & {
  length?: number;
  /// Every box is drawn wrong, red, with the message shown elsewhere.
  invalid?: boolean;
}) {
  const half = Math.ceil(length / 2);
  const range = (from: number, to: number) =>
    Array.from({ length: to - from }, (_, offset) => from + offset);
  return (
    <InputOTP
      maxLength={length}
      pattern={REGEXP_ONLY_DIGITS}
      inputMode="numeric"
      autoComplete="one-time-code"
      {...props}
    >
      {[range(0, half), range(half, length)].map((indexes) => (
        <InputOTPGroup key={indexes[0]}>
          {indexes.map((index) => (
            <InputOTPSlot key={index} index={index} aria-invalid={invalid || undefined} />
          ))}
        </InputOTPGroup>
      ))}
    </InputOTP>
  );
}

export { InputOTP, InputOTPGroup, InputOTPSlot, OtpCodeInput, REGEXP_ONLY_DIGITS };
