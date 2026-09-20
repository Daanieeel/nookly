import { IconFeather } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { createJot } from "@/lib/api/notes";
import { useNavStore } from "@/lib/store/nav";

export function QuickJotTrigger() {
  const activeSpaceId = useNavStore((s) => s.activeSpaceId);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const create = useMutation({
    // SAFETY: this mutation only ever fires from the input below, which only
    // renders (via the `if (!activeSpaceId) return null` guard above) once
    // `activeSpaceId` is non-null.
    mutationFn: (title: string) => createJot(activeSpaceId as string, title),
    onSuccess: (entity) => {
      queryClient.invalidateQueries({ queryKey: ["entities", entity.spaceId] });
      queryClient.invalidateQueries({ queryKey: ["jots-without-refinement", entity.spaceId] });
      setText("");
      setOpen(false);
    },
  });

  if (!activeSpaceId) return null;

  if (!open) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton tooltip="Quick Jot" onClick={() => setOpen(true)}>
          <IconFeather />
          <span>Quick Jot</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <Input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Jot something down…"
        className="h-8"
        disabled={create.isPending}
        onKeyDown={(e) => {
          if (e.key === "Enter" && text.trim()) create.mutate(text.trim());
          if (e.key === "Escape") {
            setText("");
            setOpen(false);
          }
        }}
        onBlur={() => {
          if (!text.trim()) setOpen(false);
        }}
      />
    </SidebarMenuItem>
  );
}
