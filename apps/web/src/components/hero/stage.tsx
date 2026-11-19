"use client";

import {
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  Fragment,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  IconArrowLeft,
  IconArrowRight,
  IconBook2,
  IconBriefcase,
  IconCalendarStats,
  IconCalendarWeek,
  IconCards,
  IconChecklist,
  IconChevronRight,
  IconClipboardCheck,
  IconClipboardList,
  IconFeather,
  IconHome,
  IconLayoutDashboard,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconMenu2,
  IconNotes,
  IconPin,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlus,
  IconReportAnalytics,
  IconSchool,
  IconSearch,
  IconSettings,
  IconStack2,
  IconTrash,
  IconWifi,
} from "@tabler/icons-react";
import { Card } from "@nookly/ui/components/card";
import { Kbd } from "@nookly/ui/components/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { dictionary } from "@/content";
import type { Locale } from "@/lib/i18n";
import { PaletteMock } from "../app/palette";
import { ArrowCursor, HandCursor } from "./cursors/cursors";
import { Mascot, PageView, type Stage, type View } from "./stage-views";

type Icon = ComponentType<{ size?: number; className?: string }>;
/// `tablet` is the iPad upright, `landscape` the iPad on its side once the stage is wide
/// enough for it.
type Variant = "phone" | "tablet" | "landscape" | "desktop";
type Point = { x: number; y: number };

/// The tour, in order: each stop is clicked (or tapped) and then shown for `dwell`
/// milliseconds. `palette` opens search with `⌘K`; `note` then opens the note from its
/// recents, as the app keeps recents in that palette only. The phone has no `⌘K`, so it
/// skips both.
export const TOUR: { view: View | "palette"; dwell: number }[] = [
  { view: "tasks", dwell: 2600 },
  { view: "palette", dwell: 1800 },
  { view: "note", dwell: 2800 },
  { view: "courses", dwell: 2600 },
  { view: "moodle", dwell: 2600 },
  { view: "dashboard", dwell: 2600 },
];

/// How long the pointer takes to travel, how long a press lasts, how long a drawer takes.
const MOVE = 1000;
const PRESS = 240;
const DRAWER = 650;

/// How far the frame leans back before the page scrolls, and how small it starts.
const TILT = 14;
const SHRINK = 0.06;

type DeviceSpec = {
  className: string;
  width: number;
  height: number;
  screen: { x: number; y: number; width: number; height: number; radius: number };
  fit: number;
  /// Drawn upright by the library, so it is turned a quarter to lie on its side.
  turned?: boolean;
};

/// The device frames from devices.css (MIT), with where their screens sit, in the CSS
/// pixels the library draws them in. `fit` is the scale that fills the stage's height,
/// used until the stage has been measured.
const DEVICES = {
  phone: {
    className: "device-iphone-14-pro device-black",
    width: 428,
    height: 868,
    screen: { x: 19, y: 19, width: 390, height: 830, radius: 49 },
    fit: 720 / 868,
  },
  tablet: {
    className: "device-ipad-pro device-spacegray",
    width: 560,
    height: 778,
    screen: { x: 27, y: 27, width: 506, height: 724, radius: 11 },
    fit: 760 / 778,
  },
  /// The same frame turned on its side. Its bezel is even all round, so the screen
  /// keeps its inset.
  landscape: {
    className: "device-ipad-pro device-spacegray",
    width: 778,
    height: 560,
    screen: { x: 27, y: 27, width: 724, height: 506, radius: 11 },
    fit: 1,
    turned: true,
  },
} satisfies Record<string, DeviceSpec>;

type DeviceKind = keyof typeof DEVICES;

/// The iPad's screen in points (an 11 inch iPad Pro), upright and on its side. The app is
/// drawn at this size and scaled down onto the frame's smaller screen, so it lays out as
/// on the device.
const IPAD = {
  tablet: { width: 834, height: 1194 },
  landscape: { width: 1194, height: 834 },
};

