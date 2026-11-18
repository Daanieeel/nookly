/// Drives a debug desktop build started with `NOOKLY_AUTOMATION_PORT` (see
/// `src-tauri/src/automation.rs`): runs scripts in its webview with a few DOM
/// helpers, and screenshots its window without bringing it forward.
///
///   bun tools/e2e/desktop.ts <port> "return document.title"
///   bun tools/e2e/desktop.ts <port> --shot out.png

/// Helpers every script gets: find by visible text or label, click, type, wait.
const PRELUDE = String.raw`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const visible = (el) => el && el.getClientRects().length > 0;
const byText = (text, selector = "button, [role=button], [role=radio], [role=tab], a, [role=menuitem]") =>
  [...document.querySelectorAll(selector)].find((el) => visible(el) && (el.getAttribute("aria-label") === text || el.textContent.trim() === text));
const byLabel = (label) => {
  const l = [...document.querySelectorAll("label")].find((x) => x.textContent.replace("*", "").trim().startsWith(label));
  return l && (document.getElementById(l.htmlFor) || l.querySelector("input,textarea"));
};
const waitFor = async (check, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await check(); if (v) return v; await sleep(100); }
  throw new Error("timed out waiting for " + check);
};
const click = async (text) => { const el = await waitFor(() => byText(text)); el.click(); await sleep(150); return true; };
const type = async (label, value) => {
  const el = await waitFor(() => byLabel(label));
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
  await sleep(50);
  return true;
};
const text = () => document.body.innerText;
/// Clicks the visible label \`label\` (a sidebar row, a list row), through whatever
/// clickable element holds it.
const clickText = async (label, nth = 0) => {
  const el = await waitFor(() =>
    [...document.querySelectorAll("body *")].filter(
      (e) => visible(e) && e.children.length === 0 && e.textContent.trim() === label,
    )[nth],
  );
  (el.closest("button, a, [role=button], [role=link], [role=row], [role=option], [role=menuitem], [role=gridcell], li, [tabindex]") || el).click();
  await sleep(250);
  return true;
};
`;

export async function run<T = unknown>(port: number, script: string): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${port}/eval`, {
    method: "POST",
    body: `${PRELUDE}\n${script}`,
  });
  // SAFETY: `automation.rs` always answers `{ ok, value }` or `{ ok, error }`.
  const out = (await response.json()) as { ok: boolean; value?: T; error?: string };
  if (!out.ok) throw new Error(out.error);
  // SAFETY: the caller names what its script returns; it is JSON from the webview.
  return out.value as T;
}

/// The process listening on the automation port: the app being driven, not any
/// other Nookly that runs on this machine.
function pidOf(port: number): number {
  const proc = Bun.spawnSync(["lsof", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"]);
  const pid = Number(proc.stdout.toString().trim().split("\n")[0]);
  if (!pid) throw new Error(`nothing listens on ${port}`);
  return pid;
}

/// The id of the driven app's main window, for `screencapture -l`.
export async function windowId(port: number): Promise<number> {
  const swift = `import CoreGraphics
let list = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as! [[String: Any]]
for w in list where (w["kCGWindowOwnerPID"] as? Int) == ${pidOf(port)} && (w["kCGWindowName"] as? String) == "Nookly" {
  print(w["kCGWindowNumber"]!); break
}`;
  const proc = Bun.spawnSync(["swift", "-"], { stdin: new TextEncoder().encode(swift) });
  const id = Number(proc.stdout.toString().trim());
  if (!id) throw new Error(`no window for the app on ${port}`);
  return id;
}

export async function shot(port: number, path: string) {
  const id = await windowId(port);
  const proc = Bun.spawnSync(["screencapture", "-x", "-o", "-l", String(id), path]);
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString());
}

if (import.meta.main) {
  const [port, ...rest] = process.argv.slice(2);
  if (rest[0] === "--shot") await shot(Number(port), rest[1]);
  else console.log(JSON.stringify(await run(Number(port), rest.join(" ")), null, 2));
}
