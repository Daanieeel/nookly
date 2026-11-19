import type { ComponentType } from "react";
import {
  IconCloudCheck,
  IconDeviceDesktop,
  IconDeviceLaptop,
  IconDeviceMobile,
} from "@tabler/icons-react";
import { badgeVariants } from "@nookly/ui/classes";
import { cn } from "@nookly/ui/lib/utils";
import { dictionary } from "@/content";
import { samples } from "@/content/samples";
import type { Locale } from "@/lib/i18n";

/// Three devices around the sync server, all on the same page.
export function DevicesMock({ locale, className }: { locale: Locale; className?: string }) {
  const t = dictionary(locale).sync;
  const s = samples(locale).devices;
  const devices: { name: string; icon: ComponentType<{ size?: number }>; soon?: boolean }[] = [
    { name: t.devices.laptop, icon: IconDeviceLaptop },
    { name: t.devices.desktop, icon: IconDeviceDesktop },
    { name: t.devices.phone, icon: IconDeviceMobile, soon: true },
  ];
  return (
    <div aria-hidden className={cn("flex flex-col items-center gap-5 select-none", className)}>
      <span className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-sm shadow-md">
        <IconCloudCheck size={16} className="text-positive" />
        <span className="font-mono text-xs">{s.server}</span>
      </span>
      <div className="relative grid w-full grid-cols-3 gap-3">
        <div className="absolute -top-5 inset-x-[16.7%]  h-5 rounded-t-lg border-x border-t border-dashed border-foreground/20" />
        <div className="absolute -top-5 left-1/2 h-5 border-l border-dashed border-foreground/20" />
        {devices.map(({ name, icon: Icon, soon }) => (
          <div
            key={name}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-2 py-4 shadow-sm",
              soon && "opacity-60",
            )}
          >
            <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-foreground">
              <Icon size={20} />
            </span>
            <span className="text-sm font-medium">{name}</span>
            <span
              className={cn(badgeVariants({ variant: soon ? "neutral" : "positive", size: "sm" }))}
            >
              {soon ? dictionary(locale).downloads.comingSoon : t.synced}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