/// The Space colours the tour's Spaces wear: Studies, and Work in the bottom row.
const STUDIES = "#3b82f6";
const WORK = "#06b6d4";

type Frame = {
  ms: number;
  view: View;
  palette: boolean;
  drawer: boolean;
  pointer: string | null;
  pressed: boolean;
  /// The pointer is on its way to `pointer`, over nothing it could click.
  moving: boolean;
};

/// Every frame of the tour for one layout. The phone and the upright iPad are too narrow
/// for the sidebar beside the page, so they open it as a drawer before each page. The iPad
/// on its side keeps it beside the page, as the app does from 1000 points wide.
function framesFor(variant: Variant): Frame[] {
  let at: Frame = {
    ms: 2200,
    view: "dashboard",
    palette: false,
    drawer: false,
    pointer: null,
    pressed: false,
    moving: false,
  };
  const frames: Frame[] = [at];
  const push = (next: Partial<Frame>) => {
    at = { ...at, pressed: false, moving: false, ...next };
    frames.push(at);
  };
  const click = (target: string) => {
    push({ ms: MOVE, pointer: target, moving: true });
    push({ ms: PRESS, pressed: true });
  };
  for (const stop of TOUR) {
    if (variant === "phone" && (stop.view === "palette" || stop.view === "note")) continue;
    if (stop.view === "palette") {
      click("search");
      push({ ms: stop.dwell, palette: true });
      continue;
    }
    if (stop.view === "note") {
      click("recent-note");
      push({ ms: stop.dwell, view: "note", palette: false });
      continue;
    }
    if (variant === "phone" || variant === "tablet") {
      click("menu");
      push({ ms: DRAWER, drawer: true });
    }
    click(stop.view);
    push({ ms: stop.dwell, view: stop.view, drawer: false });
  }
  return frames;
}

/// Which layout the screen is wide enough for: the phone's, the tablet's or the desktop's.
/// The page draws all three and CSS shows one; this keeps the tour on the visible one.
function useVariant(): Variant {
  const [variant, setVariant] = useState<Variant>("desktop");
  useEffect(() => {
    // jsdom, which the tests run in, has no `matchMedia`.
    const wide = window.matchMedia?.("(min-width: 1024px)");
    const turned = window.matchMedia?.("(min-width: 768px)");
    const medium = window.matchMedia?.("(min-width: 640px)");
    if (!wide || !turned || !medium) return;
    const queries = [wide, turned, medium];
    const update = () =>
      setVariant(
        wide.matches
          ? "desktop"
          : turned.matches
            ? "landscape"
            : medium.matches
              ? "tablet"
              : "phone",
      );
    update();
    for (const query of queries) query.addEventListener("change", update);
    return () => {
      for (const query of queries) query.removeEventListener("change", update);
    };
  }, []);
  return variant;
}

/// Where `el` sits inside `root`, from layout offsets: the frame's lean, the device's
/// scale and the page's scroll do not change it, so the pointer, drawn in the same
/// space, lands on the same spot however it is seen.
export function offsetWithin(el: HTMLElement, root: HTMLElement) {
  let x = 0;
  let y = 0;
  let node: Element | null = el;
  while (node instanceof HTMLElement && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent;
  }
  return { x, y };
}

/// The element the pointer heads for. The recent note is a row of the palette, found by
/// the value it is listed under.
function findTarget(root: HTMLElement, pointer: string, noteTitle: string) {
  if (pointer === "recent-note") {
    return (
      [...root.querySelectorAll<HTMLElement>("[cmdk-item]")].find(
        (item) => item.dataset.value === noteTitle,
      ) ?? null
    );
  }
  return root.querySelector<HTMLElement>(`[data-tour-target="${pointer}"]`);
}

