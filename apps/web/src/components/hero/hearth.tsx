import type { CSSProperties } from "react";
import { cn } from "@nookly/ui/lib/utils";

/// A nook by the fire: the app icon's flame, a few glassy tongues overlapping, embers
/// drifting up, and soft pebbles in Nookly's accent colours around its base. The backdrop
/// of the hero and of the closing section.

type Tongue = { cx: number; w: number; h: number; lean: number; layer: "back" | "mid" | "front" };
type Pebble = { x: number; y: number; w: number; h: number; tilt: number; tone: string };
type Ember = { x: number; y: number; r: number; delay: number; duration: number };

type Scene = {
  width: number;
  height: number;
  base: number;
  glow: { cx: number; cy: number; r: number };
  tongues: Tongue[];
  pebbles: Pebble[];
  embers: Ember[];
};

const BLUE = "var(--accent-blue)";
const GREEN = "var(--accent-green)";
const YELLOW = "var(--accent-yellow)";
const PURPLE = "var(--accent-purple)";
const PINK = "var(--accent-pink)";
const ORANGE = "var(--warning)";

const HERO: Scene = {
  width: 1600,
  height: 640,
  base: 612,
  glow: { cx: 800, cy: 420, r: 560 },
  tongues: [
    { cx: 690, w: 230, h: 500, lean: -150, layer: "back" },
    { cx: 915, w: 220, h: 480, lean: 150, layer: "back" },
    { cx: 800, w: 300, h: 585, lean: 40, layer: "mid" },
    { cx: 600, w: 190, h: 330, lean: -110, layer: "front" },
    { cx: 1000, w: 185, h: 320, lean: 105, layer: "front" },
    { cx: 805, w: 320, h: 400, lean: -60, layer: "front" },
  ],
  pebbles: [
    { x: -60, y: 520, w: 240, h: 150, tilt: 7, tone: GREEN },
    { x: 120, y: 450, w: 240, h: 230, tilt: -8, tone: BLUE },
    { x: 330, y: 530, w: 210, h: 140, tilt: 6, tone: ORANGE },
    { x: 510, y: 575, w: 180, h: 100, tilt: -4, tone: GREEN },
    { x: 665, y: 592, w: 160, h: 80, tilt: 3, tone: PURPLE },
    { x: 805, y: 596, w: 165, h: 78, tilt: -2, tone: BLUE },
    { x: 945, y: 578, w: 180, h: 96, tilt: 5, tone: PINK },
    { x: 1100, y: 535, w: 210, h: 135, tilt: -6, tone: GREEN },
    { x: 1270, y: 445, w: 230, h: 235, tilt: 9, tone: YELLOW },
    { x: 1470, y: 515, w: 220, h: 160, tilt: -5, tone: BLUE },
  ],
  embers: [
    { x: 740, y: 60, r: 4, delay: 0, duration: 7 },
    { x: 870, y: 20, r: 3, delay: 1.6, duration: 8 },
    { x: 930, y: 100, r: 5, delay: 3.1, duration: 6.5 },
    { x: 680, y: 130, r: 3, delay: 4.2, duration: 7.5 },
    { x: 820, y: 110, r: 2.5, delay: 2.4, duration: 9 },
    { x: 990, y: 50, r: 3.5, delay: 5.3, duration: 8.5 },
    { x: 610, y: 80, r: 2.5, delay: 0.9, duration: 7.8 },
    { x: 1050, y: 160, r: 3, delay: 3.8, duration: 6.8 },
  ],
};

