//! The text of `--help`, and the guide written for agents.

use super::*;

pub(super) fn top_level_help() -> Value {
    let entity_types: Vec<&'static str> = schema::all().iter().map(|d| d.entity_type).collect();
    json!({
        "usage": "nookly cli <command> [args] [--flags]",
        "note": "Every command is non-interactive. Only destructive verbs (delete, relate, unrelate and similar) take --yes; create, update and the rest reject it. \
                 Output is JSON on stdout always (pretty when attached to a TTY, compact when piped); \
                 errors are JSON on stderr with a non-zero exit code.",
        "discovery": "Run `nookly cli schema` first, it dumps every entity type's fields and every \
                      relationship type in one call, so you never need to hardcode this app's data model.",
        "entityCommands": {
            "usage": "nookly cli <entity-type> <list|get|create|update|duplicate|convert|delete|restore> ...",
            "ids": "Every entity <id> argument (get, update, delete, restore, blocks, relate, label attach, \
                    entity_ref --field values) also accepts the entity's `key`, e.g. TSK-14.",
            "entityTypes": entity_types,
            "describe": "nookly cli describe <entity-type>  (or `nookly cli <entity-type>` with no verb): \
                         that type's fields, block commands and relationship types",
            "list": "nookly cli <entity-type> list [--space <id>] [--include-deleted] [--since <30m|24h|7d|date|timestamp>] \
                     [--label <name>[,<name>...]] [--fields a,b,...] [--limit <n>]  (--since keeps rows changed since \
                     then, newest first; --label keeps rows carrying every named label (AND match, case insensitive) \
                     and requires --space since labels are siloed per Space; --fields labels works here too, same \
                     shape as on get; block pages also report lastEditedAt, blockCount and bodySize so you can gauge \
                     a get first)",
            "get": "nookly cli <entity-type> get <id> [<id> ...] [--summary | --fields a,b,...]  (includes relationships, \
                    labels, mentionedIn backlinks, a `size` hint and a `revision`. --summary cuts long strings to \
                    excerpts and adds a heading outline for block pages; --fields returns just those fields, e.g. \
                    title,updatedAt. Several ids return {count, items}, a bad id becomes an {ref, error} row)",
            "create": "nookly cli <entity-type> create --space <id> --title <title> [--icon <icon>] [--field name=value ...]",
            "update": "nookly cli <entity-type> update <id> [--title <t>] [--icon <i>] [--pinned true|false] [--space <id>] \
                       [--field name=value ...] [--if-revision <rev>]  (response lists `changes`, before and after per field. \
                       --space moves the entity and everything it structurally owns, e.g. a Task's sub-tasks, to that Space)",
            "duplicate": "nookly cli <entity-type> duplicate <id>  (a copy in the same Space titled \"<title> (copy)\", \
                          with the same fields, icon, labels and block content)",
            "convert": "nookly cli <entity-type> convert <id> --to <entity-type> [--if-revision <rev>]  (turns the entity into \
                        another type in place, keeping its id, relationships, labels and pin; `describe <type>` lists \
                        `convertsTo`, e.g. a file from a link becoming a bookmark)",
            "delete": "nookly cli <entity-type> delete <id> --yes [--if-revision <rev>]  (soft delete only, goes to Trash, never permanent)",
            "restore": "nookly cli <entity-type> restore <id>",
            "export": "nookly cli <entity-type> export <id> [--out <path>]  (types that report `portable` in `describe`: \
                       the entity as a Nookly JSON file, printed or written to --out. Ids, timestamps, labels, \
                       relationships and the Space stay behind)",
            "import": "nookly cli <entity-type> import --file <path> --space <id> [--parent <id>]  (creates a new entity \
                       from a file `export` wrote, all or nothing, never changing an existing one. A type with \
                       `portable.parentType`, an assignment, needs --parent <course id>)",
            "grep": "block pages only: `nookly cli <type> grep <id> <pattern> [--regex] [--case-sensitive] [--context <n>] \
                     [--max <n>]`  (matching lines with blockId/blockIndex, instead of pulling the whole page)",
            "childCollections": "records an entity owns that aren't entities, like a deck's cards (`describe <type>` \
                                 lists `childCollections` with every command): `nookly cli <type> <plural> <id>`, \
                                 `add-<singular> <id> --field ...`, `get-<singular>`, `update-<singular>`, \
                                 `delete-<singular> --yes` (soft), `restore-<singular>`, and per collection actions \
                                 such as `index_card_deck review-card <card-id> --field rating=good`.",
            "blocks": "block pages only: note, jot, task and sub_task (`describe <type>` reports supportsBlocks), full block editing: \
                       `nookly cli <type> blocks <id> [--offset <n>] [--limit <n>]`, `add-block <id> --type <t> --content <c> [--language <l>] [--filename <f>] [--attr <name>=<value> ...]`, \
                       `update-block <block-id> [--content <c>] [--type <t>] [--language <l>] [--filename <f>] [--attr <name>=<value> ...]`, \
                       `delete-block <block-id> --yes`, `reorder-blocks <id> <block-id> <block-id> ...`. \
                       `--language`/`--filename` are the code block header row and only apply to `type=code`. \
                       `--attr` sets a custom block's settings (callout variant, timeline title, ...); \
                       `describe note` lists them under `blockAttrs`. \
                       See `describe note` for the full list of known block types. Every block write takes \
                       `--if-revision <rev>` (the page's revision from `get`).",
        },
        "safety": {
            "dryRun": "Add --dry-run to any command: it runs for real inside a transaction that is always rolled \
                       back, so you see the exact result (and `changes` for update/update-block) with nothing \
                       written. --yes is not needed with --dry-run. Database only: a file import still copies the file.",
            "ifRevision": "`get` returns a `revision`. Pass it back as --if-revision <rev> on update, delete or any \
                           block write; if the entity changed in between, the write is refused with a `Conflict` \
                           error instead of overwriting someone else's edit.",
        },
        "coreCommands": {
            "schema": "nookly cli schema  (the whole data model: every entity type + relationship type)",
            "describe": "nookly cli describe <entity-type>  (one entity type: fields, block commands, relationship types)",
            "relate": "nookly cli relate <from-id> <relationship-type> <to-id> [<to-id> ...] --yes  (several targets \
                       are created all or nothing)",
            "unrelate": "nookly cli unrelate <relationship-id> --yes",
            "search": "nookly cli search <query> [--space <id>] [--type <entity-type>[,<entity-type>...]] \
                       [--in title|content] [--limit <n>]  (title covers titles and keys, content covers block text)",
            "space": "nookly cli space <list|create|update|delete|reorder> ...",
            "label": "nookly cli label <list|get|create|update|delete|attach|detach> ...  (attach/detach take several \
                      label ids; get <id> is the reverse lookup, every entity carrying that label)",
            "agentInstructions": "nookly cli agent-instructions  (a longer prose guide for a coding \
                                   agent that's never used this CLI before, start here, not with \
                                   this --help output, if this is your first call)",
        },
    })
}

