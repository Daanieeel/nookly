/// Drives the mobile app in a simulator (see `apps/mobile/src/dev/automation.ts`).
///
///   bun tools/e2e/mobile.ts hub 4600                    the go between, left running
///   bun tools/e2e/mobile.ts run phone "await press('Sign In')"
///   bun tools/e2e/mobile.ts shot <simulator id> out.png
///
/// The app is started with EXPO_PUBLIC_AUTOMATION_URL=http://127.0.0.1:4600 and
/// EXPO_PUBLIC_AUTOMATION_DEVICE=phone (or tablet).

const HUB = process.env.NOOKLY_HUB ?? "http://127.0.0.1:4600";

async function hub(port: number) {
  interface Job {
    id: number;
    script: string;
    resolve: (body: string) => void;
  }
  const queues = new Map<string, Job[]>();
  const waiting = new Map<number, Job>();
  const pollers = new Map<string, ((job: Job) => void)[]>();
  let next = 0;
  const give = (device: string, job: Job) => {
    const poller = pollers.get(device)?.shift();
    if (poller) poller(job);
    else queues.set(device, [...(queues.get(device) ?? []), job]);
  };
  Bun.serve({
    port,
    idleTimeout: 120,
    async fetch(request) {
      const url = new URL(request.url);
      const device = url.searchParams.get("d") ?? "phone";
      if (url.pathname === "/poll") {
        const queued = queues.get(device)?.shift();
        const job =
          queued ??
          (await Promise.race([
            new Promise<Job>((resolve) =>
              pollers.set(device, [...(pollers.get(device) ?? []), resolve]),
            ),
            Bun.sleep(25_000).then(() => null),
          ]));
        if (!job) return new Response(null, { status: 204 });
        waiting.set(job.id, job);
        return Response.json({ id: job.id, script: job.script });
      }
      if (url.pathname === "/result") {
        const job = waiting.get(Number(url.searchParams.get("id")));
        waiting.delete(job?.id ?? -1);
        job?.resolve(await request.text());
        return new Response("ok");
      }
      if (url.pathname === "/run") {
        const script = await request.text();
        const body = await new Promise<string>((resolve) => {
          const job: Job = { id: ++next, script, resolve };
          setTimeout(
            () => resolve(JSON.stringify({ ok: false, error: "timed out (is the app up?)" })),
            90_000,
          );
          give(device, job);
        });
        return new Response(body, { headers: { "content-type": "application/json" } });
      }
      return new Response("not found", { status: 404 });
    },
  });
  console.log(`hub on ${port}`);
}

export async function run<T = unknown>(device: string, script: string): Promise<T> {
  const response = await fetch(`${HUB}/run?d=${encodeURIComponent(device)}`, {
    method: "POST",
    body: script,
  });
  // SAFETY: the hub passes on what `automation.ts` answers: `{ ok, value }` or `{ ok, error }`.
  const out = (await response.json()) as { ok: boolean; value?: T; error?: string };
  if (!out.ok) throw new Error(out.error);
  // SAFETY: the caller names what its script returns; it is JSON from the app.
  return out.value as T;
}

export function shot(simulator: string, path: string) {
  const proc = Bun.spawnSync(["xcrun", "simctl", "io", simulator, "screenshot", path]);
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString());
}

if (import.meta.main) {
  const [command, a, b] = process.argv.slice(2);
  if (command === "hub") await hub(Number(a ?? 4600));
  else if (command === "run") console.log(JSON.stringify(await run(a, b), null, 2));
  else if (command === "shot") shot(a, b);
  else console.error("Usage: hub <port> | run <device> <script> | shot <simulator id> <file>");
}
