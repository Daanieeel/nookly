# Implementation brief and state: the nookly.work website

> **Keep working until every item below is ticked and the final report is written.** A finished batch means: pick the next unticked item. A side request that is done means: come back here. Context filling up is fine; this file carries you over. Something that needs the user's eyes goes under "Needs the user" and you move on.

**This file is the ready to run prompt and the handover file.** Read it, `AGENTS.md` and `docs/00-index.md`, then work the list from top to bottom. Tick items, note findings and append to the progress log after every meaningful step, and commit it with the work.

The earlier rounds (connected platform, mobile app, tablet rework) are merged into `main` (#291, cdee1a03) and live in git history and `DECISIONS.md`. `NOTES.md` is the user's own file: read it, never edit, format, checkout or restore it.

## The task (user, 2026-11-18)

Roll out a website for Nookly on `nookly.work`, released and deployed automatically. The user gives feedback at the end; do not ask, decide.

1. **Landing page.** Copy the hero idea of symmetry.ai exactly, tailored to Nookly: a big two line headline, one short line under it, a primary button, then a floating, slightly tilted app card in front of soft rounded pastel shapes. Then the most important features and a short Q&A. **No screenshots**: every piece of app UI is rebuilt from the shared packages (`@nookly/ui` primitives, tokens and classes, `@nookly/frontend` presentational parts where they work without the app's runtime) so it looks exactly like the desktop app.
2. **Download button** at the top (nav and hero): `[ Download for <detected platform> | ⌄ ]`. The chevron opens a popover with the other downloads and a link to the downloads page.
3. **Status page**, the usual kind: overall banner, one row per component with 90 day uptime bars, live check, incidents note.
4. **Downloads page**: every download option grouped into sections (macOS, Windows, Linux, mobile) with icons and brand logos.
5. **Nav bar**: GitHub link with the GitHub logo and the star count.
6. **Legal** (German law): Impressum with sample values, privacy policy, terms of service. Placeholders the user replaces after talking to a lawyer; mark them clearly as sample values.
7. **Copy**: natural, human, nice but not overwhelming marketing. Reference for voice and features: the user's routine `~/Library/Application Support/com.nookly.app/agent/routines/campus-sync.md` (Moodle, courses, assignments, exams, notes built from blocks, the CLI that agents drive, Spaces). No em or en dashes, no hyphenated sentence structure (`AGENTS.md`).
8. **Stack**: Next.js for SEO, the exact same styles as the desktop app. Branch for the work, then merge into `main` and release under `nookly.work`. Sensible CI/CD that deploys automatically.

## The hero, as getsymmetry.com does it (looked at 2026-11-19)

- Light warm grey page, centred two line headline in a big geometric sans, two line muted subline, one dark pill button.
- Behind and below: big isometric pastel solids (cylinders and five sided prisms) in blue, green and yellow with a fine grain, cut off flat at the bottom edge of the hero; the next section starts on white.
- In front: a white card with a soft shadow and a stack of two more cards peeking out under it (a queue). The card: source app icon in a rounded square, source name and "channel · 2h ago", a priority chip on the right, a title, two lines of context, chips (area, due day), a divider, then actions with keyboard hints (Accept A, Remind me R, Delete D) and on the right the agent button (Hand to Sym S).
- The animation loops through the queue: a cursor clicks an action. Accept tints the card green and it flies off to the right, rotated, and the next card rises from the stack. Hand to Sym swaps the body for a checklist (circle, spinner, check, one step after another, a "skill" chip on one step), a "working" badge that turns into "Done", then a result row ("Sent ... Just now ✓ Sent"). After the last card: "All done! Nothing left in the queue." A small pause button with a progress bar sits under the card.
- **For Nookly** the queue is what an agent routine finds (like `campus-sync.md`): a new Moodle assignment, an exam registration on the campus site, today's Mensa menu. Actions are real Nookly things (Add as Assignment, Add Task, Skip), the agent button is "Hand to agent", the result row names the Nookly item it made (`ASG-12` in Algorithms, due Friday). Built only from `@nookly/ui` primitives and tokens (Button, Badge, Kbd, MoodleIcon), Nookly's accent colours for the solids, light and dark.

## User feedback while building (2026-11-19)

- **No copy of Symmetry's bar chart solids.** The backdrop is Nookly's own: a hearth, the app icon's flame (glassy overlapping tongues with light rims, tips curling outwards, embers drifting up) glowing behind the card, soft pebbles in the accent colours around its base (`components/hero/hearth.tsx`).
- **Language switcher is a popover with flags** (the US flag for English, Germany for German), the desktop's `react-flagpack`; the two flag files live in `public/flags/s/`.
- **Light by default**, with a theme popover at the top right: Light (default), Dark, System, the desktop's sun, moon and desktop icons. Stored in `localStorage` (`nookly.theme`), applied before first paint.

## Decisions (asked the user, 2026-11-18)

- **Hosting: Cloudflare Pages**, free, static export (`output: "export"`), deployed by GitHub Actions on every merge to `main`. Not the Heroku dyno: site deploys would restart the sync server, and the status page would go down with the thing it reports on.
- **Status: live check plus 90 day history.** A GitHub Actions job every 5 minutes checks `https://sync.nookly.work/health` and writes the results to a separate `status-data` branch (no commits on `main`). The page reads that JSON and pings `/health` from the browser for the live state.
- **Mobile on the downloads page: iOS "coming soon"**, no Android.
- **Languages: English and German**, the whole site. English at `/`, German under `/de`, with `hreflang` alternates.

## Decisions (mine)

- `apps/web` (`@nookly/web`), Next.js 16 App Router, Tailwind v4 through `@tailwindcss/postcss`, importing `@nookly/ui/styles.css` like the desktop does. `transpilePackages` for the workspace packages.
- Icons: Tabler (`@tabler/icons-react`), the desktop's set; its brand icons cover Apple, Windows, Linux distros, GitHub and the App Store.
- Download links and the star count are read at build time from the GitHub API (latest release `v*`, its assets), refreshed in the browser, and the site rebuilds when a release is published and once a day.
- Cloudflare Pages project and its domains (`nookly.work`, `www.nookly.work`) are managed by Terraform in `infrastructure/`. That needs a Cloudflare token with Pages edit on the account, plus `CLOUDFLARE_ACCOUNT_ID`; collect them with `request_secret`.
- The sync server must allow `https://nookly.work` in `CORS_ORIGINS` for the live check (via Terraform config vars), unless `/health` already sends CORS headers.

## Rules

- **Safety.** User data must never be lost; the website touches no app data. Never run migrations or sync against real data. Leave the user's processes alone: ports 3000, 8081, 1420, the simulator "iPhone 17" `45B8BECE-...`, `/Applications/Nookly.app`, Xcode. No `pkill -f` on the app binary. Never `git stash drop`, never a bare `git stash`. No force push. Never commit the Apple team ID. The user's email is private.
- **Git.** `main` is checked out in the user's own checkout, so this worktree sits on `origin/main` detached when idle. Website work happens on `feat/website`; merge into `main` through a pull request once checks are green (the user allowed it for this task). Push only when no CI run of the last push is going. Delete merged branches locally and on the remote.
- **Deploying is allowed** for this task: Terraform apply on `main`, Cloudflare Pages deploys. No desktop release (no `v*` tag), no server release unless the CORS change needs one.
- **Project rules (`AGENTS.md`).** Never modify primitives or tokens in `packages/ui` (add only). Icon buttons without a label get a tooltip. `outline` variants only for rare emphasis. Dialogs and menus get an axe test. Format with `node_modules/.bin/oxfmt` on changed files only. Before finishing: `bun run lint`, `bun run format:check`, `bun run typecheck`, `bun run test`, `bun run duplication` (under 1%). No `cargo test` needed unless Rust changes. Don't run the server's tests locally. One full jest run at a time.
- **Never pretend.** Done means looked at in a browser (light and dark, desktop and phone width) and built by CI.

## Plan

### Setup

- [x] Merge #298 (`deployed = true`, Scaleway key expiry fix) once checks are green; apply on `main` succeeds; `sync.nookly.work/health` still answers.
- [x] Worktree to `origin/main`; branch `feat/website`.
- [x] Scaffold `apps/web`: Next.js, static export, Tailwind v4 with `@nookly/ui/styles.css`, fonts, dark and light theme like the desktop, lint/format/typecheck/knip/jscpd wired in.

### Pages

- [ ] Shared shell: nav (logo, links, GitHub stars, download split button, language switch), footer (legal links, status link).
- [ ] Landing: hero (symmetry layout, Nookly app card rebuilt from primitives), features, Q&A, closing call to action.
- [ ] Downloads page: sections with brand logos, file sizes, checksums link, iOS coming soon.
- [ ] Status page: banner, components, 90 day bars, live check, last updated.
- [ ] Impressum, privacy policy, terms (English and German, sample values marked).
- [ ] German versions of every page, `hreflang`, sitemap, robots, Open Graph images, favicons.

### Automation

- [ ] Status checker workflow (every 5 minutes, `status-data` branch).
- [ ] Website workflow: build on pull requests; build and deploy to Cloudflare Pages on `main`, on a published release and daily.
- [ ] Terraform: Pages project, domains, DNS; CORS on the server if needed.
- [ ] Secrets and variables set (`CLOUDFLARE_ACCOUNT_ID`, token with Pages edit).

### Release

- [ ] All checks green, PR merged, deploy ran, `https://nookly.work` live in both languages, status page shows data.
- [ ] Branch cleaned up, worktree back on `origin/main`.
- [ ] Final report to the user.

## Needs the user

- Real Impressum, privacy policy and terms (after the lawyer).

## Progress log

- 2026-11-18: brief written. Production is live: `sync.nookly.work` answers 1.0.0, backups daily 02:00 Berlin. #298 waiting on Windows CI.
- 2026-11-19: #298 merged and applied. `apps/web` scaffolded (Next 16.4.5, static export, two root layouts for en/de). Nav with download split button, GitHub stars, language and theme popovers; footer; hero with the hearth and the queue demo, checked in Chrome light and dark. Lint/format/knip/jscpd wiring still to do.
