import type { CSSProperties } from "react";
import { cn } from "@nookly/ui/lib/utils";

/// A nook by the fire: the app icon's own flame and glow (`public/hearth/flame.webp`, cut
/// from the icon's layers) burning on two crossed logs, a ring of hearth stones around it
/// and embers drifting up. The backdrop of the closing section and the 404 page.

/// The flame artwork's size in pixels; its bottom edge is the flat base of the fire.
const FLAME_W = 558;
const FLAME_H = 409;

/// The flame height the stones and logs below are drawn for. Other scenes scale them.
const REFERENCE_FLAME = 600;

/// A hearth stone, placed from the middle of the fire's base in those units. `skew` moves
/// its crown off centre so no two look alike; `warm` is how much firelight it catches, in
/// percent.
type Stone = { dx: number; dy: number; w: number; h: number; skew: number; warm: number };
type Ember = { x: number; y: number; r: number; delay: number; duration: number };

type Scene = {
  width: number;
  height: number;
  base: number;
  glow: { cx: number; cy: number; r: number };
  /// How tall the flame stands on `base`, centred on `glow.cx`. Logs and stones scale
  /// with it.
  flame: number;
  embers: Ember[];
};

const BACK_STONES: Stone[] = [
  { dx: -318, dy: -34, w: 104, h: 70, skew: -0.12, warm: 12 },
  { dx: -222, dy: -28, w: 84, h: 58, skew: 0.1, warm: 22 },
  { dx: 226, dy: -28, w: 86, h: 60, skew: -0.08, warm: 22 },
  { dx: 322, dy: -34, w: 108, h: 72, skew: 0.14, warm: 12 },
];

const FRONT_STONES: Stone[] = [
  { dx: -356, dy: 8, w: 126, h: 80, skew: 0.1, warm: 8 },
  { dx: -246, dy: 20, w: 140, h: 86, skew: -0.14, warm: 18 },
  { dx: -124, dy: 30, w: 150, h: 84, skew: 0.08, warm: 30 },
  { dx: 2, dy: 36, w: 160, h: 82, skew: -0.04, warm: 36 },
  { dx: 128, dy: 30, w: 148, h: 86, skew: 0.12, warm: 30 },
  { dx: 250, dy: 20, w: 138, h: 82, skew: -0.1, warm: 18 },
  { dx: 358, dy: 8, w: 128, h: 78, skew: 0.06, warm: 8 },
];

/// Two logs crossed under the flame, hiding its flat base.
const LOGS = [
  { tilt: -9, length: 540, thickness: 52 },
  { tilt: 9, length: 540, thickness: 52 },
];

const CLOSING: Scene = {
  width: 1600,
  height: 320,
  base: 290,
  glow: { cx: 800, cy: 250, r: 360 },
  flame: 270,
  embers: [
    { x: 760, y: 30, r: 3, delay: 0, duration: 6 },
    { x: 850, y: 10, r: 2.5, delay: 1.8, duration: 7 },
    { x: 890, y: 60, r: 3.5, delay: 3.2, duration: 6.5 },
    { x: 700, y: 70, r: 2.5, delay: 4.4, duration: 7.5 },
  ],
};

const SCENES = { closing: CLOSING };

/// A stone's outline around its own centre: a flat bottom, a crown pushed off centre.
function stonePath({ w, h, skew }: Stone) {
  const x = w / 2;
  const y = h / 2;
  const crown = skew * w;
  return [
    `M ${-x} ${y * 0.3}`,
    `C ${-x} ${-y * 0.55} ${crown - x * 0.55} ${-y} ${crown} ${-y}`,
    `C ${crown + x * 0.6} ${-y} ${x} ${-y * 0.45} ${x} ${y * 0.25}`,
    `C ${x} ${y * 0.85} ${x * 0.55} ${y} 0 ${y}`,
    `C ${-x * 0.6} ${y} ${-x} ${y * 0.85} ${-x} ${y * 0.3}`,
    "Z",
  ].join(" ");
}