/// A prose onboarding doc for a coding agent that's never touched this CLI before — `--help`/
/// `schema` are structural references (commands, fields, types), useful once you already know
/// the shape of the thing; this is meant to be read start-to-end *first*, the way a human would
/// read a README before a man page. Still returned as `{"markdown": "..."}` JSON, not printed
/// raw — this CLI's one hard invariant (see the module doc comment) is JSON on stdout, always.
pub(super) fn agent_instructions() -> Value {
    json!({ "markdown": AGENT_INSTRUCTIONS_MARKDOWN })
}

pub(super) const AGENT_INSTRUCTIONS_MARKDOWN: &str = r##"# Nookly CLI agent guide

Nookly is a personal life organizer app (Notes, Tasks, Courses, Exams, ...). This CLI
(`nookly cli ...`) is a full read/write interface to the same data the desktop app shows,
built entirely on one generic pattern. There is no hand-written command for any specific
entity type. That means:

- Every command's output is JSON on stdout, always (pretty-printed on a TTY, compact when
  piped). Parse it, don't scrape it.
- Every command is non-interactive and never prompts. Only destructive verbs (`delete`, `delete-block`,
  `delete-<singular>`, `relate`, `unrelate`, `space delete`, `label delete`) take `--yes`, and
  you'll get an error telling you to add it if you forget. `create`, `update`, `label attach` and
  the rest reject it as an unknown flag. A command that fails writes nothing, so it is
  safe to fix the call and retry.
