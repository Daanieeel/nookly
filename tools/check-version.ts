// Checks that apps/desktop/package.json, Cargo.toml and tauri.conf.json agree on one version,
// and that it is not behind the latest release tag (`v*`). Equal is fine: the version
// stays at the last release until the next one is cut. Run with `bun tools/check-version.ts`.
import { $, semver } from "bun";

const root = `${import.meta.dir}/../`;

const { version: pkg }: { version: string } = await Bun.file(
  `${root}apps/desktop/package.json`,
).json();
const { version: tauri }: { version: string } = await Bun.file(
  `${root}apps/desktop/src-tauri/tauri.conf.json`,
).json();
const cargo = (await Bun.file(`${root}apps/desktop/src-tauri/Cargo.toml`).text()).match(
  /^version = "(.+)"/m,
)?.[1];

if (pkg !== tauri || pkg !== cargo) {
  console.error(
    `Version mismatch: package.json=${pkg} tauri.conf.json=${tauri} Cargo.toml=${cargo}`,
  );
  process.exit(1);
}

const tags = (await $`git -C ${root} tag --list 'v*'`.text())
  .split("\n")
  .map((tag) => tag.trim().replace(/^v/, ""))
  .filter((version) => /^\d+\.\d+\.\d+/.test(version));
const latest = tags.sort(semver.order).at(-1);

if (!latest) {
  console.log(`Version ${pkg} OK (no releases yet).`);
  process.exit(0);
}

if (semver.order(pkg, latest) >= 0) {
  console.log(`Version ${pkg} OK (latest release is ${latest}).`);
} else {
  console.error(
    `Version ${pkg} is behind the latest release ${latest}. Bump the version in apps/desktop/package.json, apps/desktop/src-tauri/Cargo.toml and apps/desktop/src-tauri/tauri.conf.json.`,
  );
  process.exit(1);
}
