import { describe, expect, test } from "bun:test";
import { plan } from "./ci-changes.ts";

const base = "abc123";
const ran = (files: string[] | null) => {
  const result = plan(files, base);
  return Object.entries(result)
    .filter(([name, value]) => name !== "filter" && value === true)
    .map(([name]) => name)
    .sort();
};

describe("ci plan", () => {
  test("runs everything when the changed files are unknown", () => {
    expect(plan(null, base).filter).toBe("");
    expect(ran(null)).toEqual(
      ["audit", "duplication", "format", "js", "lint", "rust", "version", "whatsNew"].sort(),
    );
  });

  test("runs everything when a file every job reads changes", () => {
    for (const file of ["bun.lock", "turbo.json", ".github/workflows/ci.yml", ".oxlintrc.json"]) {
      expect(plan([file], base).filter).toBe("");
      expect(plan([file], base).rust).toBe(true);
      expect(plan([file], base).js).toBe(true);
    }
  });

  test("a server-only change skips Rust and tests only what depends on the server", () => {
    const result = plan(["apps/server/src/app.ts"], base);
    expect(result.rust).toBe(false);
    expect(result.js).toBe(true);
    expect(result.filter).toBe(`...[${base}]`);
    expect(result.audit).toBe(false);
  });

  test("a Rust-only change skips the JS checks and the format check", () => {
    expect(ran(["apps/desktop/src-tauri/src/db/mod.rs"])).toEqual(["duplication", "rust"]);
  });

  test("a change to the shared package runs Rust too, since its tests read it", () => {
    expect(ran(["packages/shared/src/sync/engine.ts"])).toEqual(
      ["duplication", "format", "js", "lint", "rust"].sort(),
    );
  });

  test("the backup format is read by Rust", () => {
    expect(plan(["packages/frontend/src/lib/api/backup.ts"], base).rust).toBe(true);
    expect(plan(["packages/frontend/src/lib/api/tasks.ts"], base).rust).toBe(false);
  });

  test("files the JS tests read inside the Rust crate run the JS checks in full", () => {
    for (const file of [
      "apps/desktop/src-tauri/src/cli/settings-catalog.json",
      "apps/desktop/src-tauri/icons/Nookly.icon/icon.json",
    ]) {
      const result = plan([file], base);
      expect(result.js).toBe(true);
      expect(result.filter).toBe("");
    }
  });

  test("documentation only runs the format check", () => {
    expect(ran(["docs/development/server.md"])).toEqual(["format"]);
    expect(ran(["README.md"])).toEqual(["format"]);
  });

  test("Terraform and other workflows run nothing here", () => {
    expect(ran(["infrastructure/main.tf"])).toEqual([]);
    expect(ran([".github/workflows/server.yml"])).toEqual(["format"]);
  });

  test("the changelog and what's new run their checks and the tests that read them", () => {
    const result = plan(["whats-new.json"], base);
    expect(result.whatsNew).toBe(true);
    expect(result.js).toBe(true);
    expect(plan(["CHANGELOG.md"], base).whatsNew).toBe(true);
  });

  test("the version check runs when the desktop's version files change", () => {
    expect(plan(["apps/desktop/src-tauri/Cargo.toml"], base).version).toBe(true);
    expect(plan(["apps/server/package.json"], base).version).toBe(false);
  });

  test("the audit runs when a manifest or lockfile changes", () => {
    expect(plan(["apps/mobile/package.json"], base).audit).toBe(true);
    expect(plan(["apps/desktop/src-tauri/Cargo.lock"], base).audit).toBe(true);
    expect(plan(["apps/mobile/src/app.tsx"], base).audit).toBe(false);
  });

  test("an unknown file is treated as code", () => {
    expect(plan(["somewhere/new.sh"], base).js).toBe(true);
  });
});
