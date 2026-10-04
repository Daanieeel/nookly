// Fails when the built frontend grows past its size budget.
//
//   bun tools/check-bundle-size.ts           check dist against tools/bundle-budget.json
//   bun tools/check-bundle-size.ts --update  set the budget to today's size plus 10%
//
// Run after `bun run build`. Sizes are gzipped, which is what a download costs. The
// budget has headroom so ordinary work doesn't trip it; a real jump does, and that
// is the moment to look at what got pulled in.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { gzipSync } from "node:zlib";

const ASSETS = "apps/desktop/dist/assets";
const BUDGET_FILE = "tools/bundle-budget.json";
const HEADROOM = 1.1;

const KEYS = ["largestJsChunkGzipKb", "totalJsGzipKb", "totalCssGzipKb"] as const;
type Budget = Record<(typeof KEYS)[number], number>;

function gzipKb(path: string): number {
  return gzipSync(readFileSync(path)).length / 1024;
}

function measure() {
  const files = readdirSync(ASSETS);
  const sizes = (ext: string) =>
    files.filter((f) => f.endsWith(ext)).map((f) => gzipKb(join(ASSETS, f)));
  const js = sizes(".js");
  const css = sizes(".css");
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  return {
    largestJsChunkGzipKb: Math.max(...js),
    totalJsGzipKb: sum(js),
    totalCssGzipKb: sum(css),
  };
}

const now = measure();

if (process.argv.includes("--update")) {
  const budget = {
    largestJsChunkGzipKb: Math.ceil(now.largestJsChunkGzipKb * HEADROOM),
    totalJsGzipKb: Math.ceil(now.totalJsGzipKb * HEADROOM),
    totalCssGzipKb: Math.ceil(now.totalCssGzipKb * HEADROOM),
  } satisfies Budget;
  writeFileSync(BUDGET_FILE, `${JSON.stringify(budget, null, 2)}\n`);
  console.log(`Wrote ${BUDGET_FILE}:`, budget);
  process.exit(0);
}

const budget: Budget = JSON.parse(readFileSync(BUDGET_FILE, "utf8"));
let over = false;
for (const key of KEYS) {
  const ok = now[key] <= budget[key];
  over ||= !ok;
  console.log(
    `${ok ? "ok  " : "OVER"} ${key}: ${now[key].toFixed(0)} kB gzip, budget ${budget[key]} kB`,
  );
}
if (over) {
  console.error(
    `\nThe build is over its size budget. If the growth is intended, run \`bun tools/check-bundle-size.ts --update\` and commit ${BUDGET_FILE}.`,
  );
  process.exit(1);
}
