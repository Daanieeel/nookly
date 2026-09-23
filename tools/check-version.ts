// Checks that package.json, Cargo.toml and tauri.conf.json agree on one version,
// and that it is ahead of the latest release tag (`v*`). A commit that is itself
// tagged with its version is allowed to equal it. Run with `bun tools/check-version.ts`.
import { $, semver } from "bun";

const root = `${import.meta.dir}/../`;

const { version: pkg }: { version: string } = await Bun.file(`${root}package.json`).json();
const { version: tauri }: { version: string } = await Bun.file(
  `${root}src-tauri/tauri.conf.json`,
).json();
const cargo = (await Bun.file(`${root}src-tauri/Cargo.toml`).text()).match(
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

const order = semver.order(pkg, latest);
const headTags = (await $`git -C ${root} tag --points-at HEAD`.text()).split("\n");

if (order > 0 || (order === 0 && headTags.includes(`v${pkg}`))) {
  console.log(`Version ${pkg} OK (latest release is ${latest}).`);
} else {
  console.error(
    `Version ${pkg} is not ahead of the latest release ${latest}. Bump the version in package.json, src-tauri/Cargo.toml and src-tauri/tauri.conf.json.`,
  );
  process.exit(1);
}
