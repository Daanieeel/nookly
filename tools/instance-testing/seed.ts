// Deterministic seed of a Nookly data dir through the real CLI. Usage: bun seed.ts <dataDir> <binary> <manifestOut>
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [dataDir, bin, out] = process.argv.slice(2);
const env = { ...process.env, NOOKLY_DATA_DIR: dataDir, NOOKLY_NO_SEED: "1" };
const filesDir = join(dataDir, "..", "seed-files");
mkdirSync(filesDir, { recursive: true });
const fails: string[] = [];
const counts: Record<string, number> = {};

function cli(args: string[]): any {
  const r = spawnSync(bin, ["cli", ...args], { env, encoding: "utf8", maxBuffer: 1 << 26 });
  try {
    const j = JSON.parse(r.stdout || r.stderr);
    if (j.error) {
      fails.push(args.slice(0, 3).join(" ") + ": " + j.error.message);
      return null;
    }
    return j;
  } catch {
    fails.push(args.slice(0, 3).join(" ") + ": unparsable " + (r.stderr || r.stdout).slice(0, 120));
    return null;
  }
}
const idOf = (j: any) => j?.data?.entity?.id ?? j?.data?.id ?? j?.id ?? null;
function mk(
  type: string,
  space: string,
  title: string,
  fields: Record<string, string> = {},
): string | null {
  const args = [type, "create", "--space", space, "--title", title];
  for (const [k, v] of Object.entries(fields)) args.push("--field", `${k}=${v}`);
  const id = idOf(cli(args));
  if (id) counts[type] = (counts[type] ?? 0) + 1;
  return id;
}

const spaces: string[] = [];
for (const [name, color] of [
  ["Uni", "blue"],
  ["Home", "green"],
  ["Projects", "orange"],
] as const) {
  const j = cli(["space", "create", "--name", name, "--color", color]);
  if (j?.id) spaces.push(j.id);
}
counts.space = spaces.length;
const labels: string[] = [];
for (const s of spaces)
  for (const [n, c] of [
    ["urgent", "red"],
    ["later", "blue"],
    ["idea", "green"],
  ] as const) {
    const j = cli(["label", "create", "--space", s, "--name", n, "--color", c]);
    if (j?.id) labels.push(j.id);
  }
counts.label = labels.length;

const ids: Record<string, string[]> = {};
const push = (t: string, id: string | null) => {
  if (id) (ids[t] ??= []).push(id);
};
const words =
  "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon".split(
    " ",
  );
const text = (i: number) =>
  `${words[i % 20]} ${words[(i * 7) % 20]} ${words[(i * 3) % 20]} ünïcödé 日本語 🚀 line ${i}`;

for (let i = 0; i < 6; i++) push("semester", mk("semester", spaces[0], `Semester ${i + 1}`));
for (let i = 0; i < 8; i++) push("course", mk("course", spaces[0], `Course ${i + 1} ${text(i)}`));
for (let i = 0; i < 20; i++)
  push(
    "assignment",
    mk("assignment", spaces[0], `Assignment ${i + 1}`, { courseId: ids.course[i % 8] }),
  );
for (let i = 0; i < 8; i++)
  push("exam", mk("exam", spaces[0], `Exam ${i + 1}`, { courseId: ids.course[i % 8] }));
for (let i = 0; i < 100; i++) {
  const id = mk("note", spaces[i % 3], `Note ${i + 1} ${text(i)}`);
  push("note", id);
  if (id) {
    cli(["note", "add-block", id, "--type", "heading", "--content", `Heading ${i}`]);
    cli([
      "note",
      "add-block",
      id,
      "--type",
      "paragraph",
      "--content",
      text(i) + " ".repeat(1) + "x".repeat(200),
    ]);
  }
}
for (let i = 0; i < 150; i++) push("jot", mk("jot", spaces[i % 3], `Jot ${i + 1} ${text(i)}`));
for (let i = 0; i < 100; i++)
  push(
    "task",
    mk("task", spaces[i % 3], `Task ${i + 1}`, {
      dueDate: `2026-12-${String((i % 28) + 1).padStart(2, "0")}`,
    }),
  );
