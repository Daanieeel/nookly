import { IconArrowRight } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { StatusButtonContent, statusOf } from "@/components/action-feedback";
import { Button } from "@/components/ui/button";
import type { Entity } from "@/lib/api/types";
import { refineJotIntoNote } from "./refine-jot";

/// Top of a Jot's right sidebar. Success navigates to the new Note, which
/// unmounts this button, so it shows no success state of its own.
export function RefineJotButton({ jot }: { jot: Entity }) {
  const queryClient = useQueryClient();
  const refine = useMutation({ mutationFn: () => refineJotIntoNote(jot, queryClient) });
  const status = refine.isSuccess ? "idle" : statusOf(refine);

  return (
    <Button
      variant="secondary"
      size="sm"
      className="w-full justify-start gap-1.5 [&_svg]:size-3.5"
      disabled={Boolean(jot.deletedAt)}
      onClick={() => !refine.isPending && refine.mutate()}
    >
      <StatusButtonContent
        status={status}
        icon={<IconArrowRight size={14} />}
        label="Refine into New Note"
        errorLabel="Couldn't create Note, try again"
      />
    </Button>
  );
}