function Stones({
  stones,
  cx,
  base,
  k,
  sheen,
  delay,
}: {
  stones: Stone[];
  cx: number;
  base: number;
  k: number;
  sheen: string;
  delay: number;
}) {
  return stones.map((stone, i) => {
    const d = stonePath(stone);
    return (
      <g
        key={`${stone.dx}-${stone.dy}`}
        transform={`translate(${cx + stone.dx * k} ${base + stone.dy * k}) scale(${k})`}
      >
        <path
          d={d}
          className="animate-[stone-in_1.2s_cubic-bezier(0.16,1,0.3,1)_both] motion-reduce:animate-none"
          style={{
            fill: `color-mix(in oklab, var(--hearth-stone), #ff8a3d ${stone.warm}%)`,
            animationDelay: `${delay + i * 60}ms`,
          }}
        />
        <path d={d} fill={`url(#${sheen})`} />
      </g>
    );
  });
}

export function Hearth({ scene, className }: { scene: keyof typeof SCENES; className?: string }) {
  const s = SCENES[scene];
  const id = (name: string) => `${scene}-${name}`;
  const cx = s.glow.cx;
  const k = s.flame / REFERENCE_FLAME;
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
        <linearGradient id={id("bark")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#b07a52" />
          <stop offset="100%" stopColor="#6b4128" />
        </linearGradient>
        {/* Light from above, and from the fire, on every stone. */}
        <linearGradient id={id("sheen")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff6ec" stopOpacity="0.45" />
          <stop offset="55%" stopColor="#fff6ec" stopOpacity="0" />
        </linearGradient>
        {/* A fine grain over the stones and logs, like printed paper. */}
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

      <g filter={`url(#${id("grain")})`}>
        <Stones stones={BACK_STONES} cx={cx} base={s.base} k={k} sheen={id("sheen")} delay={150} />
      </g>

      <g className="animate-[hearth-in_1.6s_cubic-bezier(0.16,1,0.3,1)_both] motion-reduce:animate-none">
        <image
          href="/hearth/flame.webp"
          x={cx - (s.flame * FLAME_W) / FLAME_H / 2}
          y={s.base - s.flame}
          width={(s.flame * FLAME_W) / FLAME_H}
          height={s.flame}
          className="origin-bottom animate-[flame-flicker_3.4s_ease-in-out_infinite] transform-fill motion-reduce:animate-none"
        />
        <g filter={`url(#${id("grain")})`}>
          {LOGS.map((log) => {
            const end = log.length / 2 - log.thickness * 0.34;
            return (
              <g
                key={log.tilt}
                transform={`translate(${cx} ${s.base - 14 * k}) scale(${k}) rotate(${log.tilt})`}
              >
                <rect
                  x={-log.length / 2}
                  y={-log.thickness / 2}
                  width={log.length}
                  height={log.thickness}
                  rx={log.thickness / 2}
                  fill={`url(#${id("bark")})`}
                  stroke="#ffe9d2"
                  strokeOpacity={0.45}
                  strokeWidth={2}
                />
                <path
                  d={`M ${-end + 30} -8 H ${end - 90} M ${-end + 80} 9 H ${end - 30}`}
                  stroke="#4a2a17"
                  strokeOpacity={0.35}
                  strokeWidth={3}
                  strokeLinecap="round"
                />
                {[-end, end].map((x) => (
                  <g key={x}>
                    <ellipse
                      cx={x}
                      cy={0}
                      rx={log.thickness * 0.3}
                      ry={log.thickness * 0.44}
                      fill="#e9bf91"
                      stroke="#b98057"
                      strokeWidth={2}
                    />
                    <ellipse
                      cx={x}
                      cy={0}
                      rx={log.thickness * 0.14}
                      ry={log.thickness * 0.22}
                      fill="none"
                      stroke="#b98057"
                      strokeWidth={1.5}
                    />
                  </g>
                ))}
              </g>
            );
          })}
        </g>
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

      <g filter={`url(#${id("grain")})`}>
        <Stones stones={FRONT_STONES} cx={cx} base={s.base} k={k} sheen={id("sheen")} delay={400} />
      </g>
    </svg>
  );
}