for (let i = 0; i < 50; i++)
  push(
    "sub_task",
    mk("task", spaces[i % 3], `Sub-task ${i + 1}`, { parentId: ids.task[(i * 2) % 100] }),
  );
for (let i = 0; i < 40; i++)
  push(
    "bookmark",
    mk("bookmark", spaces[i % 3], `Bookmark ${i + 1}`, { url: `https://example.com/page/${i}` }),
  );
for (let i = 0; i < 10; i++) push("recipe", mk("recipe", spaces[1], `Recipe ${i + 1}`));
for (let i = 0; i < 5; i++)
  push("index_card_deck", mk("index_card_deck", spaces[0], `Deck ${i + 1}`));
for (let i = 0; i < 30; i++)
  push(
    "calendar_entry",
    mk("calendar_entry", spaces[1], `Event ${i + 1}`, {
      date: `2026-12-${String((i % 28) + 1).padStart(2, "0")}`,
    }),
  );

// files with known hashes
const fileManifest: { title: string; sha256: string; bytes: number }[] = [];
const sizes = [1, 10, 100, 2_000, 20_000, 200_000, 1_000_000, 3_000_000, 7_000_000, 12_000_000];
for (let i = 0; i < 24; i++) {
  const bytes = sizes[i % sizes.length] + i;
  const buf = randomBytes(bytes);
  const name = i === 3 ? `ünïcödé 日本語 ${i}.bin` : `file-${i}.bin`;
  const p = join(filesDir, name);
  writeFileSync(p, buf);
  const id = mk("file", spaces[i % 3], `File ${i + 1}`, { localPath: p });
  push("file", id);
  if (id)
    fileManifest.push({
      title: `File ${i + 1}`,
      sha256: createHash("sha256").update(buf).digest("hex"),
      bytes,
    });
}
// a duplicate-content file: same bytes attached twice must dedupe in storage but stay two entities
{
  const buf = randomBytes(50_000);
  const p = join(filesDir, "dup.bin");
  writeFileSync(p, buf);
  const sha = createHash("sha256").update(buf).digest("hex");
  for (const t of ["Dup A", "Dup B"]) {
    const id = mk("file", spaces[0], t, { localPath: p });
    push("file", id);
    if (id) fileManifest.push({ title: t, sha256: sha, bytes: buf.length });
  }
}

// labels and relationships
let rel = 0;
for (let i = 0; i < 60; i++) {
  const id = ids.note?.[i];
  if (id && cli(["label", "attach", id, labels[i % labels.length]])) rel++;
}
counts.labelAttachments = rel;
let rels = 0;
for (let i = 0; i < 24; i++) {
  const a = ids.course?.[i % 8],
    b = ids.note?.[i * 3];
  if (a && b && cli(["relate", a, "course-notes", b, "--yes"])) rels++;
}
for (let i = 0; i < 20; i++) {
  const a = ids.note?.[i],
    b = ids.file?.[i];
  if (a && b && cli(["relate", a, "attached-file", b, "--yes"])) rels++;
}
counts.relationships = rels;
// trash
let trashed = 0;
for (const [t, n] of [
  ["note", 8],
  ["jot", 8],
  ["task", 4],
] as const)
  for (let i = 0; i < n; i++) {
    const id = ids[t]?.[t === "task" ? 90 + i : 90 + i - (t === "note" ? 0 : 0)];
    if (id && cli([t, "delete", id, "--yes"])) trashed++;
  }
counts.trashed = trashed;

writeFileSync(
  out,
  JSON.stringify(
    {
      dataDir,
      spaces,
      counts,
      files: fileManifest,
      fails: fails.slice(0, 40),
      failCount: fails.length,
    },
    null,
    1,
  ),
);
console.log(
  JSON.stringify({ counts, failCount: fails.length, firstFails: fails.slice(0, 8) }, null, 1),
);
