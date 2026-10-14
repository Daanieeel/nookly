import { z } from "zod";

const message = z.union([
  z.string(),
  z.object({ message: z.string() }).transform((e) => e.message),
]);

/// The first error of a TanStack Form field once touched, like the desktop's `fieldMessage`.
export function fieldError(field: {
  state: { meta: { isTouched: boolean; errors: unknown[] } };
}): string | undefined {
  if (!field.state.meta.isTouched) return undefined;
  const parsed = message.safeParse(field.state.meta.errors[0]);
  return parsed.success ? parsed.data : undefined;
}