- Errors are JSON on stderr, `{"error": {"kind": ..., "message": ...}}`, with a non-zero exit
  code. The `message` is usually specific enough to fix the call and retry. The `kind` is one of
  `NotFound`, `UnknownRelationshipType`, `CardinalityViolation`, `InvalidInput`, `Conflict`,
  `Db`, `Io` or `Remote`; `Conflict` means retry after re-reading (see "Writing safely"),
  `InvalidInput` means fix the call.
- Deleting an entity is *always* a soft delete (goes to Trash, `restore`-able) except `space
  delete`, which is genuinely permanent and takes every entity inside it with it.

## Running it

`nookly` is the desktop app's own binary. The sidebar's "Install CLI" card links it onto your
PATH on macOS and Linux; elsewhere, run the app binary with `cli` as the first argument. The
CLI opens the same database file as the app, so the app does not need to be running, and
changes you make show up in an open app on their own.

## Step 1: discover the data model, don't guess it

Run `nookly cli schema` before doing anything else. It dumps every entity type this app
knows about, each one's fields, and every relationship type, in one call. `nookly cli
describe <entity-type>` gives you the same detail for just one type. Both are cheap,
read-only, and always reflect the actual running app, which is newer than whatever is in your
training data or memory of a past session. If you're about to guess a field name or a
relationship type, run one of these instead.

Read each type's `description` and its field descriptions too. They state the rules that are
specific to it: which field links it to a parent (and whether that link can change), which
values are allowed, what a field defaults to, and what only the desktop app can do. The rest
of this guide covers what holds for every type.

## The generic entity pattern

Almost everything is one of:

```
nookly cli <entity-type> list --space <id> [--include-deleted] [--since 24h] [--label a,b] [--fields a,b] [--limit <n>]
nookly cli <entity-type> get <id> [<id> ...] [--summary | --fields a,b]   # includes relationships, labels + mentionedIn
nookly cli <entity-type> create --space <id> --title <title> [--icon <icon>] [--field name=value ...]
nookly cli <entity-type> update <id> [--title <t>] [--icon <i>] [--pinned true|false] [--space <id>] [--field name=value ...]
nookly cli <entity-type> duplicate <id>               # copy in the same Space, same fields, labels and blocks
nookly cli <entity-type> convert <id> --to <type>     # same entity, another type; `describe` lists convertsTo
nookly cli <entity-type> delete <id> --yes            # soft delete, goes to Trash, not permanent
nookly cli <entity-type> restore <id>
```

Most types require `--space` on `list`; the error says so when one does. `update --space`
moves the entity, and everything it structurally owns (a Task's sub-tasks, for example), to
that Space.

Every entity carries a short `key` next to its `id`, like `TSK-14` or `NOT-3`: a three
letter type prefix and a number. Anywhere a command takes an entity id (including `relate`,
`label attach`, block commands and entity reference `--field` values) you can pass the key
instead. `search` matches keys too. Space, label, block and relationship ids have no key.

### Pages owned by another entity

A Course has its own notes page (type `course_notes`, key like `CNT-5`) that is not a `note`.
Its block verbs live on the course: `nookly cli course blocks|grep|add-block|reorder-blocks <course-id>`
edit that page (created on first use), and `update-block`/`delete-block` take its block ids as
usual. The page's own id or key works in place of the course's. `describe course` shows it
under `blockPage`.

### Entity actions

Some entity types expose a verb that targets one entity and does several writes as one
all or nothing step, listed under `entityActions` in `describe`:

```
nookly cli <entity-type> <action-name> <id> [--title <title>]
```

`nookly cli jot refine <jot-id> [--title <title>]` creates a new `note` in the jot's Space
(titled like the jot unless `--title` is given), links the jot to it with `relates-to` and
leaves the jot untouched. Use it instead of chaining `note create` and `relate`. The note
starts empty, so fill it with `note add-block`.

### Bulk actions

Some entity types also expose a bulk action: a verb that runs once across every entity of
that type instead of targeting one id, listed under `bulkActions` in `describe`:

```
nookly cli <entity-type> <bulk-action-name> [--space <id>]   # omit --space to run over every Space
```

`nookly cli file reindex [--space <id>]` is the one that exists today. See "Files: OCR and
search indexing" below.

## Reading cheaply

Pages can be large. Before pulling one whole:

- `list` rows of block pages carry `bodySize` (`chars`, `approxTokens`), `blockCount` and
  `lastEditedAt`. `get` always reports `size` for its payload.
- `get <id> --summary` cuts every long string to an excerpt and, for pages, adds the heading
  `outline` with block ids and indexes.
- `get <id> --fields title,updatedAt` returns only those fields (`id` and `key` always come along).
- `<type> grep <id> <pattern> [--context 2] [--max <n>]` returns just the matching lines with
  their block id and index (at most 50 unless you raise `--max`); `<type> blocks <id> --offset
  <n> --limit <n>` then fetches that section.
- `get` takes several ids at once and returns `{count, items}`; an id that can't be read
  becomes an `{ref, error}` row instead of failing the whole call. `list --since 24h` (or
  `7d`, a date, a timestamp) shows what changed recently, newest first.
- `search <query> --type note --in content` narrows search to one entity type and to block
  text (`--in title` for titles and keys).
- `list --space <id> --label a,b` keeps only rows carrying every named label (AND match), so
  "everything tagged X and Y" doesn't mean a `get` per row and filtering client side. `--fields
  labels` on `list` (not just `get`) returns each row's labels; `label get <id>` is the reverse:
  every entity carrying one label, across types.

## Files: OCR and search indexing

A File's own content, not just its file name, is what `search` and the `--in content`
filter actually match against. Extraction happens automatically on import, attach and replace,
best effort:

- Scanned or image-only PDF pages and standalone images (`png`/`jpg`/`jpeg`) go through local OCR.
  An ordinary text PDF costs nothing extra. Only a page the OCR engine's own detector flags as
  scanned gets OCR'd.
- `docx`/`pptx`/`xlsx` get their text read directly out of the file's own XML, no OCR needed.
- Code and plain text files (anything a source-file extension or `.txt`/`.md`/`.csv`/`.log`
  covers) are read as-is. A file with an unrecognized extension, or no extension at all
  (`README`, `Dockerfile`, a dotfile), still gets indexed if its content looks like text.
  Extraction isn't gated on knowing the "right" extension.
- Anything else (video, audio, archives, ...) isn't indexed at all.

`file get <id>` carries two fields for this:

- `needsReindex`: true for an indexable File with no search content yet. It was never indexed
  (imported before this existed, or before its extension or content was recognized), or the last
  attempt found nothing. `list` computes this too, cheaply.
- `indexedContent`: the exact extracted or OCR'd text last indexed. Only `get` (one File by id)
  populates it. `list` always returns `null` here, so listing many Files never drags their
  full extracted text along regardless of size.

To fix a gap: `file update <id> --field reindexContent=true` re-runs extraction for one File
even if it already has content; `file reindex [--space <id>]` (a bulk action, see above) does
every File in scope missing content at once and reports `{"checked": <n>, "reindexed": <n>}`.
Both are safe to run repeatedly. An already-indexed File is left untouched by `reindex`, and
a File whose extraction genuinely finds nothing (a blank image, an empty spreadsheet) just
looks like "never tried" and is retried next time rather than treated as a permanent failure.

## Writing safely

- `--dry-run` works on every command: it really runs inside a transaction that is then rolled
  back, so validation errors, cardinality checks and the resulting payload are all real, and
  nothing is kept. `--yes` isn't required alongside it. `update` and `update-block` responses
  (dry or not) list `changes` with before and after values, and a line diff for long text.
- `get` returns a `revision`. Pass it back as `--if-revision <rev>` on `update`, `convert`,
  `delete` or any block write; if someone changed the entity since you read it you get a
  `Conflict` error instead of silently overwriting their edit. Re-read, reapply, retry.
- There is no version history: once a write lands, the previous content is gone (deletes of
  entities go to Trash, though). Use the two tools above before writing, not after.
- `relate <from> <type> <to> <to> ...` and `label attach <entity> <label> <label> ...` take
  several targets in one call, all or nothing.

`--field` is for whatever extra fields that *specific* entity type declares beyond the
universal ones (title/icon/pinned). `describe <entity-type>` lists exactly which field names
are valid and whether each is settable on create, update, or both. Passing an unknown field
name is an error, not a silent no-op.

## Pages: block based content, not a markdown blob

`note`, `jot`, `task` and `sub_task` are "pages" (`describe` reports `supportsBlocks`). Their
content is a sequence of typed blocks (heading, paragraph, code, list, table, ...), not one big
string. **There is no `--field body=<markdown>` shortcut.** An earlier version of this CLI had
one, and it was removed deliberately, because it let agents skip ever learning the real block
commands (and a `code` block built that way had no way to get a language or filename). If you
try it, the error message tells you this and points back here.

Build a page's content with:

```
nookly cli <type> blocks <id> [--offset <n>] [--limit <n>]                        # list blocks in order
nookly cli <type> grep <id> <pattern> [--regex] [--case-sensitive] [--context <n>] [--max <n>]  # matching lines only
nookly cli <type> add-block <id> --type <blockType> --content <text> [--position <n>] [--language <l>] [--filename <f>] [--attr <name>=<value> ...]
nookly cli <type> update-block <block-id> [--content <c>] [--type <t>] [--language <l>] [--filename <f>] [--attr <name>=<value> ...]
nookly cli <type> delete-block <block-id> --yes
nookly cli <type> reorder-blocks <id> <block-id> <block-id> ...
```

One call per element: a heading, a paragraph, a code block, one list, one table. Not one
call with a whole document jammed into `--content`. A list is ONE block, not one block per
item: `bulleted_list` and `numbered_list` content is every item of the list, one per line,
with no `1. ` or `- ` markers (the editor numbers items within the block, so one block per
item renders as a column of "1."s). A leading tab nests an item under the one above it. An advisory `warning` flags either mistake, and every
list block in `blocks` output carries `display`: the marker each line renders with in the
editor (`1.`, `2.`, ... or `•`) and `restartsAfterList`, true when the block renders as a new
list right after another list of the same type. Check it instead of guessing what the GUI shows.

```
nookly cli note add-block <id> --type numbered_list --content "$(printf 'First\nSecond\nThird')"
```

`describe <type>` lists every known `blockType`. If you land a `paragraph` block whose content
still looks like a whole unsplit document (headings, fences, several paragraphs), the response
carries an advisory `warning` telling you to split it. The write still succeeds, but fix it
before moving on.

### Code blocks: `--language` and `--filename`

A `code` block's header row in the editor shows a filename and a syntax highlighting
language. Both are plain flags, not buried in `--field`:

```
nookly cli note add-block <id> --type code --content 'console.log(1)' --language javascript --filename app.js
```

`--language` is a highlight.js grammar name (`javascript`, `typescript`, `python`, `rust`,
`jsonc`, ... anything is accepted, but only a recognized grammar actually highlights).
Omit it (or pass `--language ""` on `update-block`) for plain, unhighlighted text. Same
`""` clears convention for `--filename`.

### Custom blocks

Blocks beyond plain markdown (callout, checklist, timeline, ...). Their settings are
`--attr <name>=<value>` flags (repeatable, an empty value clears one). `describe note` lists
every type's content format and attrs under `contentFormats` and `blockAttrs`; multi column
formats separate cells with a tab, like tables.

A mention points at an entity by its key, `[Midterm](mention:EXM-3)`, or by its id; blocks are saved
with the id and read back with the key. Add `#<block-id>` to point at one block of a page.

