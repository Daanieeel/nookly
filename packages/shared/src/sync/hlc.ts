/// Hybrid logical clocks. A clock is `<wall>-<counter>-<device>`: the edit's time in
/// milliseconds (13 digits), a counter that tells apart clocks of one device at the
/// same millisecond (6 digits) and the device's id. Plain string order is clock
/// order, so the server can compare clocks in SQL too.
///
/// An edit's wall time is when it was made, but never before the device's floor:
/// one past the newest clock it has seen from anyone. So an edit made after seeing
/// another device's edit always counts as the later one, even on a device whose
/// clock runs behind. The desktop's triggers read the floor from `sync_meta`.

const WALL_DIGITS = 13;
const COUNTER_DIGITS = 6;
const COUNTER_LIMIT = 10 ** COUNTER_DIGITS;

export function makeClock(wall: number, counter: number, deviceId: string): string {
  return `${String(wall).padStart(WALL_DIGITS, "0")}-${String(counter).padStart(COUNTER_DIGITS, "0")}-${deviceId}`;
}

export function clockWall(clock: string): number {
  return Number(clock.slice(0, WALL_DIGITS));
}

export function compareClocks(a: string, b: string): -1 | 0 | 1 {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function maxClock(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a < b ? b : a;
}

/// A device id may hold letters and digits only, so the clock stays parseable.
const DEVICE_ID = /^[a-z0-9]+$/i;

export class HybridClock {
  readonly deviceId: string;
  private floorWall: number;
  private counter = 0;

  constructor(deviceId: string, floor = 0) {
    if (!DEVICE_ID.test(deviceId)) throw new Error(`Invalid device id: ${deviceId}`);
    this.deviceId = deviceId;
    this.floorWall = floor;
  }

  /// The clock of an edit dated `wall`. The date already respects the floor of its
  /// time (the triggers raise it as the edit is made); raising it again now would
  /// date an edit after remote ones it never saw.
  stamp(wall: number): string {
    // Always counts up, so no two clocks of this device are ever the same.
    this.counter = (this.counter + 1) % COUNTER_LIMIT;
    return makeClock(wall, this.counter, this.deviceId);
  }

  /// Takes in a clock seen from elsewhere.
  observe(clock: string) {
    this.floorWall = Math.max(this.floorWall, clockWall(clock) + 1);
  }

  floor(): number {
    return this.floorWall;
  }
}
