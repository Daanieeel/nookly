import type { PageSession } from "@nookly/shared/sync";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { useEffect, useState } from "react";
import { z } from "zod";

/// Who else has a live page open right now (DECISIONS.md D6), from its document's
/// awareness, shown as small initials at the top of the page.

/// What another device says about its person in the document's awareness.
const presentUser = z.object({
  name: z.string().min(1),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .catch("#64748b"),
});

interface Present {
  clientId: number;
  name: string;
  color: string;
}

/// Who else has this page open right now, from the document's awareness.
export function usePresence(session: PageSession | null): Present[] {
  const [present, setPresent] = useState<Present[]>([]);
  useEffect(() => {
    const awareness = session?.provider.awareness;
    if (!awareness) return;
    const update = () => {
      const others: Present[] = [];
      for (const [clientId, state] of awareness.getStates()) {
        if (clientId === awareness.clientID) continue;
        const user = presentUser.safeParse(state.user);
        if (user.success) others.push({ clientId, ...user.data });
      }
      setPresent(others);
    };
    update();
    awareness.on("change", update);
    return () => awareness.off("change", update);
  }, [session]);
  return present;
}

export function PresenceBar({ present }: { present: Present[] }) {
  if (present.length === 0) return null;
  return (
    <div
      role="group"
      aria-label="Also on this page"
      className="pointer-events-auto sticky top-0 z-10 float-right flex items-center -space-x-1.5"
    >
      {present.slice(0, 5).map((person) => (
        <Tooltip key={person.clientId}>
          <TooltipTrigger asChild>
            <span
              aria-label={person.name}
              className="flex size-6 items-center justify-center rounded-full border-2 border-background bg-(--presence) text-xs font-semibold text-white uppercase"
              // SAFETY: `--presence` only ever receives a hex color from `caretColor`.
              style={{ "--presence": person.color } as React.CSSProperties}
            >
              {person.name.slice(0, 1)}
            </span>
          </TooltipTrigger>
          <TooltipContent>{person.name} is here</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