```
nookly cli note add-block <id> --type callout --content 'Bring a calculator' --attr variant=warning
nookly cli note add-block <id> --type timeline --attr title=Semester --content "$(printf 'Oct 14\tLectures start\nNov 30\tMidterm\tnow\nFeb 10\tFinal exam\tnext')"
nookly cli note add-block <id> --type progress --content "$(printf 'Chapters read\t7\t12\nExercises\t30\t40')"
nookly cli note add-block <id> --type tree --content "$(printf 'Thesis\n  Intro\n  Methods\n    Survey')"
nookly cli note add-block <id> --type steps --attr current=2 --content "$(printf 'Register\tBefore Oct 1\nPay the fee\nPick courses')"
nookly cli note add-block <id> --type stats --content "$(printf '3.7\tGPA\n90\tCredits\tof 180')"
nookly cli note add-block <id> --type details --content "$(printf 'Room\tB 204\nOffice hours\tTue 14:00')"
nookly cli note add-block <id> --type checklist --content "$(printf '[x] Buy notebook\n[ ] Print slides')"
nookly cli note add-block <id> --type divider --content ''
nookly cli note add-block <id> --type entity_card --content '[Midterm](mention:<exam-id>)'
nookly cli note add-block <id> --type image --content '[campus.jpg](mention:<file-id>)' --attr caption='Main campus'
nookly cli note add-block <id> --type file --content '[syllabus.pdf](mention:<file-id>)' --attr page=12   # opens on page 12; also video, audio
nookly cli note add-block <id> --type file --content '/Users/you/Downloads/handout.pdf'   # a file on this computer; Nookly only reads it, and keeps the path as written if the file is not there
nookly cli note add-block <id> --type bookmark --content '[Rust Book](mention:<bookmark-id>)'
nookly cli note add-block <id> --type embed --content 'https://www.youtube.com/watch?v=<id>'
nookly cli note add-block <id> --type toggle --content "$(printf 'What is a monad?\nA monoid in the category of endofunctors.')"
nookly cli note add-block <id> --type heading2 --content 'Week 1' --attr toggle=closed   # toggle heading
nookly cli note add-block <id> --type equation --content '\int_0^1 x^2\,dx = \frac{1}{3}'
nookly cli note add-block <id> --type diagram --content "$(printf 'flowchart LR\n  Idea --> Draft --> Done')"
nookly cli note add-block <id> --type math --content "$(printf '(a+b)^2 &= (a+b)(a+b) \\\\\n&= a^2 + 2ab + b^2')"
nookly cli note add-block <id> --type circuit --content "$(printf 'S = A ^ B\nC = A & B')"
nookly cli note add-block <id> --type mindmap --content "$(printf 'Plan\n  Read\n    Chapter 1\n  Write')"
nookly cli note add-block <id> --type plot --content "$(printf 'f(x) = x^2 - 2\nA = (1, -1)\nx: -5..5')"
```

