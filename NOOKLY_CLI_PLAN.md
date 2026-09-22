
🚨🚨🚨🚨🚨 TODO: add this to AGENTS.md: 🚨🚨🚨🚨🚨

Every new entity type, field, or relationship type MUST be exposed through the CLI automatically via its schema/relationship registration — never add a feature without also registering it in the schema layer the CLI generates from, and never hand-write a one-off CLI command for a specific module. If the generic list/get/create/update/delete/relate/describe pattern can't express a new feature, extend that generic pattern itself rather than bypassing i or ask the user about it.

🚨🚨🚨🚨🚨🚨🚨

# PLAN — CLI for AI Agent Access

Goal: a CLI covering every entity/feature in Nookly, including modules that don't exist yet. Must not require hand-written commands per module forever — that guarantees the CLI perpetually lags behind the app.

Read `01-philosophy.md` (compile-time modules, relationship system) and `02-entity-model.md` (base entity fields) before implementing. This plan depends directly on both.

---

## 1. Core Principle: Generate, Don't Hand-Write

Every module already declares, at compile time (per `01-philosophy.md` §1.8):
- its entity schema (base fields + module-specific fields, per `02-entity-model.md` §2.1)
- any relationship types it registers into the fixed enum (generic or structural, per §2 relationship system)

The CLI is a **generated layer over this same registration**, not a separately maintained command set. A new module gets full CLI coverage automatically the moment it registers its schema — zero additional CLI code required per module, ever. This is the only way "covers every feature, and will be having" stays true over time rather than becoming stale documentation.

**Architecture: shared core library, thin adapters.**
All actual logic (entity CRUD, relationship engine, search, structural-constraint enforcement) lives in one shared core library. The GUI (Tauri commands), the CLI, and any future MCP server (see §6) are all thin adapters calling into that same core — never three separate implementations of "create a Task."

---

## 2. Packaging

**CLI is a subcommand of the main Nookly app binary** (e.g. `nookly --cli ...` or `nookly cli ...`), not a separate binary. Single binary to build/distribute/version; shares the core library trivially since it's the same executable.

---

## 3. Command Surface (generated, generic)

- `nookly <entity-type> list` — list entities of a type, filterable by space, status, etc. per that type's declared fields.
- `nookly <entity-type> get <id>`
- `nookly <entity-type> create [--field value ...]` — fields driven entirely by that module's declared schema; no type-specific command code required.
- `nookly <entity-type> update <id> [--field value ...]`
- `nookly <entity-type> delete <id>` — soft-delete only, per `02-entity-model.md` §2.2. Never a hard-delete path, even via CLI.
- `nookly relate <from-id> <relationship-type> <to-id>` — one command for every relationship in the app, since relationship types are a fixed, registrable enum (§2 of `02-entity-model.md`). Structural constraints (e.g. Session must have exactly one Course) are enforced underneath automatically, identical to GUI behavior — the CLI must never allow bypassing a structural rule.
- `nookly search <query>` — thin wrapper over the existing full-text search engine (see search-related module docs).
- `nookly describe <entity-type>` — dumps that entity type's full schema (fields, types, required/optional, valid relationship types it participates in) as JSON. This is the self-describing command agents rely on (§4).
- `nookly schema --all` — dumps every registered entity type + relationship type in the whole app in one call, so an agent can discover the entire data model in one shot without iterating.

---

## 4. Agent-Usability Requirements

- **JSON-first output.** Structured JSON by default when output is non-interactive/piped; human-pretty formatting only when attached to a real TTY. Agents must never have to scrape formatted text.
- **Self-describing, no hardcoded schema knowledge required.** Because modules are community-extensible, an agent must be able to call `describe`/`schema` at runtime and get the real, current data model — never assume a fixed, hardcoded set of entity types.
- **Non-interactive by default.** No command may block on an interactive prompt. Every mutating command accepts an explicit `--yes`/`--force` flag for confirmation instead of prompting.
- **Soft-delete lowers the stakes, but doesn't remove the requirement above.** Nothing an agent does is ever truly unrecoverable (per `02-entity-model.md` §2.2), which is a good safety net, but destructive-looking commands still require explicit confirmation flags — don't rely on soft-delete as a reason to skip that.

---

## 5. Structural Rule Enforcement

The CLI must enforce every structural relationship rule already defined in `02-entity-model.md` §3.3 (Session↔Course, Exam↔Course, Assignment↔Course, Deck↔Exam, Study Block↔Exam, Task↔Sub-task cardinality/nesting cap) exactly as the GUI does. This falls out for free if the CLI genuinely calls into the same shared core library (§1) rather than reimplementing validation — flagging explicitly so no one is tempted to build a "quick and loose" CLI-only validation path.

---

## 6. MCP Server — Explicitly Deferred, Not Rejected

**Decision: do not build an MCP server now.** Reasoning:

- MCP earns its value when an agent has no other way to reach the app — e.g. a hosted/browser-based agent with no shell access. That's not the primary use case here.
- The realistic primary use case (Claude Code, Claude Desktop with terminal access) already has direct shell access. A genuinely good CLI (self-describing, JSON-first, per §3–4) gives such an agent everything an MCP wrapper would, without an extra protocol layer in between.
- This is not a lock-in decision. Because the CLI is a thin adapter over a shared core library (§1), building an MCP server later — if a real need arises for agent access without shell access — is cheap specifically because the hard part (schema-driven, generated command/tool definitions) will already exist. Do not treat "no MCP now" as a permanent architectural stance; treat it as sequencing.

Revisit this decision if/when a use case emerges that genuinely requires agent access without shell/CLI availability (e.g. a hosted assistant, a mobile-only agent context).

---

## 7. Non-Goals For This Pass

- No MCP server (§6).
- No CLI-specific business logic or validation shortcuts — must call the same shared core as the GUI (§1, §5).
- No hand-written per-module commands — if a need arises that the generic `<entity-type> list/get/create/update/delete` + `relate` + `describe` pattern can't express, treat that as a signal to extend the *generic* command set/schema declaration format, not to bolt on a one-off module-specific command.