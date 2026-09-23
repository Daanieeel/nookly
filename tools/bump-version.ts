// Sets one version across package.json, Cargo.toml, Cargo.lock and tauri.conf.json.
// Usage: `bun tools/bump-version.ts <major|minor|patch|x.y.z>`.
const root = `${import.meta.dir}/../`;
const files = {
  pkg: `${root}package.json`,
  tauri: `${root}src-tauri/tauri.conf.json`,
  cargo: `${root}src-tauri/Cargo.toml`,
  lock: `${root}src-tauri/Cargo.lock`,
};

const { version: current }: { version: string } = await Bun.file(files.pkg).json();
const arg = process.argv[2];
const [major, minor, patch] = current.split(/[.-]/).map(Number);

const next =
  arg === "major"
    ? `${major + 1}.0.0`
    : arg === "minor"
      ? `${major}.${minor + 1}.0`
      : arg === "patch"
        ? `${major}.${minor}.${patch + 1}`
        : arg?.replace(/^v/, "");

if (!next || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(next)) {
  console.error("Usage: bun tools/bump-version.ts <major|minor|patch|x.y.z>");
  process.exit(1);
}

// Plain text replacement so each file keeps its own formatting.
async function replace(path: string, pattern: RegExp, replacement: string) {
  const text = await Bun.file(path).text();
  if (!pattern.test(text)) throw new Error(`No version found in ${path}`);
  await Bun.write(path, text.replace(pattern, replacement));
}

await replace(files.pkg, /"version": ".+?"/, `"version": "${next}"`);
await replace(files.tauri, /"version": ".+?"/, `"version": "${next}"`);
await replace(files.cargo, /^version = ".+?"/m, `version = "${next}"`);
await replace(files.lock, /(name = "nookly"\nversion = )".+?"/, `$1"${next}"`);

console.log(`Bumped ${current} to ${next}. Commit, then push the tag v${next} to release.`);
