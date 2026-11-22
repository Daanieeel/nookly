"use client";

import { IconList } from "@tabler/icons-react";
import { useState } from "react";

/// A pill at the foot of the screen that opens the license's parts and jumps to one, so the
/// long text can be crossed without scrolling it all.
export function LicenseContents({
  label,
  entries,
}: {
  label: string;
  entries: { id: string; title: string; level: 3 | 4 }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex flex-col items-center gap-2 px-4">
      {open && (
        <nav
          aria-label={label}
          className="pointer-events-auto max-h-[60dvh] w-full max-w-sm overflow-y-auto rounded-2xl [corner-shape:squircle] border border-border bg-popover p-2 text-sm shadow-lg"
        >
          <ul className="flex flex-col">
            {entries.map((entry) => (
              <li key={entry.id}>
                <a
                  href={`#${entry.id}`}
                  onClick={() => setOpen(false)}
                  className={`block rounded-lg [corner-shape:squircle] px-3 py-1.5 hover:bg-muted ${
                    entry.level === 3 ? "font-medium" : "pl-6 text-muted-foreground"
                  }`}
                >
                  {entry.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border bg-popover px-4 py-2 text-sm font-medium shadow-md hover:bg-muted"
      >
        <IconList size={16} />
        {label}
      </button>
    </div>
  );
}
