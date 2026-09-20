# Decisions Log

ADR-style. Decision → Why → Alternatives rejected. Check before reversing any decision.

---

**Modules: Data Provider vs Viewer split**
Why: lets community reskin data without forking/editing original module. Keeps core modules stable, additive-only.
Rejected: single flat "module" concept — would force UI and data ownership together, blocking alternate viewers.

---

**Opinionated modules over flexible canvas**
Why: Notion's total flexibility overstimulates. Jira/Linear constrained page types keep capture focused. Many specialized modules = enough variety without per-module overstimulation.
Rejected: one universal flexible block-canvas for everything (pure Notion clone).

---

**Relationship system as sole linking mechanism**
Why: pages can't nest (each page = exactly one Space). Needed one consistent way to connect anything to anything, including cross-module, cross-Space.
Rejected: letting each module invent its own linking/reference fields ad hoc (e.g. Course Prequel/Sequel as dedicated fields) — creates competing mechanisms, defeats "one core mechanism" goal.

---

**Directed relationships, fixed enum, unrestricted cardinality**
Why: directed = clean auto-derived inverse labels, no dual storage. Fixed enum = queryable/predictable graph, modules extend at build time. Unrestricted cardinality at data layer = simpler core engine; strictness (one-parent-only etc) pushed to specific structural relationship types only where truly needed.
Rejected: freeform string relationship labels (ungovernable), symmetric-by-default (loses directionality info), enforced cardinality on all types (over-constrains generic case).

---

**Attachments and Mentions are relationship subtypes, not separate systems**
Why: avoids a 4th competing linking mechanism. Attachment = relationship type "attached-file." Mention = inline markdown reference, kept separate from formal graph since it's contextual not structural.
Rejected: fully separate attachment engine and mention engine with no relation to core relationship system.

---

**Labels are Space-siloed, not global**
Why: user doesn't want "Algorithms" label bleeding into Work space, or "Department XYZ" polluting Study space. Space-siloing solves this for free via existing space_id field.
Rejected: global labels with optional "make visible everywhere" flag — added UI complexity for a need already solved by siloing.

---

**Task↔Sub-task, Session↔Course, Exam↔Course, Deck↔Exam, Study Block↔Exam, Assignment↔Course = structural relationships**
Why: these pairs are meaningless without their parent (a session without a course doesn't make sense). Structural = data-layer enforced, not just convention. Distinguishes from generic (unenforced) relationships like Course sequel-of.
Rejected: treating all relationships as equally generic — would allow orphaned Sessions/Exams/Assignments with no parent, which never makes real-world sense.

---

**Learning Schedule → new "Study Block" entity, not reused Session or Task**
Why: Session↔Course is structural (must have a course) — study prep isn't a course lecture, would violate that rule. Task = checklist item, not calendar-native — bad fit for time-boxed study blocks and future calendar view.
Rejected: reusing Session (violates structural rule), reusing Task (wrong semantics, breaks calendar view design).

---

**Compile-time module packaging, not runtime plugins**
Why: app is personal-first, technical audience (open source, forkable). Recompiling to add a module is acceptable for this audience. Avoids building a whole plugin-runtime/sandboxing/versioning subsystem before module API is proven.
Rejected: runtime plugin architecture (WASM/dynamic loading) for v1 — premature abstraction, real engineering cost, no proven API to stabilize yet. Deferred to future.

---

**No git-backed local repo, no version history**
Why: originally proposed to power undo/rollback and optional data publishing. Rejected once user considered file/attachment bloat in a git repo — binary files make repo history huge and impractical.
Resolution: undo/redo = in-memory session-scoped action stack only. Durable history entirely out of scope until cloud sync (future), where large files push to S3-like storage instead of being versioned locally.

---

**Soft-delete everywhere, no hard delete, no auto-purge by default**
Why: with git/version-history rejected, soft-delete + Trash is the ONLY safety net left for accidental deletion.
Resolution: reduced-opacity rendering wherever a soft-deleted entity is still referenced (relationships/attachments/mentions) instead of hiding/breaking links.

---

**Spaces are a hard wall — no cross-Space views except Dashboard, Pinned, Search**
Why: matches Notion's actual behavior (which the user explicitly referenced via screenshot). Keeps mental model simple: Space = folder, not a scoping/config boundary.
Rejected: global per-module views (e.g. "all Tasks across all Spaces") — user confirmed Spaces should behave as a hard wall, cross-space needs are covered by Pinned + future Dashboard instead.

---

**Single global Dashboard (not per-Space, not multiple)**
Why: user wants one bento-style customizable page for quick cross-space access. Per-space dashboards explicitly wanted later, but deliberately deferred to keep this decision small and shippable now.

---

**Files copied into local storage (not path-referenced)**
Why: predictable, portable, survives user moving/renaming/deleting the original file elsewhere on disk.
Rejected: path-only reference — fragile, breaks silently if source file moves.

---

**Files-as-links: provider-aware (Drive/Dropbox/iCloud) with generic URL fallback**
Why: enables future provider-specific features (thumbnails, live status) without blocking on it now. Generic URL fallback covers everything else without extra engineering.

---

**Bookmarks are a separate entity from Files-as-links**
Why: semantically different intents — Files-as-links = "this is a document," Bookmarks = "this is a reference/webpage." Conflating them would confuse the Attachments UI and export semantics.

---

**Full-text search is app-wide, ignores the Space hard wall**
Why: search is a utility action, not a "view" — user shouldn't have to guess which Space something lives in just to find it.
Rejected: Space-scoped search (would contradict the point of having one unified app for one person's whole life).
