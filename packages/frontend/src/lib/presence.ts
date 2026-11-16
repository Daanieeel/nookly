import type { PageSession } from "@nookly/shared/sync";
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

export interface Present {
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