Equation, math, diagram, circuit, plot and mindmap blocks added here open on the preview. Pass
`--attr view=source` to show the code instead.

Inline math goes straight into paragraph text as `$…$` (`The area is $\pi r^2$`); a literal
dollar sign is written `\$`.

### Tables: tabs and newlines, NOT markdown pipe syntax

A `table` block's `--content` is rows separated by `\n`, cells within a row separated by a
literal tab character, first row is the header, no separator row. It is **not** the
`| a | b |` / `|---|---|` markdown table syntax you'd write in a `.md` file. That's an easy,
natural mistake, and this CLI auto-detects it and converts it for you, but you'll get an
advisory `warning` back when that happens. Prefer real tabs from the start:

```
nookly cli note add-block <id> --type table --content "$(printf 'Name\tAge\nAlice\t30\nBob\t25')"
```

## Tasks and sub-tasks

A `task` has a `statusId`, a start date and a due date. Status ids are short slugs; the
defaults are `backlog` (what a new task gets), `todo`, `in_progress`, `done` and `cancelled`,
and a task's current `statusId` always shows on `get`. Progress rolls up from sub-tasks when
any exist.

A `sub_task` is a one level child of a task, so a sub-task cannot have sub-tasks. Create one
with `sub_task create --space <id> --title <t> --field parentId=<task-id>`; there is no
separate `relate` call. Setting `parentId` on an existing task turns it into a sub-task of
that task, which only works for a task that has no sub-tasks of its own and cannot be undone
through that field.