/// The hero's demo: Nookly itself, on the screen the visitor has. A pointer (a finger on
/// the phone and the tablet) clicks through the features: Tasks, search, a recent note,
/// the semester and Moodle, then back to the Dashboard. The frame always keeps the same
/// height and clips what does not fit, so nothing on the page moves while it plays. It
/// leans back under the download button and stands up as the page scrolls.
export function HeroStage({ locale }: { locale: Locale }) {
  const t = dictionary(locale).stage;
  const controls = dictionary(locale).hero;
  const noteTitle = dictionary(locale).keyboard.items.note;
  const variant = useVariant();
  const frames = useMemo(() => framesFor(variant), [variant]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [pointer, setPointer] = useState<Point | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // SAFETY: `index` always stays below `frames.length`, which is never zero.
  const frame = frames[index % frames.length]!;

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      setPaused(true);
    }
  }, []);

  // A new layout starts its own tour from the top.
  useEffect(() => setIndex(0), [frames]);

  // Only plays while it can be seen.
  useEffect(() => {
    const el = box.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(Boolean(entry?.isIntersecting)),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (paused || !visible) return;
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % frames.length), frame.ms);
    return () => window.clearTimeout(timer);
  }, [paused, visible, frame, frames.length]);

  useLayoutEffect(() => {
    const root = box.current?.querySelector<HTMLElement>(
      `[data-variant="${variant}"] [data-pointer-root]`,
    );
    const target = root && frame.pointer ? findTarget(root, frame.pointer, noteTitle) : null;
    if (!root || !target) return;
    const { x, y } = offsetWithin(target, root);
    setPointer({ x: x + target.offsetWidth * 0.5, y: y + target.offsetHeight * 0.55 });
  }, [frame.pointer, frame.palette, variant, noteTitle]);

  const lean = useRef<HTMLDivElement>(null);
  useLean(lean);

  const shell = (here: Variant) => ({
    view: frame.view,
    palette: frame.palette,
    drawer: frame.drawer,
    t,
    locale,
    here: variant === here,
    pointer: variant === here && !reduced ? pointer : null,
    pressed: frame.pressed,
    moving: frame.moving,
    noteTitle,
  });
  const progress = ((index + 1) / frames.length) * 100;
  const label = paused ? controls.play : controls.pause;

  return (
    <div
      ref={lean}
      // SAFETY: the two custom properties only ever receive an angle and a number.
      style={{ "--stage-tilt": `${TILT}deg`, "--stage-scale": `${1 - SHRINK}` } as CSSProperties}
      // `--frame-w` is how wide the frame is drawn before the lean scales it: the whole
      // stage on the desktop and the iPad on its side, the device's height-fitted width on
      // the phone and the upright iPad (see `Device`).
      className="relative w-full perspective-[1800px] [--frame-w:calc(720px*428/868)] sm:[--frame-w:calc(760px*560/778)] md:[--frame-w:100%]"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={label}
            // Lined up with the frame's right edge, wherever the lean has drawn it.
            style={{ right: "calc(50% - var(--stage-scale) * min(100%, var(--frame-w)) / 2)" }}
            className="absolute -top-10 z-20 flex h-7 items-center gap-2 rounded-full border border-border bg-card/80 px-2.5 text-muted-foreground shadow-xs backdrop-blur transition-colors hover:text-foreground"
          >
            {paused ? <IconPlayerPlayFilled size={12} /> : <IconPlayerPauseFilled size={12} />}
            <span className="relative h-1 w-16 overflow-hidden rounded-full bg-foreground/10">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-foreground/50 transition-[width] duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      {/* The entrance holds its own transform, so the lean lives one level in. */}
      <div className="animate-[fade-up_0.9s_ease-out_0.3s_both] motion-reduce:animate-none">
        <div
          ref={box}
          data-stage-window
          data-view={frame.palette ? "palette" : frame.view}
          inert
          aria-hidden
          // The iPad on its side is as tall as the stage's width makes it, which stays the
          // same while the tour plays.
          className="relative h-[720px] origin-top transform-[rotateX(var(--stage-tilt))_scale(var(--stage-scale))] select-none will-change-transform motion-reduce:transform-none sm:h-[760px] md:aspect-778/560 md:h-auto lg:aspect-auto lg:h-[860px]"
        >
          <div data-variant="desktop" className="hidden h-full lg:block">
            <Window {...shell("desktop")} touch={false} />
          </div>
          <div data-variant="landscape" className="hidden h-full md:block lg:hidden">
            <Ipad kind="landscape">
              <Window {...shell("landscape")} touch beside />
            </Ipad>
          </div>
          <div data-variant="tablet" className="hidden h-full sm:block md:hidden">
            <Ipad kind="tablet">
              <Window {...shell("tablet")} touch />
            </Ipad>
          </div>
          <div data-variant="phone" className="h-full sm:hidden">
            <Device kind="phone">
              <Phone {...shell("phone")} />
            </Device>
          </div>
        </div>
      </div>
    </div>
  );
}

