import { HAPTIC_NAMES, HAPTIC_PATTERNS, createHaptics, patternOf } from "./haptics.ts";

function setup(enabled = true) {
  let time = 1000;
  const played: { name: string; fallback: string; beats: number }[] = [];
  const haptic = createHaptics({
    now: () => time,
    enabled: () => enabled,
    play: (events, fallback) => {
      played.push({ name: patternOf(events) ?? "?", fallback, beats: events.length });
    },
  });
  return {
    haptic,
    played,
    wait: (ms: number) => {
      time += ms;
    },
  };
}

describe("haptics", () => {
  it("plays a named pattern with its fallback", () => {
    const { haptic, played } = setup();
    haptic("toggle");
    expect(played).toEqual([{ name: "toggle", fallback: "rigid", beats: 1 }]);
  });

  it("gives every pattern beats inside the engine's range", () => {
    for (const [name, pattern] of Object.entries(HAPTIC_PATTERNS)) {
      expect(pattern.events.length).toBeGreaterThan(0);
      for (const beat of pattern.events) {
        expect(beat.intensity).toBeGreaterThan(0);
        expect(beat.intensity).toBeLessThanOrEqual(1);
        expect(beat.sharpness).toBeGreaterThanOrEqual(0);
        expect(beat.sharpness).toBeLessThanOrEqual(1);
        expect(beat.time).toBeGreaterThanOrEqual(0);
      }
      // Subtle: no pattern runs longer than a quarter of a second.
      const end = Math.max(...pattern.events.map((b) => b.time + (b.duration ?? 0)));
      expect({ name, end: end <= 0.25 }).toEqual({ name, end: true });
    }
  });

  it("drops a repeat that comes too soon, so scrolling a picker never buzzes", () => {
    const { haptic, played, wait } = setup();
    for (let i = 0; i < 10; i += 1) {
      haptic("select");
      wait(10);
    }
    expect(played.length).toBeLessThanOrEqual(3);
    wait(200);
    haptic("select");
    expect(played.at(-1)?.name).toBe("select");
  });

  it("lets a stronger pattern through right after a weaker one", () => {
    const { haptic, played, wait } = setup();
    haptic("select");
    wait(5);
    haptic("success");
    expect(played.map((p) => p.name)).toEqual(["select", "success"]);
  });

  it("coalesces a weaker pattern into a stronger one that just played", () => {
    const { haptic, played, wait } = setup();
    haptic("complete");
    wait(5);
    haptic("tap");
    expect(played.map((p) => p.name)).toEqual(["complete"]);
  });

  it("plays nothing when haptics are off", () => {
    const { haptic, played } = setup(false);
    for (const name of HAPTIC_NAMES) haptic(name);
    expect(played).toEqual([]);
  });
});
