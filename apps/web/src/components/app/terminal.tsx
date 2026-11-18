import { cn } from "@nookly/ui/lib/utils";
import { samples } from "@/content/samples";
import type { Locale } from "@/lib/i18n";

/// An agent at work in a terminal: it reads Moodle through the CLI and files what it
/// found in Nookly.
export function TerminalMock({ locale, className }: { locale: Locale; className?: string }) {
  const s = samples(locale).terminal;
  return (
    <div
      aria-hidden
      className={cn(
        "overflow-hidden rounded-xl border border-white/10 bg-[#141414] text-[#e6e6e6] shadow-xl select-none",
        className,
      )}
    >
      <div className="flex h-9 items-center gap-1.5 border-b border-white/10 px-3">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 font-mono text-[11px] text-white/45">{s.prompt}</span>
      </div>
      <div className="flex flex-col gap-1.5 p-4 font-mono text-[12.5px] leading-relaxed">
        {s.lines.map((line) => (
          <p
            key={line.text}
            className={cn(
              "break-all",
              line.kind === "cmd" && "text-white",
              line.kind === "out" && "text-white/50",
              line.kind === "note" && "text-[#00cb50]",
            )}
          >
            {line.kind === "cmd" && <span className="mr-2 text-[#47a8ff]">$</span>}
            {line.text}
          </p>
        ))}
        <p className="text-white">
          <span className="mr-2 text-[#47a8ff]">$</span>
          <span className="inline-block h-4 w-2 translate-y-0.5 animate-pulse bg-white/70" />
        </p>
      </div>
    </div>
  );
}
