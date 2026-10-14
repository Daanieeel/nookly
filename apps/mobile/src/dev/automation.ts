/// Driving the app from scripts, for end to end checks (`tools/e2e/mobile.ts`).
///
/// Only when `EXPO_PUBLIC_AUTOMATION_URL` is set at bundle time (so a normal build
/// has none of it): the app asks that address for scripts, runs each with a few
/// helpers that find buttons, inputs and text in the React tree, and sends back what
/// it returned. A person never sees any of this.

type Fiber = {
  child: Fiber | null;
  sibling: Fiber | null;
  memoizedProps: Record<string, unknown> | null;
  type: unknown;
};

interface DevtoolsHook {
  getFiberRoots?: (renderer: number) => Set<{ current: Fiber }>;
  renderers?: Map<number, unknown>;
}

function roots(): Fiber[] {
  const hook = (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: DevtoolsHook })
    .__REACT_DEVTOOLS_GLOBAL_HOOK__;
  const out: Fiber[] = [];
  for (const id of hook?.renderers?.keys() ?? []) {
    for (const root of hook?.getFiberRoots?.(id) ?? []) out.push(root.current);
  }
  return out;
}

function walk(fiber: Fiber | null, visit: (f: Fiber) => boolean | void) {
  for (let f = fiber; f; f = f.sibling) {
    if (visit(f) === false) return;
    walk(f.child, visit);
  }
}

/// All text under a fiber, in order.
function textOf(fiber: Fiber): string {
  const parts: string[] = [];
  walk(fiber.child, (f) => {
    const children = f.memoizedProps?.children;
    if (typeof f.type === "string" && typeof children === "string") parts.push(children);
    else if (typeof f.type === "string" && typeof children === "number")
      parts.push(String(children));
  });
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function find(match: (f: Fiber, props: Record<string, unknown>) => boolean): Fiber | null {
  let found: Fiber | null = null;
  for (const root of roots()) {
    walk(root, (f) => {
      const props = f.memoizedProps;
      if (props && match(f, props)) {
        found = f;
        return false;
      }
    });
    if (found) break;
  }
  return found;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function waitFor<T>(check: () => T | null | undefined, ms = 10000): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = check();
    if (value) return value;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${check}`);
}

const isPressable = (props: Record<string, unknown>) => typeof props.onPress === "function";

/// Presses the button or row whose label or text is `label`.
async function press(label: string, nth = 0): Promise<boolean> {
  let seen = 0;
  const target = await waitFor(() =>
    find((f, props) => {
      if (!isPressable(props)) return false;
      const matches = props.accessibilityLabel === label || textOf(f) === label;
      return matches && seen++ === nth;
    }),
  );
  (target.memoizedProps?.onPress as (event: object) => void)({ nativeEvent: {} });
  await sleep(250);
  return true;
}

/// Types `value` into the input labelled or placeholdered `label`.
async function type(label: string, value: string): Promise<boolean> {
  const target = await waitFor(() =>
    find(
      (_f, props) =>
        typeof props.onChangeText === "function" &&
        (props.accessibilityLabel === label ||
          props.placeholder === label ||
          props.label === label),
    ),
  );
  (target.memoizedProps?.onChangeText as (text: string) => void)(value);
  await sleep(100);
  return true;
}

/// Every piece of visible text, for reading the screen.
function screenText(): string {
  const parts: string[] = [];
  for (const root of roots()) {
    walk(root, (f) => {
      const children = f.memoizedProps?.children;
      if (
        typeof f.type === "string" &&
        (typeof children === "string" || typeof children === "number")
      )
        parts.push(String(children));
    });
  }
  return parts.join("\n");
}

const labels = (): string[] => {
  const out: string[] = [];
  for (const root of roots()) {
    walk(root, (f) => {
      const props = f.memoizedProps;
      if (props && isPressable(props)) out.push(String(props.accessibilityLabel ?? textOf(f)));
    });
  }
  return out;
};

export interface AutomationContext {
  [name: string]: unknown;
}

/// Starts asking `url` for scripts. `context` is what scripts can reach by name
/// (the router, the sync runtime, the database).
export function startAutomation(url: string, device: string, context: AutomationContext) {
  const helpers = { press, type, sleep, waitFor, screenText, labels, ...context };
  let stopped = false;
  void (async () => {
    while (!stopped) {
      try {
        const response = await fetch(`${url}/poll?d=${encodeURIComponent(device)}`);
        if (response.status !== 200) continue;
        const job = (await response.json()) as { id: number; script: string };
        let body: { ok: boolean; value?: unknown; error?: string };
        try {
          const names = Object.keys(helpers);
          // The script is the developer's own, from the machine running the app.
          const run = new Function(...names, `return (async () => { ${job.script} })();`);
          body = {
            ok: true,
            value: await run(...names.map((n) => helpers[n as keyof typeof helpers])),
          };
        } catch (error) {
          body = { ok: false, error: error instanceof Error ? error.stack : String(error) };
        }
        await fetch(`${url}/result?id=${job.id}`, {
          method: "POST",
          body: JSON.stringify(body) ?? "null",
        });
      } catch {
        await sleep(1000);
      }
    }
  })();
  return () => {
    stopped = true;
  };
}
