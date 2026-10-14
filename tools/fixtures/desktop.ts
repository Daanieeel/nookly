/// Fills a fresh desktop data folder with generated data, through the app's own CLI,
/// for trying sign in, the first sync and sync between devices on something that
/// looks like a real Nookly, without going near a real one.
///
///   cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml
///   bun tools/fixtures/desktop.ts <data folder> [--notes 120]
///   NOOKLY_DATA_DIR=<data folder> bun run tauri dev
///
/// Refuses a folder that already holds a database, and never runs against the
/// installed app's folder: it only works with a debug build, which ignores it.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = join(import.meta.dir, "..", "..");
const binary = join(root, "apps/desktop/src-tauri/target/debug/nookly");
const [folderArg, ...rest] = process.argv.slice(2);
if (!folderArg) {
  console.error("Usage: bun tools/fixtures/desktop.ts <data folder> [--notes <n>]");
  process.exit(1);
}
const folder = resolve(folderArg);
if (existsSync(join(folder, "nookly.db"))) {
  console.error(`${folder} already has a database. Use an empty folder.`);
  process.exit(1);
}
if (folder.includes("Application Support/com.nookly.app")) {
  console.error("That is the installed app's folder. Use a scratch folder.");
  process.exit(1);
}
const notesFlag = rest.indexOf("--notes");
const noteCount = notesFlag >= 0 ? Number(rest[notesFlag + 1]) : 120;
mkdirSync(folder, { recursive: true });

/// Runs one CLI command and returns the id of what it made: a Space's own id, or an
/// entity's (`data.entity.id`).
function cli(...args: string[]) {
  const run = Bun.spawnSync([binary, "cli", ...args], {
    env: { ...process.env, NOOKLY_DATA_DIR: folder },
  });
  if (run.exitCode !== 0) {
    throw new Error(`nookly cli ${args.join(" ")} failed: ${run.stderr.toString()}`);
  }
  const out = JSON.parse(run.stdout.toString());
  return { id: out?.data?.entity?.id ?? out?.data?.id ?? out?.id ?? "" };
}

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const study = cli("space", "create", "--name", "Study", "--color", "#6366f1");
const personal = cli("space", "create", "--name", "Personal", "--color", "#10b981");
const work = cli("space", "create", "--name", "Work", "--color", "#f59e0b");

// Notes with real block content.
const topics = ["Algorithms", "Linear Algebra", "Operating Systems", "Databases", "Networks"];
for (let i = 0; i < noteCount; i++) {
  const space = [study, personal, work][i % 3];
  const topic = topics[i % topics.length];
  const note = cli("note", "create", "--space", space.id, "--title", `${topic} notes ${i + 1}`);
  cli(
    "note",
    "add-block",
    note.id,
    "--type",
    "heading1",
    "--content",
    `${topic}, week ${(i % 12) + 1}`,
  );
  cli(
    "note",
    "add-block",
    note.id,
    "--type",
    "paragraph",
    "--content",
    `Key idea ${i + 1}: **${topic}** is about structure. See the lecture slides for the proof.`,
  );
  if (i % 4 === 0) {
    cli("note", "add-block", note.id, "--type", "bulleted_list", "--content", "Read chapter 3");
    cli(
      "note",
      "add-block",
      note.id,
      "--type",
      "code",
      "--content",
      'fn main() {\n  println!("hi");\n}',
      "--language",
      "rust",
    );
  }
}

// Tasks with dates and sub-tasks.
for (let i = 0; i < 40; i++) {
  const space = [study, personal, work][i % 3];
  const task = cli(
    "task",
    "create",
    "--space",
    space.id,
    "--title",
    `Task ${i + 1}: ${["Buy milk", "Submit report", "Call Ana", "Read paper", "Fix bike"][i % 5]}`,
    "--field",
    `dueDate=${day((i % 14) - 3)}`,
    "--field",
    `effort=${[1, 2, 3, 5, 8][i % 5]}`,
  );
  if (i % 5 === 0) {
    cli(
      "sub_task",
      "create",
      "--space",
      space.id,
      "--title",
      "First step",
      "--field",
      `parentId=${task.id}`,
    );
  }
}

// Study: a course with an exam, an assignment and a deck of cards.
const semester = cli("semester", "create", "--space", study.id, "--title", "WS 2026/27");
const course = cli(
  "course",
  "create",
  "--space",
  study.id,
  "--title",
  "Algorithms I",
  "--field",
  "professor=Prof. Knuth",
);
cli("relate", course.id, "course-semester", semester.id, "--yes");
cli(
  "exam",
  "create",
  "--space",
  study.id,
  "--title",
  "Algorithms final",
  "--field",
  `courseId=${course.id}`,
  "--field",
  `examDate=${day(30)}`,
);
cli(
  "assignment",
  "create",
  "--space",
  study.id,
  "--title",
  "Sheet 4",
  "--field",
  `courseId=${course.id}`,
  "--field",
  `dueDate=${day(5)}`,
);
const deck = cli("index_card_deck", "create", "--space", study.id, "--title", "Sorting");
for (const [front, back] of [
  ["Quicksort average", "O(n log n)"],
  ["Mergesort stable?", "Yes"],
  ["Heapsort worst case", "O(n log n)"],
]) {
  cli(
    "index_card_deck",
    "add-card",
    deck.id,
    "--field",
    `front=${front}`,
    "--field",
    `back=${back}`,
  );
}

// Bookmarks and files, with real bytes on disk.
cli(
  "bookmark",
  "create",
  "--space",
  personal.id,
  "--title",
  "Nookly",
  "--field",
  "url=https://example.com/nookly",
);
const sources = join(folder, "..", `${folder.split("/").pop()}-sources`);
mkdirSync(sources, { recursive: true });
for (let i = 0; i < 5; i++) {
  const path = join(sources, `lecture-${i + 1}.txt`);
  writeFileSync(path, `Lecture ${i + 1}\n${"Notes line.\n".repeat(200 + i)}`);
  cli(
    "file",
    "create",
    "--space",
    study.id,
    "--title",
    `Lecture ${i + 1}`,
    "--field",
    `localPath=${path}`,
  );
}

console.log(
  `Made a desktop with ${noteCount} notes, 40 tasks, study data, a bookmark and 5 files in ${folder}.`,
);