## Templates and occurrences

Recurring items come as two types: a template (`session_template`, `calendar_entry_template`)
holding the cadence, and the dated occurrences (`session`, `calendar_entry`) the calendar
shows. Create one-off occurrences directly. Generating a template's occurrences is done by the
desktop app only, not the CLI. Updating a template's times or location edits its series from
the `applyFromDate` field on, per its `describe`.

## Saved views

A `view` is a saved View of a module page (Tasks or Assignments): a name plus the filters and
display options to reopen it with. Its `module` is fixed at creation; `config` is a JSON
object that is checked on every write, and a bad filter field, value or display option comes
back as an `InvalidInput` error naming what is allowed. `describe view` spells out the exact
filter fields, groupings and orderings per module. `view list` needs `--space`.

## Child collections: records without their own entity

Some parent entity types own child records that aren't full entities themselves: no key,
no Space, no relationships. Index Cards under a Deck, and Ingredients and Steps under a Recipe,
are the ones that exist today. `describe <parent-type>` lists these under `childCollections`,
each with its own `fields`, `computedFields` and `actions`:

```
nookly cli <parent-type> <plural> <id> [--include-deleted]                  # list a parent's children
nookly cli <parent-type> add-<singular> <id> --field name=value ...
nookly cli <parent-type> get-<singular> <child-id>
nookly cli <parent-type> update-<singular> <child-id> --field name=value ...
nookly cli <parent-type> delete-<singular> <child-id> --yes                 # soft delete
nookly cli <parent-type> restore-<singular> <child-id>
```

