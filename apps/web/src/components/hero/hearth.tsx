import type { CSSProperties } from "react";
import { cn } from "@nookly/ui/lib/utils";

/// The app icon's own flame (`public/hearth/flame.webp`, cut from the icon's layers) with
/// its glow and embers drifting up, standing on the bottom edge of the picture so it sits
/// right on whatever comes next. The backdrop of the closing section and the 404 page.

/// The flame artwork's size in pixels; its bottom edge is the flat base of the fire.
const FLAME_W = 558;
const FLAME_H = 409;

type Ember = { x: number; y: number; r: number; delay: number; duration: number };

type Scene = {
  width: number;
  height: number;
  /// A wide, flat oval of light, so it spreads along the edge instead of rising as a dome.
  glow: { cx: number; cy: number; rx: number; ry: number };
  /// How tall the flame stands on the bottom edge, centred on `glow.cx`.
  flame: number;
  embers: Ember[];
};

const CLOSING: Scene = {
  width: 1600,
  height: 320,
  glow: { cx: 800, cy: 300, rx: 620, ry: 240 },
  flame: 270,
  embers: [
    { x: 760, y: 30, r: 3, delay: 0, duration: 6 },
    { x: 850, y: 10, r: 2.5, delay: 1.8, duration: 7 },
    { x: 890, y: 60, r: 3.5, delay: 3.2, duration: 6.5 },
    { x: 700, y: 70, r: 2.5, delay: 4.4, duration: 7.5 },
  ],
};

const SCENES = { closing: CLOSING };

export function Hearth({ scene, className }: { scene: keyof typeof SCENES; className?: string }) {
  const s = SCENES[scene];
  const glow = `${scene}-glow`;
  const width = (s.flame * FLAME_W) / FLAME_H;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${s.width} ${s.height}`}
      preserveAspectRatio="xMidYMax slice"
      overflow="visible"
      className={cn("pointer-events-none block w-full overflow-visible select-none", className)}
    >
      <defs>
        <radialGradient id={glow}>
          <stop offset="0%" stopColor="#ff8a3d" style={{ stopOpacity: "var(--hearth-glow)" }} />
          <stop
            offset="45%"
            stopColor="#ff9f5a"
            style={{ stopOpacity: "calc(var(--hearth-glow) * 0.3)" }}
          />
          <stop offset="100%" stopColor="#ffb27a" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx={s.glow.cx} cy={s.glow.cy} rx={s.glow.rx} ry={s.glow.ry} fill={`url(#${glow})`} />

      <g className="animate-[hearth-in_1.6s_cubic-bezier(0.16,1,0.3,1)_both] motion-reduce:animate-none">
        <image
          href="/hearth/flame.webp"
          x={s.glow.cx - width / 2}
          y={s.height - s.flame}
          width={width}
          height={s.flame}
          className="origin-bottom animate-[flame-flicker_3.4s_ease-in-out_infinite] transform-fill motion-reduce:animate-none"
        />
      </g>

      {s.embers.map((ember) => (
        <circle
          key={`${ember.x}-${ember.y}`}
          cx={ember.x}
          cy={ember.y + 120}
          r={ember.r}
          fill="#ffa24c"
          className="animate-[ember-rise_var(--d)_ease-in-out_infinite] transform-fill motion-reduce:animate-none"
          // SAFETY: `--d` only ever receives the ember's duration in seconds.
          style={
            { "--d": `${ember.duration}s`, animationDelay: `${ember.delay}s` } as CSSProperties
          }
        />
      ))}
    </svg>
  );
}