const CLOSING: Scene = {
  width: 1600,
  height: 320,
  base: 304,
  glow: { cx: 800, cy: 260, r: 360 },
  tongues: [
    { cx: 745, w: 130, h: 230, lean: -80, layer: "back" },
    { cx: 860, w: 125, h: 220, lean: 78, layer: "back" },
    { cx: 800, w: 170, h: 300, lean: 22, layer: "mid" },
    { cx: 690, w: 110, h: 160, lean: -60, layer: "front" },
    { cx: 915, w: 105, h: 155, lean: 58, layer: "front" },
    { cx: 808, w: 185, h: 195, lean: -30, layer: "front" },
  ],
  pebbles: [
    { x: 160, y: 230, w: 220, h: 160, tilt: -7, tone: GREEN },
    { x: 360, y: 200, w: 200, h: 190, tilt: 6, tone: BLUE },
    { x: 545, y: 262, w: 160, h: 90, tilt: -3, tone: YELLOW },
    { x: 690, y: 280, w: 140, h: 70, tilt: 3, tone: PURPLE },
    { x: 815, y: 282, w: 140, h: 68, tilt: -2, tone: BLUE },
    { x: 940, y: 262, w: 160, h: 92, tilt: 4, tone: PINK },
    { x: 1080, y: 205, w: 200, h: 185, tilt: -6, tone: ORANGE },
    { x: 1260, y: 240, w: 210, h: 150, tilt: 7, tone: GREEN },
  ],
  embers: [
    { x: 760, y: 30, r: 3, delay: 0, duration: 6 },
    { x: 850, y: 10, r: 2.5, delay: 1.8, duration: 7 },
    { x: 890, y: 60, r: 3.5, delay: 3.2, duration: 6.5 },
    { x: 700, y: 70, r: 2.5, delay: 4.4, duration: 7.5 },
  ],
};

const SCENES = { hero: HERO, closing: CLOSING };

/// One flame tongue as the icon draws them: a round base, sides that swell and then pull
/// in, and a tip that curls off to the side by `lean`.
function tonguePath({ cx, w, h, lean }: Tongue, base: number) {
  const tx = cx + lean;
  const ty = base - h;
  const r = w / 2;
  const side = Math.sign(lean) || 1;
  // The outer edge leaves the tip sideways and swells; the inner edge comes up almost
  // straight, which curls the tip like the icon's.
  const outer = side > 0 ? 1 : -1;
  return [
    `M ${tx} ${ty}`,
    `C ${tx + r * 0.55 * outer} ${ty + h * 0.16} ${cx + r * 1.22 * outer} ${base - h * 0.5} ${cx + r * outer} ${base - h * 0.2}`,
    `C ${cx + r * 0.9 * outer} ${base - h * 0.03} ${cx + r * 0.45 * outer} ${base} ${cx} ${base}`,
    `C ${cx - r * 0.45 * outer} ${base} ${cx - r * 0.9 * outer} ${base - h * 0.03} ${cx - r * outer} ${base - h * 0.2}`,
    `C ${cx - r * 1.1 * outer} ${base - h * 0.46} ${tx - r * 0.2 * outer} ${ty + h * 0.42} ${tx} ${ty}`,
    "Z",
  ].join(" ");
}

const LAYER_FILL = { back: "flame-back", mid: "flame-mid", front: "flame-front" } as const;
const FLICKER: Record<Tongue["layer"], string> = {
  back: "animate-[flame-flicker_3.8s_ease-in-out_infinite]",
  mid: "animate-[flame-flicker_3.1s_ease-in-out_infinite]",
  front: "animate-[flame-flicker_2.6s_ease-in-out_infinite]",
};

