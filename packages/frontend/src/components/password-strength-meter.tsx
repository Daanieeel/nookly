import { passwordStrength } from "@nookly/shared/password-strength";
import { cn } from "@nookly/ui/lib/utils";
import { useMemo } from "react";

/// The colour of the filled bars and the word, by zxcvbn's score.
const TONES = [
  { bar: "bg-destructive", text: "text-destructive" },
  { bar: "bg-destructive", text: "text-destructive" },
  { bar: "bg-caution", text: "text-caution" },
  { bar: "bg-positive", text: "text-positive" },
  { bar: "bg-positive", text: "text-positive" },
] as const;

/// How hard `password` is to guess, in four bars and a word under the field it rates. It
/// advises and never blocks: a weak password is the person's to choose. Nothing shows while
/// the field is empty.
export function PasswordStrengthMeter({
  password,
  userInputs = [],
}: {
  password: string;
  /// Words that make it easier to guess for whoever knows the person (name, email).
  userInputs?: readonly string[];
}) {
  const inputs = userInputs.join("\n");
  const strength = useMemo(
    () => passwordStrength(password, inputs ? inputs.split("\n") : []),
    [password, inputs],
  );
  if (!strength) return null;
  const tone = TONES[strength.score];
  const filled = Math.max(1, strength.score);
  return (
    <div
      role="meter"
      aria-label="Password strength"
      aria-valuemin={0}
      aria-valuemax={4}
      aria-valuenow={strength.score}
      aria-valuetext={strength.label}
      className="flex items-center gap-3"
    >
      <div aria-hidden className="flex flex-1 gap-1">
        {[1, 2, 3, 4].map((bar) => (
          <span
            key={bar}
            className={cn("h-1 flex-1 rounded-full", bar <= filled ? tone.bar : "bg-muted")}
          />
        ))}
      </div>
      <span aria-hidden className={cn("w-16 text-right text-xs font-medium", tone.text)}>
        {strength.label}
      </span>
    </div>
  );
}