/// The lean: tilted back while the frame's top sits low in the screen, upright once it
/// is in the upper part. Set on the stage's wrapper, so the pause button can follow it.
function useLean(box: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // Reduced motion draws the frame upright, so the button lines up with it unscaled.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      el.style.setProperty("--stage-tilt", "0deg");
      el.style.setProperty("--stage-scale", "1");
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const { top } = el.getBoundingClientRect();
      const h = window.innerHeight;
      const p = Math.min(1, Math.max(0, (h - top) / (h * 0.7)));
      el.style.setProperty("--stage-tilt", `${(1 - p) * TILT}deg`);
      el.style.setProperty("--stage-scale", `${1 - (1 - p) * SHRINK}`);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [box]);
}

/// A real device frame, scaled to fit the stage and centred in it, with the app on its
/// screen. The frame's own styles reset everything inside it, so the app does not go in
/// the frame: it lies over the frame's screen, cut to the screen's corners.
function Device({ kind, children }: { kind: DeviceKind; children: ReactNode }) {
  const d: DeviceSpec = DEVICES[kind];
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(d.fit);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      if (!el.clientWidth || !el.clientHeight) return;
      setScale(Math.min(el.clientWidth / d.width, el.clientHeight / d.height));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [d]);

  return (
    <div ref={box} className="relative size-full">
      <div
        className="absolute top-0 left-1/2 origin-top"
        style={{ width: d.width, height: d.height, transform: `translateX(-50%) scale(${scale})` }}
      >
        <div
          className={cn(
            "device",
            d.className,
            d.turned && "absolute top-1/2 left-1/2 -translate-1/2 -rotate-90",
          )}
        >
          <div className="device-frame">
            <div className="device-screen" />
          </div>
          <div className="device-stripe" />
          <div className="device-header" />
          <div className="device-sensors" />
          <div className="device-btns" />
          <div className="device-power" />
          <div className="device-home" />
        </div>
        <div
          className="absolute z-10 overflow-hidden bg-background"
          style={{
            left: d.screen.x,
            top: d.screen.y,
            width: d.screen.width,
            height: d.screen.height,
            borderRadius: d.screen.radius,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/// An iPad, upright or on its side, with the app drawn at the iPad's own size on its screen.
function Ipad({ kind, children }: { kind: "tablet" | "landscape"; children: ReactNode }) {
  const size = IPAD[kind];
  return (
    <Device kind={kind}>
      <div
        data-pointer-root
        className="relative origin-top-left"
        style={{
          width: size.width,
          height: size.height,
          transform: `scale(${DEVICES[kind].screen.width / size.width})`,
        }}
      >
        {children}
      </div>
    </Device>
  );
}

type ShellProps = {
  view: View;
  palette: boolean;
  drawer: boolean;
  t: Stage;
  locale: Locale;
  /// Whether this layout is the one on screen. Only it draws the palette and the pointer.
  here: boolean;
  pointer: Point | null;
  pressed: boolean;
  moving: boolean;
  /// The note the tour opens, under the name search lists it by.
  noteTitle: string;
};

/// A small ghost button of the app's bars, with its icon.
function BarIcon({ icon: Icon, className }: { icon: Icon; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md text-foreground [&_svg]:size-4",
        className,
      )}
    >
      <Icon />
    </span>
  );
}

/// The titlebar's path to the page, as the app's `Breadcrumbs` writes it: the pages that
/// span every Space by name, a module after its Space, a note after its Space with its key.
function Crumbs({ view, t, note }: { view: View; t: Stage; note: string }) {
  const crumb = (icon: Icon, label: string, key?: string) => (
    <span className="flex min-w-0 items-center gap-1.5 px-1.5 text-sm [&_svg]:size-3.5 [&_svg]:shrink-0">
      {key && (
        <span className="shrink-0 font-mono text-xs text-foreground tabular-nums">{key}</span>
      )}
      <Glyph icon={icon} />
      <span className="truncate">{label}</span>
    </span>
  );
  const space = (
    <>
      <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
        <IconBook2 size={14} style={{ color: STUDIES }} />
        {t.space}
      </span>
      <IconChevronRight className="size-3 shrink-0 text-muted-foreground/50" />
    </>
  );
  switch (view) {
    case "dashboard":
      return crumb(IconLayoutDashboard, t.items.dashboard);
    case "tasks":
      return crumb(IconChecklist, t.items.tasks);
    case "note":
      return (
        <>
          {space}
          {crumb(IconNotes, note, "NOT-115")}
        </>
      );
    case "courses":
      return (
        <>
          {space}
          {crumb(IconBook2, t.modules.courses)}
        </>
      );
    case "moodle":
      return (
        <>
          {space}
          {crumb(IconSchool, t.modules.moodle)}
        </>
      );
  }
}

function Glyph({ icon: Icon }: { icon: Icon }) {
  return <Icon />;
}

/// The desktop window, or with `touch` the iPad's screen. The desktop: the titlebar over
/// everything, then the floating sidebar and the page beside it, as `App` lays them out.
/// The iPad: the same shell made for fingers, with the status bar instead of the window's
/// traffic lights and the sidebar over the page, as an upright iPad is too narrow to keep
/// it beside. With `beside` (the iPad on its side) the sidebar floats beside the page as
/// on the desktop, at the tablet's own width.
function Window({
  touch,
  beside = !touch,
  ...props
}: ShellProps & { touch: boolean; beside?: boolean }) {
  const { view, drawer, t, locale, pointer, pressed } = props;
  return (
    <div
      data-pointer-root={touch ? undefined : true}
      className={cn(
        "relative flex size-full flex-col overflow-hidden bg-background",
        !touch && "rounded-xl border border-border shadow-2xl",
      )}
    >
      {touch && (
        <div className="flex h-7 shrink-0 items-center justify-between px-6 pt-1 text-xs font-semibold">
          <span>
            9:41 <span className="font-medium">{t.calendar.date}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <IconWifi size={14} />
            <Battery />
          </span>
        </div>
      )}
      <div
        className={cn(
          "relative flex h-11 shrink-0 items-center gap-1.5 border-b border-border bg-background pr-3",
          touch ? "pl-2" : "pl-[88px]",
        )}
      >
        {touch ? (
          <span data-tour-target="menu">
            <BarIcon
              icon={beside ? IconLayoutSidebarLeftCollapse : IconLayoutSidebarLeftExpand}
              className="text-muted-foreground"
            />
          </span>
        ) : (
          <span className="absolute top-1/2 left-3.5 flex -translate-y-1/2 gap-2">
            <span className="size-3 rounded-full bg-[#ff5f57]" />
            <span className="size-3 rounded-full bg-[#febc2e]" />
            <span className="size-3 rounded-full bg-[#28c840]" />
          </span>
        )}
        <span className="flex shrink-0 items-center">
          <BarIcon icon={IconArrowLeft} />
          <BarIcon icon={IconArrowRight} className="opacity-50" />
        </span>
        <span data-breadcrumb className="flex min-w-0 items-center gap-1.5">
          <Crumbs view={view} t={t} note={props.noteTitle} />
        </span>
        <span className="min-w-0 flex-1" />
        <span className="flex shrink-0 items-center text-sm">
          {!touch && (
            <>
              <span className="flex h-8 items-center gap-1.5 px-2.5">
                {t.commands}
                <Kbd>⇧⌘P</Kbd>
              </span>
              <span className="flex h-8 items-center gap-1.5 px-2.5">
                {t.quickOpen}
                <Kbd>⌘P</Kbd>
              </span>
            </>
          )}
          <span
            data-tour-target="search"
            className="flex h-8 items-center gap-1.5 px-2.5 [&_svg]:size-3.5"
          >
            <IconSearch />
            {t.search}
            <Kbd>⌘K</Kbd>
          </span>
          <span className="ml-1 flex size-7 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
            <IconSettings size={14} />
          </span>
        </span>
      </div>
      <div className={cn("relative flex min-h-0 flex-1", beside && "gap-3 px-3 py-2")}>
        {beside && (
          <aside
            className={cn("-my-2 -ml-3 flex shrink-0 flex-col p-2 pr-0.5", touch ? "w-70" : "w-64")}
          >
            <SidebarList view={view} t={t} />
          </aside>
        )}
        <div
          className={cn(
            "relative min-w-0 flex-1 overflow-hidden bg-card",
            beside && "-ml-3 rounded-xl border border-sidebar-border shadow-md",
          )}
        >
          <div
            key={view}
            className="animate-[fade-up_0.35s_ease-out_both] motion-reduce:animate-none"
          >
            <PageView view={view} t={t} locale={locale} />
          </div>
        </div>
        {!beside && (
          <Drawer open={drawer} className="w-72 p-2">
            <SidebarList view={view} t={t} />
          </Drawer>
        )}
      </div>
      <PaletteLayer {...props} />
      <Pointer at={pointer} pressed={pressed} moving={props.moving} touch={touch} large={touch} />
    </div>
  );
}

/// The sidebar sliding in over the page, with the page dimmed behind it.
function Drawer({
  open,
  className,
  children,
}: {
  open: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <>
      <div
        className={cn(
          "absolute inset-0 z-10 bg-black/25 transition-opacity duration-300",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        className={cn(
          "absolute inset-y-0 left-0 z-20 flex flex-col bg-background shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          open ? "translate-x-0" : "translate-x-[-105%]",
          className,
        )}
      >
        {children}
      </aside>
    </>
  );
}

function Battery() {
  return (
    <span className="h-2.5 w-5 rounded-[3px] border border-foreground/60 p-px">
      <span className="block h-full w-3/4 rounded-[1px] bg-foreground" />
    </span>
  );
}

/// Search over the page, as `⌘K` opens it.
function PaletteLayer({ palette, here, locale }: ShellProps) {
  return (
    <div
      className={cn(
        "absolute inset-0 z-30 bg-background/40 transition-opacity duration-300",
        palette ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      {palette && here && (
        <div className="mx-auto mt-20 w-[min(560px,90%)] animate-[fade-up_0.3s_ease-out_both] motion-reduce:animate-none">
          <PaletteMock locale={locale} />
        </div>
      )}
    </div>
  );
}

type RowSpec = { icon: Icon; label: string; target?: View };

/// The sidebar as `AppSidebar` draws it: the mascot's card with the day, the customize
/// button, the pages that span every Space, the active Space's name over its modules,
/// then the bottom row with the Spaces. The rows the tour visits say so.
function SidebarList({ view, t }: { view: View; t: Stage }) {
  const top: RowSpec[] = [
    { icon: IconLayoutDashboard, label: t.items.dashboard, target: "dashboard" },
    { icon: IconCalendarWeek, label: t.items.calendar },
    { icon: IconChecklist, label: t.items.tasks, target: "tasks" },
    { icon: IconClipboardCheck, label: t.items.assignments },
    { icon: IconPin, label: t.items.pinned },
    { icon: IconFeather, label: t.items.jot },
  ];
  // The Space's modules, with the icons `MODULE_ICONS` gives them. Tasks is open on its
  // saved Views, as the row expands in the app.
  const modules: RowSpec[] = [
    { icon: IconChecklist, label: t.modules.tasks },
    { icon: IconClipboardList, label: t.modules.assignments },
    { icon: IconBook2, label: t.modules.courses, target: "courses" },
    { icon: IconCalendarStats, label: t.modules.exams },
    { icon: IconNotes, label: t.modules.notes },
    { icon: IconCards, label: t.modules.decks },
    { icon: IconSchool, label: t.modules.moodle, target: "moodle" },
    { icon: IconReportAnalytics, label: t.modules.grades },
  ];
  return (
    <div className="flex h-full flex-col">
      <Card className="mb-1 flex-row items-center gap-2 p-2">
        <span className="relative size-7 shrink-0">
          <Mascot size={36} className="absolute -top-1 -left-1" />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5 text-xs">
          <span className="truncate text-accent-foreground/70">{t.mascot.date}</span>
          <span className="truncate text-accent-foreground">{t.mascot.stat}</span>
        </span>
      </Card>
      <span className="mb-2 flex justify-end">
        <BarIcon icon={IconSettings} className="text-sidebar-foreground" />
      </span>
      <div className="flex flex-col gap-0.5">
        {top.map((row) => (
          <Row key={row.label} {...row} active={row.target === view} />
        ))}
      </div>
      <span className="mt-3 flex h-7 items-center gap-2 px-2 text-xs font-medium text-sidebar-foreground/70">
        <IconBook2 size={14} style={{ color: STUDIES }} />
        {t.space}
      </span>
      <div className="flex flex-col gap-0.5">
        {modules.map((row, i) => (
          <Fragment key={row.label}>
            <Row {...row} active={row.target === view} />
            {i === 0 && <SavedViews names={t.views} />}
          </Fragment>
        ))}
      </div>
      <div className="mt-auto flex items-center gap-0.5 pt-4 text-sidebar-foreground">
        <BarIcon icon={IconPlus} />
        <span className="flex size-7 items-center justify-center rounded-md bg-sidebar-accent">
          <IconBook2 size={15} style={{ color: STUDIES }} />
        </span>
        <span className="flex size-7 items-center justify-center rounded-md">
          <IconHome size={15} className="text-accent-green" />
        </span>
        <span className="flex size-7 items-center justify-center rounded-md">
          <IconBriefcase size={15} style={{ color: WORK }} />
        </span>
        <span className="mx-1 ml-auto h-4 w-px shrink-0 bg-sidebar-border" />
        <BarIcon icon={IconTrash} />
        <BarIcon icon={IconLayoutSidebarLeftCollapse} />
      </div>
    </div>
  );
}

/// A module's saved Views under its row (`ExpandableModuleChildren`): sub rows with the
/// View's icon, then the row that makes a new one.
function SavedViews({ names }: { names: readonly string[] }) {
  return (
    <span className="flex flex-col gap-1 py-0.5">
      {names.map((name) => (
        <span
          key={name}
          className="flex h-7 items-center gap-2 rounded-md pr-2 pl-9 text-sm text-sidebar-foreground"
        >
          <IconStack2 size={14} className="shrink-0 text-sidebar-accent-foreground" />
          <span className="truncate">{name}</span>
        </span>
      ))}
    </span>
  );
}

/// A sidebar row (`SidebarMenuButton`): the icon and the name, filled when it is the page.
function Row({ icon: Icon, label, target, active }: RowSpec & { active: boolean }) {
  return (
    <span
      data-tour-target={target}
      data-active={target ? active : undefined}
      className={cn(
        "flex h-8 items-center gap-2 rounded-md p-2 text-sm text-sidebar-foreground transition-colors duration-200",
        active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
      )}
    >
      <Icon size={16} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </span>
  );
}

/// The phone app on the iPhone's screen: the status bar around the Dynamic Island, the
/// bar with the sidebar button and, on Home, the date and the connection instead of a
/// name, the page, and the sidebar as a drawer over it.
function Phone(props: ShellProps) {
  const { view, drawer, t, locale, pointer, pressed } = props;
  const title =
    view === "tasks"
      ? t.items.tasks
      : view === "courses"
        ? t.modules.courses
        : view === "moodle"
          ? t.modules.moodle
          : null;
  return (
    <div data-pointer-root className="relative size-full overflow-hidden bg-background">
      <div className="flex h-14 items-center justify-between px-8 pt-2 text-sm font-semibold">
        <span>9:41</span>
        <span className="h-[34px] w-[120px] rounded-full bg-black" />
        <span className="flex items-center gap-1.5">
          <IconWifi size={15} />
          <Battery />
        </span>
      </div>
      <div className="relative flex h-11 items-center px-3">
        <span
          data-tour-target="menu"
          className="flex size-10 items-center justify-center rounded-full"
        >
          <IconMenu2 size={20} />
        </span>
        {title ? null : (
          <span className="absolute inset-x-16 flex flex-col items-center text-center leading-tight">
            <span className="truncate text-[15px] font-semibold">{t.calendar.date}</span>
          </span>
        )}
      </div>
      <div key={view} className="animate-[fade-up_0.35s_ease-out_both] motion-reduce:animate-none">
        {title && <p className="truncate px-4 pb-2 font-display text-[34px] font-bold">{title}</p>}
        <div className={cn(view !== "dashboard" && "mx-3 overflow-hidden rounded-2xl bg-card")}>
          <PageView view={view} t={t} locale={locale} compact />
        </div>
      </div>
      <Drawer open={drawer} className="w-[82%] px-2 pt-16 pb-8">
        <SidebarList view={view} t={t} />
      </Drawer>
      <Pointer at={pointer} pressed={pressed} touch />
    </div>
  );
}

/// The macOS cursors (`cursors/cursors.tsx`): drawn in a 256 unit box at the arrow's size
/// on screen, each with its hotspot (the arrow's tip, the fingertip) in those units.
const CURSOR_SIZE = 32;
const CURSORS = {
  arrow: { Glyph: ArrowCursor, hotspot: { x: 79, y: 36 } },
  hand: { Glyph: HandCursor, hotspot: { x: 92, y: 42 } },
};

/// The macOS cursor on the desktop, a fingertip on the phone and the tablet. The cursor is
/// the arrow on its way and the pointing hand over what it clicks, as over Nookly's buttons.
function Pointer({
  at,
  pressed,
  moving = false,
  touch = false,
  large = false,
}: {
  at: Point | null;
  pressed: boolean;
  moving?: boolean;
  touch?: boolean;
  /// The iPad is drawn at its size in points and scaled down, so its finger is bigger.
  large?: boolean;
}) {
  const style: CSSProperties = {
    transform: at
      ? `translate(${at.x}px, ${at.y}px) scale(${pressed ? 0.82 : 1})`
      : "translate(50%, 60%)",
  };
  const motion = cn(
    "pointer-events-none absolute top-0 left-0 z-40 transition-[transform,opacity] duration-900 ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none",
    at ? "opacity-100" : "opacity-0",
  );
  if (touch) {
    return (
      <span
        style={style}
        className={cn(
          motion,
          "rounded-full border border-foreground/25 bg-foreground/15 shadow-md",
          large ? "-mt-7 -ml-7 size-14" : "-mt-5 -ml-5 size-10",
        )}
      />
    );
  }
  const shown = at && !moving ? "hand" : "arrow";
  return (
    <span data-cursor={shown} style={style} className={motion}>
      {Object.entries(CURSORS).map(([name, { Glyph, hotspot }]) => (
        <Glyph
          key={name}
          size={CURSOR_SIZE}
          className={cn("absolute top-0 left-0 max-w-none", name !== shown && "opacity-0")}
          style={{
            translate: `${(-hotspot.x * CURSOR_SIZE) / 256}px ${(-hotspot.y * CURSOR_SIZE) / 256}px`,
          }}
        />
      ))}
    </span>
  );
}