export function Hearth({ scene, className }: { scene: keyof typeof SCENES; className?: string }) {
  const s = SCENES[scene];
  const id = (name: string) => `${scene}-${name}`;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${s.width} ${s.height}`}
      preserveAspectRatio="xMidYMax slice"
      overflow="visible"
      className={cn("pointer-events-none block w-full overflow-visible select-none", className)}
    >
      <defs>
        <radialGradient id={id("glow")}>
          <stop offset="0%" stopColor="#ff8a3d" style={{ stopOpacity: "var(--hearth-glow)" }} />
          <stop
            offset="55%"
            stopColor="#ff9f5a"
            style={{ stopOpacity: "calc(var(--hearth-glow) * 0.35)" }}
          />
          <stop offset="100%" stopColor="#ffb27a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id(LAYER_FILL.back)} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffb889" />
          <stop offset="100%" stopColor="#ff7a3a" />
        </linearGradient>
        <linearGradient id={id(LAYER_FILL.mid)} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffcfa6" />
          <stop offset="70%" stopColor="#ff8f4f" />
          <stop offset="100%" stopColor="#ff6a2b" />
        </linearGradient>
        <linearGradient id={id(LAYER_FILL.front)} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe2c4" />
          <stop offset="100%" stopColor="#ffab73" />
        </linearGradient>
        <radialGradient id={id("core")} cx="50%" cy="85%" r="55%">
          <stop offset="0%" stopColor="#ff5a1f" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ff5a1f" stopOpacity="0" />
        </radialGradient>
        {/* A fine grain over the pebbles, like printed paper. */}
        <filter id={id("grain")} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer result="speckle">
            <feFuncA type="table" tableValues="0 0.3" />
          </feComponentTransfer>
          <feComposite in="speckle" in2="SourceGraphic" operator="in" />
          <feBlend in="SourceGraphic" mode="multiply" />
        </filter>
      </defs>

      <circle cx={s.glow.cx} cy={s.glow.cy} r={s.glow.r} fill={`url(#${id("glow")})`} />

      <g className="animate-[hearth-in_1.6s_cubic-bezier(0.16,1,0.3,1)_both] motion-reduce:animate-none">
        {s.tongues.map((tongue, i) => (
          <path
            key={`${tongue.cx}-${tongue.h}`}
            d={tonguePath(tongue, s.base)}
            fill={`url(#${id(LAYER_FILL[tongue.layer])})`}
            fillOpacity={tongue.layer === "front" ? 0.62 : tongue.layer === "mid" ? 0.85 : 0.9}
            stroke="#fff3e6"
            strokeOpacity={0.8}
            strokeWidth={2}
            className={cn(
              "origin-bottom [transform-box:fill-box] motion-reduce:animate-none",
              FLICKER[tongue.layer],
            )}
            style={{ animationDelay: `${i * -0.7}s` } as CSSProperties}
          />
        ))}
        <ellipse
          cx={s.glow.cx}
          cy={s.base - (s.base - s.glow.cy) * 0.15}
          rx={s.tongues[2]!.w * 0.75}
          ry={s.tongues[2]!.h * 0.3}
          fill={`url(#${id("core")})`}
          style={{ mixBlendMode: "screen" }}
        />
      </g>

      {s.embers.map((ember) => (
        <circle
          key={`${ember.x}-${ember.y}`}
          cx={ember.x}
          cy={ember.y + 120}
          r={ember.r}
          fill="#ffa24c"
          className="animate-[ember-rise_var(--d)_ease-in-out_infinite] [transform-box:fill-box] motion-reduce:animate-none"
          style={
            { "--d": `${ember.duration}s`, animationDelay: `${ember.delay}s` } as CSSProperties
          }
        />
      ))}

      <g filter={`url(#${id("grain")})`}>
        {s.pebbles.map((p, i) => (
          <rect
            key={`${p.x}-${p.y}`}
            x={p.x}
            y={p.y}
            width={p.w}
            height={p.h + 120}
            rx={Math.min(p.w, p.h) * 0.48}
            transform={`rotate(${p.tilt} ${p.x + p.w / 2} ${p.y + p.h / 2})`}
            className="animate-[pebble-in_1.2s_cubic-bezier(0.16,1,0.3,1)_both] motion-reduce:animate-none"
            style={
              {
                fill: `color-mix(in oklab, ${p.tone} var(--pebble-mix), var(--card))`,
                animationDelay: `${150 + i * 60}ms`,
              } as CSSProperties
            }
          />
        ))}
      </g>
    </svg>
  );
}
