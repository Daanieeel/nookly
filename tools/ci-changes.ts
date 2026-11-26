// Decides which parts of CI a change needs, so a documentation fix or a server-only change does
// not run the desktop's whole test suite. Used by the `changes` job in .github/workflows/ci.yml:
//   BASE=<sha> bun tools/ci-changes.ts
// It writes one `name=value` line per flag to $GITHUB_OUTPUT (or prints them). When the base is
// unknown, or a file that every job depends on changed, everything runs.
import { appendFileSync } from "node:fs";
import { $ } from "bun";

export type Plan = {
  /** cargo check, test, clippy and fmt. */
  rust: boolean;
  /** Typecheck, test and build of the JS workspaces. */
  js: boolean;
  /** `--filter` for turbo: the workspaces that changed and what depends on them, or all. */
  filter: string;
  /** oxlint and the query-key check. */
  lint: boolean;
  /** oxfmt, which also formats Markdown, JSON and YAML. */
  format: boolean;
  /** Duplicate code: TypeScript and Rust. */
  duplication: boolean;
  /** Dependency advisories: only when a manifest or lockfile changed. */
  audit: boolean;
  whatsNew: boolean;
  version: boolean;
};

const matches = (patterns: RegExp[], file: string) =>
  patterns.some((pattern) => pattern.test(file));
const some = (files: string[], patterns: RegExp[]) => files.some((file) => matches(patterns, file));

/** Everything runs when one of these changes: they feed every job. */
const EVERYTHING = [
  /^\.github\/workflows\/ci\.yml$/,
  /^tools\/ci-changes\.ts$/,
  /^(package\.json|bun\.lock|bunfig\.toml|turbo\.json|knip\.json|oxfmt\.config\.ts|\.oxlintrc\.json|\.jscpd\.json)$/,
  /^patches\//,
];

/** Files the other side reads: JS tests read the settings catalog and the app icon, Rust tests read the shared package and the backup format. */
const READ_BY_JS = [
  /^apps\/desktop\/src-tauri\/src\/cli\/settings-catalog\.json$/,
  /^apps\/desktop\/src-tauri\/icons\/Nookly\.icon\//,
];
const READ_BY_RUST = [/^packages\/shared\//, /^packages\/frontend\/src\/lib\/api\/backup\.ts$/];

const RUST = [/^apps\/desktop\//, ...READ_BY_RUST];

/** Nothing here runs in the JS jobs: the Rust crate, Terraform, other workflows, documentation. */
const NOT_JS = [
  /^apps\/desktop\/src-tauri\//,
  /^infrastructure\//,
  /^\.github\//,
  /^docs\//,
  /^(README|AGENTS|NOTES)\.md$/,
  /^(LICENSE|nookly-release\.asc)$/,
];

/** oxfmt skips the Rust crate's sources and the Terraform. */
const NOT_FORMATTED = [
  /^apps\/desktop\/src-tauri\/.*(\.rs|Cargo\.(toml|lock))$/,
  /^infrastructure\//,
];

const MANIFESTS = [/(^|\/)(package\.json|Cargo\.toml|Cargo\.lock|deny\.toml)$/, /^bun\.lock$/];
const WHATS_NEW = [
  /^(whats-new\.json|CHANGELOG\.md)$/,
  /^tools\/check-whats-new\.ts$/,
  /^packages\/frontend\/src\/(lib|features\/whats-new)\//,
];
const VERSION = [
  /^apps\/desktop\/package\.json$/,
  /^apps\/desktop\/src-tauri\/(Cargo\.toml|tauri\.conf\.json)$/,
  /^tools\/check-version\.ts$/,
];

/** The plan for the changed files, or for everything when they are unknown (`null`). */
export function plan(files: string[] | null, base: string): Plan {
  if (files === null || some(files, EVERYTHING)) {
    return {
      rust: true,
      js: true,
      filter: "",
      lint: true,
      format: true,
      duplication: true,
      audit: true,
      whatsNew: true,
      version: true,
    };
  }
  const js = files.some((file) => matches(READ_BY_JS, file) || !matches(NOT_JS, file));
  const rust = some(files, RUST);
  // A file the JS tests read cannot be traced to a workspace, so those run in full.
  const filter = some(files, READ_BY_JS) ? "" : `...[${base}]`;
  return {
    rust,
    js,
    filter,
    lint: js,
    format: files.some((file) => !matches(NOT_FORMATTED, file)),
    duplication: js || rust,
    audit: some(files, MANIFESTS),
    whatsNew: some(files, WHATS_NEW),
    version: some(files, VERSION),
  };
}

const ZERO = /^0+$/;

async function changedFiles(base: string): Promise<string[] | null> {
  if (base === "" || ZERO.test(base)) return null;
  const result = await $`git diff --name-only ${base} HEAD`.quiet().nothrow();
  if (result.exitCode !== 0) return null;
  return result
    .text()
    .split("\n")
    .filter((file) => file !== "");
}

if (import.meta.main) {
  const base = process.env.BASE ?? "";
  const result = plan(await changedFiles(base), base);
  const lines = Object.entries(result).map(([name, value]) => `${name}=${value}`);
  console.log(lines.join("\n"));
  const output = process.env.GITHUB_OUTPUT;
  if (output) appendFileSync(output, `${lines.join("\n")}\n`);
}