Plus whatever named actions that collection declares beyond the generic ones. A Deck's
cards add `review-card`/`undo-review-card` for spaced repetition review:

```
nookly cli index_card_deck cards <deck-id>
nookly cli index_card_deck add-card <deck-id> --field front="Q" --field back="A"
nookly cli index_card_deck review-card <card-id> --field rating=good
nookly cli index_card_deck undo-review-card <card-id>
nookly cli recipe add-ingredient <recipe-id> --field text="2 cups flour"
nookly cli recipe steps <recipe-id>
```

## Relationships and search

Relationships link any two entities with a typed edge: `relates-to`, `blocks`, or a module
specific type (`schema` lists every relationship type that exists, and `describe` lists the
ones each entity type allows). The CLI links whole entities only. It cannot link a single
block.

```
nookly cli relate <from-id> <relationship-type> <to-id> [<to-id> ...] --yes
nookly cli unrelate <relationship-id> --yes
nookly cli search <query> [--space <id>] [--type <t>[,<t>...]] [--in title|content] [--limit <n>]
```

Search matches entity titles and keys and, for pages, individual blocks. A block hit
carries `blockId` plus a `snippet` whose matched terms are wrapped in `\u0001` / `\u0002`.

## Spaces and Labels

A Space is a top level workspace (everything else lives inside exactly one). Labels are
freeform tags, siloed per Space (the same label name in two Spaces is two separate labels):

```
nookly cli space <list|create|update|delete|reorder> ...   # space delete is PERMANENT, no Trash
nookly cli label <list|get|create|update|delete|attach|detach> ...
```

Run `nookly cli space` or `nookly cli label` with no further arguments for the exact flags
each verb takes.

## A worked example, start to finish

```
SPACE=$(nookly cli space create --name "Scratch" --color "#3b82f6" | jq -r .id)
NOTE=$(nookly cli note create --space "$SPACE" --title "Example" | jq -r .data.entity.id)
nookly cli note add-block "$NOTE" --type heading1 --content "Example"
nookly cli note add-block "$NOTE" --type paragraph --content "A short intro paragraph."
nookly cli note add-block "$NOTE" --type code --content 'const x = 1;' --language javascript --filename app.js
nookly cli note get "$NOTE" | jq -r .data.body      # the rendered markdown, for a sanity check
```

(Real shells: prefer `jq` for parsing rather than regex/string-splitting the JSON.)
"##;
