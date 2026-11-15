/// Screenshots of one page of the iPad app at every window the tablet plan checks (D83):
///
///   bun tools/e2e/tablet-shots.ts <simulator id> <route> <folder> [dark] [script]
///
/// The app lays itself out at each size through the dev only `hooks.window`, since the
/// simulators here cannot be turned or resized by hand, and each picture is cropped to that
/// window (with `ffmpeg`). `script` runs before each picture (open a popover, type into a field).
/// Needs the hub (`bun tools/e2e/mobile.ts hub 4600`) and an app built with automation.
import { mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { run, shot } from "./mobile.ts";

/// Points, as the window is in each case.
export const WINDOWS = [
  { name: "13in-landscape", width: 1376, height: 1032 },
  { name: "13in-portrait", width: 1032, height: 1376 },
  { name: "11in-landscape", width: 1210, height: 834 },
  { name: "11in-portrait", width: 834, height: 1210 },
  { name: "mini-portrait", width: 744, height: 1133 },
  { name: "slide-over", width: 375, height: 1133 },
] as const;

async function main() {
  const [simulator, route, folder, dark, script] = process.argv.slice(2);
  if (!simulator || !route || !folder) {
    console.error("Usage: <simulator id> <route> <folder> [dark] [script]");
    process.exit(1);
  }
  mkdirSync(folder, { recursive: true });
  const real = await run<{ width: number; height: number; scale: number }>(
    "tablet",
    "hooks.window(); await sleep(300); return hooks.windowSize()",
  );
  if (dark === "dark") await run("tablet", "settings.setJson('appearance.theme', 'dark')");
  try {
    for (const window of WINDOWS) {
      await run(
        "tablet",
        `hooks.window(${window.width}, ${window.height}); router.navigate(${JSON.stringify(route)}); await sleep(1200); ${script ?? ""}`,
      );
      const file = join(folder, `${window.name}${dark === "dark" ? "-dark" : ""}.png`);
      shot(simulator, file);
      // The app sits scaled in the top left corner: keep only that.
      const scale = Math.min(1, real.width / window.width, real.height / window.height);
      const width = Math.round(window.width * scale * real.scale);
      const height = Math.round(window.height * scale * real.scale);
      Bun.spawnSync([
        "ffmpeg",
        "-loglevel",
        "error",
        "-y",
        "-i",
        file,
        "-vf",
        `crop=${width}:${height}:0:0`,
        `${file}.png`,
      ]);
      renameSync(`${file}.png`, file);
      console.log(file);
    }
  } finally {
    await run("tablet", "hooks.window()");
    if (dark === "dark") await run("tablet", "settings.setJson('appearance.theme', 'system')");
  }
}

if (import.meta.main) await main();
