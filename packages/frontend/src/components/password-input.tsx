import { useRef, useState, type ComponentProps, type ComponentType } from "react";
import { IconEye, IconEyeOff, IconLock } from "@tabler/icons-react";
import { Button } from "@nookly/ui/components/button";
import { IconInput } from "@nookly/ui/components/icon-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";

/// A password field: a lock on the left and an eye on the right that shows or hides what is
/// typed. Revealing keeps the cursor in the field.
export function PasswordInput({
  icon = IconLock,
  disabled,
  noun = "Password",
  ...props
}: Omit<ComponentProps<typeof IconInput>, "type" | "icon" | "trailing" | "ref"> & {
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /// What the eye shows and hides, as it is called in its label.
  noun?: string;
}) {
  const [shown, setShown] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const label = `${shown ? "Hide" : "Show"} ${noun}`;
  return (
    <IconInput
      {...props}
      ref={input}
      icon={icon}
      type={shown ? "text" : "password"}
      disabled={disabled}
      trailing={
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="iconSm"
              className="absolute top-1/2 right-0.5 -translate-y-1/2"
              aria-label={label}
              aria-pressed={shown}
              disabled={disabled}
              // Keep the focus in the field so revealing never interrupts typing.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setShown(!shown);
                input.current?.focus();
              }}
            >
              {shown ? <IconEyeOff /> : <IconEye />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      }
    />
  );
}
