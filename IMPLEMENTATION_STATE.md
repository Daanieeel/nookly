# Implementation brief and state: the tablet rework

> ## ⛔ DO NOT STOP WORKING. UNDER NO CIRCUMSTANCES.
>
> **Keep working until every item below is ticked and the final report at the end is written. There is no other reason to end a turn.**
>
> - **A batch is finished.** Pick the next unticked item.
> - **You want to report progress.** Write it in the progress log, commit, push, keep going.
> - **A server, Metro or the simulator stopped.** Restart it, or move to work that does not need it.
> - **A side request from the user is done.** Go straight back to this list.
> - **Context is filling up.** It compacts on its own; this file carries you over.
> - **Something needs a real device, the user's eyes or a decision.** Decide (record it in `DECISIONS.md`) or add it to "Needs the user", and move on.

**This file is a ready to run prompt and the handover file.** An agent told "read `IMPLEMENTATION_STATE.md` and get to work" reads this file, `AGENTS.md` and `docs/00-index.md`, then carries the list out from start to finish without human help. Keep it current: tick items, note findings, append to the progress log after every meaningful step.

The earlier rounds (`NOTES.md` rounds one to seven, the first tablet pass) are done and live in git history up to 04256a44 and in `DECISIONS.md` up to D82. This file now holds one thing: the plan to rebuild the tablet (D83), written on 2026-11-15 after the user's feedback on the first pass: "still feels like a big mobile version; navigation feels off; a 1:1 copy of the sidebar doesn't fit; full width bottom sheets don't fit". `NOTES.md` is the user's own file: read it, never edit it.

## Rules

- **Do not ask, do not wait.** When something is ambiguous, decide: what the desktop app does beats `docs/`, which beats your own judgement; the tablet deviates from the desktop only where touch or iPadOS demands it. Record non obvious decisions in `DECISIONS.md` and continue.
- **Never pretend.** Done means it works in the running app (screenshots in **both orientations** you looked at critically) plus an automated test that would have caught the problem. If something cannot be verified here (real device feel, a trackpad, Stage Manager), build the best version and put it under "Needs the user".
- **Safety, no exceptions.** Nookly is released and user data must never be lost. Never run migration or sync code against the user's real Nookly data, only copies and fixtures (`NOOKLY_DATA_DIR` scratch folders). Leave the user's own processes alone: ports 3000, 8081, 1420, the simulator "iPhone 17" `45B8BECE-...`, `/Applications/Nookly.app`. **Never merge into `main`, never push to `main`**, no force push to shared history, no tags, no pull requests. Never `git stash drop` or clear a stash. Kill processes by port or task, never `pkill -f` on the app binary.
- **Git.** Work on `feat/connected-platform`. Commit after every meaningful step, push often (`git push`), but not while a CI run of the last push is still going.
- **Project rules (`AGENTS.md`).** A test first for every fix or behaviour change (watch it fail); versions stay 1.0.0; the mobile app's 1.0.0 is its first release, so the tablet needs no `CHANGELOG.md` line or What's New card unless a desktop change rides along; copy has no em or en dashes and no hyphenated sentence structure; never modify primitives or tokens in `packages/ui` (add only); dialogs and menus get an accessibility test; permanent actions confirm first.
- **Mobile and tablet rules (`AGENTS.md`).** The desktop's Tabler icons only, the same icon per concept (`ui/kit/desktop-icons.test.ts`); exactly one sheet implementation (`apps/mobile/src/ui/sheet/`), with its tablet presentations; motion only from `ui/motion.ts`; touch targets of 44pt or more; no bottom sheet in a tablet window.
- **The phone must not change.** Every step keeps the phone exactly as it is: its tests pass untouched (a phone test that needs editing is a red flag, look again), and phone screenshots of the screens touched look the same as before.
- Run new tests in isolation while working; the whole set at the end.

## How to run everything (this machine)

Worktree: `/Users/daniel/.t3/worktrees/nookly/t3-ed31ca16` (branch `feat/connected-platform`, tracking `origin/feat/connected-platform`, so a plain `git push`).

```sh
cp .env.example .env                 # then set PORT=3100 (the user's own dev server uses 3000); .env is gitignored
bun install
docker compose up -d --wait postgres minio     # only for sync checks; containers nookly-postgres-1 (5433), nookly-minio-1 (9000)
bun run stack                        # the server on http://localhost:3100, only for sync checks
cd apps/mobile && EXPO_PUBLIC_AUTOMATION_URL=http://127.0.0.1:4600 EXPO_NO_TELEMETRY=1 bunx expo start --port 8092 --lan --dev-client --clear
```

- **Simulators.** There is no Simulator app window on this machine; everything runs headless through `xcrun simctl`. The dev client `app.nookly.mobile` is on the **iPad Pro 13-inch (M5)** `ABFEE424-8EE0-4228-BCC2-1C9FDB94BE6D` and the iPhone 17 Pro `EF9F00F7-BA0F-491C-A3C7-97240AFBAF2B` (the phone check). Item 0.3 adds an **iPad mini (A17 Pro)** and an **iPad Pro 11-inch (M5)** simulator: create them with `xcrun simctl create`, install the newest build from DerivedData (`xcrun simctl install <id> <path>/Nookly.app`), never touch the user's "iPhone 17" `45B8BECE-...`. Point a dev client at Metro with `xcrun simctl spawn <id> defaults write app.nookly.mobile RCT_jsLocation localhost:8092`, then `xcrun simctl launch <id> app.nookly.mobile`. Avoid `simctl openurl` (its "Open in Nookly?" prompt cannot be tapped headless; a reboot of the simulator clears it). If `simctl` hangs, shut the simulator down and boot it again.
- Native code changes need a rebuild of the dev client (`bunx expo run:ios -d <id> --port 8092`).
- Screenshots: `xcrun simctl io <id> screenshot file.png`. Rotation: the dev only hook from item 0.2 (`hooks.rotate("landscape")` over the automation hub), since there is no window to rotate.
- Automation: `bun tools/e2e/mobile.ts run tablet "<script>"` drives the iPad through the hub on 4600 (see the comments in `tools/e2e/mobile.ts`); helper scripts from earlier sessions live in the session scratchpad and may be gone, rebuild them from that file.
- Tests: mobile `cd apps/mobile && bunx jest <file>`; shared `cd packages/shared && bunx vitest run`; frontend `cd packages/frontend && bunx vitest run <file>`. Server tests run only in CI (they reach the local MinIO).
- The desktop as reference: read `packages/frontend/src` (the app's UI) and `.reference-images/desktop/`. To look at the running desktop, build the debug app on a scratch fixture only (`bun tools/fixtures/desktop.ts <empty folder>`, then `NOOKLY_DATA_DIR=<folder>`, vite on 1431 with `TAURI_CONFIG='{"build":{"devUrl":"http://localhost:1431"}}' cargo build`, `NOOKLY_AUTOMATION_PORT=4710`, `bun tools/e2e/desktop.ts 4710 --shot out.png`). Never without `NOOKLY_DATA_DIR`.
- Nothing is guaranteed to be running. Start what you need and stop what you started when you are done; delete seeded test data from the simulators afterwards.

## The target

The tablet is **the desktop app made for touch**. A person who knows Nookly on the Mac picks up the iPad and finds the same app: the same sidebar, titlebar, tabs, split view, details pane, the same page layouts, the same popovers and dialogs. What changes is only what touch and iPadOS need: 44pt targets, gestures that follow the finger, no hover only controls, a software keyboard that comes and goes, rotation, and windows of any size.

It is **not** the phone made wider: no pinned phone drawer, no system bar over pages, no bottom sheets, no pushed full screen pages for things the desktop shows beside each other.

### Window classes

The layout follows the **window**, never the device: an iPad in Slide Over, a narrow Stage Manager window or iPadOS 26's freely resized windows can be any width, and the same iPad rotates between two widths. One hook (`useWindowClass()`, item 0.1) answers from the window's size, and every rule below reads it.

| Class    | Window width | Shell                               | Sidebar                                                                     | Details pane                                           | Split view                                                                            |
| -------- | ------------ | ----------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| compact  | under 600    | the phone's (drawer, bottom sheets) | drawer                                                                      | drawer                                                 | off                                                                                   |
| medium   | 600 to 999   | tablet                              | over the page, from the titlebar button or an edge swipe; pinnable from 900 | over the page from the right                           | only the focused group, with a switch button (the desktop's rule for a narrow window) |
| expanded | 1000 and up  | tablet                              | beside the page, collapsible                                                | beside the page while the page keeps 600; else over it | both groups while each keeps 360                                                      |

The details pane and split view decide from the **page's** width (window less sidebar), not the class. Measured sizes (points, portrait by landscape): iPad mini 744 by 1133, iPad and iPad Air 11-inch 820 by 1180, iPad Pro 11-inch 834 by 1210, iPad Air 13-inch 1024 by 1366, iPad Pro 13-inch 1032 by 1376. So an 11-inch iPad is medium in portrait and expanded in landscape; a 13-inch iPad is expanded both ways (sidebar beside the page in portrait too, details pane over the page in portrait and beside it in landscape).

Default layouts this gives, which every page section below refers to:

- **Landscape** (expanded): sidebar 280 beside the page, titlebar and tab strip over the page, details pane 340 beside an open item, a list and an item side by side through split view.
- **Portrait, 13-inch** (expanded, narrow page): sidebar beside the page, details over the page, split view shows the focused group only.
- **Portrait, 11-inch and mini** (medium): sidebar over the page, page full width, details over the page, split view shows the focused group only.

### Presentations

The sheet implementation (`ui/sheet/`) chooses its presentation from what is shown and the window class. Screens never pick one themselves.

| What                                                                                                                                                     | Phone (compact window)        | Tablet                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Picker or select (date, time, repeat, status, priority, Space, course, label, icon, colour, code language, entity picker, Relate to)                     | bottom sheet or card          | **popover** anchored to the field or button                                                                                                                                  |
| Menu (a button's actions, the + in the sidebar, view presets, display options, filter options, split button, tab menu)                                   | bottom sheet or card          | **popover** anchored to the button                                                                                                                                           |
| Context menu (long press, secondary click on a trackpad)                                                                                                 | sheet menu                    | **popover** at the touch point                                                                                                                                               |
| Picker opened from a field inside a dialog or popover                                                                                                    | step pushed on the same sheet | **popover over the dialog**, anchored to the field (the desktop's popovers over its dialogs); a step pushed inside a popover stays a step                                    |
| Create form (New Task, New Note, New Calendar Entry, New Space, New Course, and the rest of `new/*`)                                                     | route sheet or compose sheet  | **dialog**, medium (560 wide), the desktop's `NewEntityDialog` and `QuickCreate*`                                                                                            |
| Quick create on a calendar slot, quick edit of an event                                                                                                  | sheet                         | **popover** anchored to the slot or event (the desktop's `popover-parts`)                                                                                                    |
| Confirmation (permanent actions too)                                                                                                                     | sheet                         | **dialog**, small (420 wide), the desktop's `ConfirmPermanentDialog`                                                                                                         |
| Big flow (Settings, Account, Review Changes, Semester setup, Import, Share, View builder, Calendar Connections, Moodle import, What's New, crash report) | page or large sheet           | **dialog**, large (720) or extra large (960, Settings and Review Changes), never taller than the window less 48; in a medium window it spans the window less 24 on each side |
| Full screen focus (a study session)                                                                                                                      | full screen modal             | full screen in the window, content capped at 720 wide                                                                                                                        |

Popovers: the desktop popover's look (`bg-popover`, border, its corner radius, shadow), 320 wide for lists and the calendar, 360 for the icon grid and filters; they open below the anchor and flip above or to the side when there is no room, keep 12 from the window's edges and above the keyboard, and never cover their anchor. No dimming; a tap outside closes them and does not reach what is under it. Dialogs dim the page, move up with the keyboard so the focused field and the buttons stay in view, and close with Escape, a tap on the dim and their close button. Rotation or a window resize keeps either open: a popover follows its anchor, and closes only if the anchor is gone.

## Definition of done (every page, view, dialog below)

1. A jest test renders it at a tablet window (portrait 834 by 1194 and landscape 1376 by 1032, item 0.1's `WindowSizeProvider`) and checks what the plan says for it (no bar, the right presentation, panes, labelled actions), plus the phone test still passing unchanged.
2. Screenshots on the iPad Pro 13-inch in landscape and portrait and on the iPad mini in portrait, light and dark for anything new, looked at critically next to the desktop's version (`.reference-images/desktop/` or the running desktop on a fixture).
3. Rotation while it is open keeps its state (scroll position, typed text, what is selected, an open popover).
4. Touch: every target 44pt or more, nothing that only shows on hover, Dynamic Type up to the largest standard size without clipping.
5. Hardware keyboard: the desktop's shortcuts for it work, Escape closes it, Tab moves between its fields.
6. Copy says "iPad" or "tablet" where it says "phone" on a phone (item 11.1).

## Items

Order: foundations, then the shell, then presentations, then shared parts, then every page, then input, copy and the checks. Each milestone ends with screenshots of what it changed in the progress log.

### 0. Foundations

- [x] 0.1 **Window classes.** `useWindowClass()` (`compact`, `medium`, `expanded`), `usePageWidth()`, `useOrientation()` in `ui/pane.tsx`, replacing `useIsTablet()` and the `TABLET_WIDTH` 768 check (the iPad mini at 744 is a tablet). A `WindowSizeProvider` for tests (width and height) replacing `WindowWidthProvider`. Tests for every class edge (599, 600, 999, 1000) and for each iPad size in the table.
- [x] 0.2 **Rotation for checks.** Done as a window size override (D84): `hooks.window(1376, 1032)`; `hooks.rotate` is there but the simulator ignores it. A dev only hook (`hooks.rotate("portrait" | "landscape")`) over the automation hub that calls `UIWindowScene.requestGeometryUpdate` through a small addition to a local module (`modules/nookly-keys` or a new dev module), so a headless simulator can be turned. Never in a release build (guarded by the automation address, as the rest of `dev/`).
- [x] 0.3 **Simulators.** iPad Pro 11-inch (M5) `F494D8D6-6296-46B3-8FD9-E0755C3CF575`, iPad mini (A17 Pro) `BA1A25B8-F232-4693-8EED-B227F5CC9E2B`, dev client installed on both; `bun tools/e2e/tablet-shots.ts <sim> <route> <folder> [dark] [script]` shoots six windows on one simulator. Create an iPad mini (A17 Pro) and an iPad Pro 11-inch (M5) simulator, install the dev client, note their ids here. A screenshot script that shoots one route on all three iPads in both orientations (light and dark on request) into a folder named after the route.
- [x] 0.4 **Window controls.** Done: `shell/window-controls.ts` reads the native inset (`modules/nookly-window`, D84) on every window change and when the app comes back; the titlebar starts after the controls while they sit over it. Zero on the simulators (they fill the screen); its room is checked on a real iPad. In iPadOS 26 a resizable window draws its close, minimise and resize controls at its top left, over the app. Read that region through the native layout region API (`UIView.layoutRegion` with `.margins(cornerAdaptation: .horizontal)`) in a native module and give the titlebar and the sidebar's first row room for it, only while the controls show. Spike first; if the API does not reach React Native, record the fallback (a fixed leading inset while the window is not full screen) in `DECISIONS.md`.
- [ ] 0.5 **Pointer spike.** Check what React Native 0.86 gives on iPadOS for a trackpad: hover (`onHoverIn`, `onHoverOut`, pointer events), secondary click (a right click, or a two finger click on the trackpad: React Native Gesture Handler 2.32 `mouseButton`, or a native `UIContextMenuInteraction` free recogniser in a module), and the pointer's lift effect. Write down what works, and what each needs, in `DECISIONS.md`. Hover is a bonus on a tablet, never the only way to anything.
- [ ] 0.6 **Drag and drop spike.** Long press drag inside the app (tabs, Space icons, sidebar rows, task cards across board columns, a row onto the right edge to split), and files dragged in from the Files app onto the Files page (`UIDropInteraction` through a module). Record what is possible now and what is deferred.
- [ ] 0.7 **The seams.** Move the shell choice into one place: the root layout renders `PhoneShell` (today's `SidebarDrawer` path) or `TabletShell` from `useWindowClass()`, switching live when a window crosses 600 without losing the route, tabs or drafts (test: resize across 600 with a draft open). Each screen file exports its content (`TasksContent`) apart from its chrome; the phone route renders the content in the phone chrome, the tablet shell renders it in a tablet page frame (item 1.8). Do this per screen as each screen is reworked, not all at once, and delete the screen's `useIsTablet` branches as it moves. Inventory today's branches first (about 20 in 9 files) and list them here.

### 1. The tablet shell (`apps/mobile/src/shell/`)

Reference: `packages/frontend/src/components/sidebar.tsx`, `sidebar/*`, `titlebar.tsx`, `tab-bar.tsx`, `split-view.tsx`, `right-sidebar.tsx`, `commands-palette.tsx`, `search-palette.tsx`, `docs/04-navigation-spaces.md`.

- [ ] 1.1 **Frame.** `TabletShell` lays out sidebar, titlebar, tab strip, split groups and details pane by the window class table above, and reflows live on rotation and window resize (no reload, no lost scroll). The sidebar's edge and the page card follow the desktop: the page sits on a card with the desktop's border and radius beside the sidebar. Safe areas: the home indicator, the status bar (hidden in a window, shown full screen), the window controls (0.4), the keyboard.
- [ ] 1.2 **Sidebar, rebuilt from the desktop's** (not the phone's `screens/Sidebar.tsx`). New `shell/sidebar/` with the desktop's parts at touch size:
  - the mascot card (`sidebar-mascot.tsx`: date, week, the line about what waits; a tap opens the matching list);
  - the block above the Space (Dashboard, Calendar, Tasks with its saved Views unfolding, Assignments, Pinned, Quick Jot), its order and what is hidden read from the same device preferences as the desktop (`nookly:sidebar-items`, `nookly:sidebar-hidden`), and the settings button under the mascot opening the desktop's popover to hide and reorder them;
  - the Space shown: its name with its menu (popover: Rename, Change Icon, Change Color, Labels, Add Module, Delete Space), its module rows with their figures (`module-row-meta.tsx`) and their saved Views unfolding (`expandable-module-children.tsx`), a module row's context menu with Remove Module (the desktop's `remove-module-dialog`, as a dialog);
  - the bottom row: +, up to four Space slots (three and a three dot popover with the rest beyond four, the temporary slot rule), a divider, Trash, Collapse Sidebar; long press drag reorders Spaces across the row and the popover; the + is a popover with New Space and Add Module;
  - switching Spaces: tap a slot; a horizontal pan on the Space's list follows the finger and lands on the neighbour by speed and distance (the desktop's two finger swipe, here one finger since the sidebar does not slide away); a two finger trackpad swipe does the same; `Cmd+Option+Up` and `Down`; the list slides in from the side the Space sits on; Reduce Motion switches without sliding;
  - rows 44 tall, the desktop's type scale one step up for touch, the desktop's active highlight with the Space's colour bleed, a pressed state, a hover state when a pointer is there; width 280, fixed as on the desktop.
  - Medium windows: the sidebar slides over the page from the left (titlebar button, an edge swipe from the left edge, the desktop's sidebar shortcut), dims the page, closes on a pick or a tap on the dim, follows the finger both ways (motion from `ui/motion.ts`). From 900 wide a pin button keeps it beside the page (device preference). Expanded windows: beside the page, Collapse folds it away entirely, as on the desktop.
  - Settings: the desktop opens it from its menu and `Cmd+,`; on a tablet also from a gear in the bottom row's end, since there is no app menu outside iPadOS 26's menu bar (1.9).
- [x] 1.3 **Titlebar** Done: `Titlebar.tsx` 52 tall: sidebar toggle, back and forward of the tab, `Crumbs.tsx` (Space, module, item; a saved View after its module; Tasks by key), the search field (a search button in a medium window, which keeps the last crumb), the sync button with a popover (state, Sync Now or Sign In, Review Changes, Account), the split button popover (Split Right, Split Left, or Close Split), the details toggle on an item. Tests in `tablet-shell.test.tsx`., the desktop's (`titlebar.tsx`): sidebar toggle, back and forward (this tab's history), the crumbs (the Space's icon and name for Space pages, the item's parents, a saved View's crumb), the search field that opens the search palette, the sync status button and its popover (`SyncStatusButton`), the split button (popover: Split Right, Split Left), the details toggle. 52 tall, every control 44. In a medium window the crumbs shorten to the last one, and the search field becomes a search button.
- [ ] 1.4 **Tabs**, the desktop's (`tab-bar.tsx`): only while more than one tab is open; pinned tabs as icons first; every tab's close button always visible (no hover); + for a new tab (Dashboard); long press drag to reorder, drag onto the other group or onto the page's right edge to split; the tab menu as a popover (Pin, Close, Close Others, Split Right, Split Left, Move to Other Group, Zoom Group); tabs shrink, then the strip scrolls; `Cmd+T`, `Cmd+W`, `Cmd+Shift+W`, `Ctrl+Tab`, `Cmd+Option+Left` and `Right`. Open tabs, order, pins and history persist as they do now (`tabs-store.ts`).
- [ ] 1.5 **Split view**, the desktop's two groups (`split-view.tsx`): each group its own tabs and history, the focused one tinted; a draggable divider (a 44 wide touch area, the desktop's minimum of 360 a side, double tap evens it, the position remembered); a window too narrow for both shows only the focused group with the desktop's switch button; `Cmd+1`, `Cmd+2`, `Cmd+Option+Shift+Left` and `Right`, `Cmd+Shift+Enter` zooms a group. The same page in both groups edits only in the focused one. Rotating from landscape to a portrait too narrow for both keeps both groups and shows the focused one; rotating back shows both again.
- [ ] 1.6 **Opening things.** A tap opens in the same tab (the desktop's click). Long press or secondary click on any row or link gives Open in New Tab and Open on the Right first in its context menu (the desktop's `Cmd+click` and split). **List beside item:** while the page has room for both groups, an item opened from a list opens in the right group as a preview tab (replaced by the next item opened the same way until it is edited or pinned, as an editor group's preview in VS Code), so a list and its item sit side by side, the iPad's list and detail; when there is no room it opens in place. A Display option "Open Items Beside the List" (device preference, on by default on a tablet) turns it off. Record in `DECISIONS.md`; flag for the user's feedback.
- [ ] 1.7 **Details pane**, the desktop's right sidebar (`right-sidebar.tsx`): the item's properties, labels, attachments, mentioned, mentioned in, relationships, in the desktop's order, with the Course's semester section and the Jot's Refine button; beside the item when the page keeps 600, else sliding over it from the right (the titlebar's details toggle, an edge swipe from the right edge, the desktop's shortcut); collapsed state remembered like the desktop's (`useInspectorCollapsed`). Replaces today's `Inspector` and, on a tablet, the phone's `DetailsDrawer`.
- [ ] 1.8 **Page frame.** One `TabletPage` every tablet page renders in: the page's header row (title, its View tabs, Filter, Display, labelled actions, the desktop's `page-header.tsx` and `module-view-header.tsx`), the page's content width rules (the desktop's reading width for items, `detail-page-width`), scroll memory per tab, the fixed top of a list (D79), the save bar (D78) placed as the desktop's. `PageActions` (D82) stays as the declaration and draws only here. No system bar on any tablet page, including the ones still showing one now (account, Sidebar settings, Shortcuts, What's New, Space Settings, Moodle pages, Assignments, Review Changes).
- [ ] 1.9 **Palettes and the menu bar.** The commands palette and the search palette as the desktop's: a panel near the top centre of the window (not a sheet), 640 wide or the window less 48, the search field focused, arrow keys and Return with a hardware keyboard, Recents in `Cmd+K`, entity keys beside titles. iPadOS 26's menu bar (pulled down from the top, or shown holding `Cmd`): register the desktop's menus and shortcuts (File, Edit, View, Go, Window) with their titles, through `modules/nookly-keys`, so iPadOS lists every shortcut; this is the system's own bar, not a translated desktop control.
- [ ] 1.10 **Back.** Inside a page: the titlebar's back, the desktop's Back shortcut, and a swipe from the left edge of the page group going back in this tab's history, following the finger with the page behind it showing (a medium window's left edge swipe opens the sidebar when there is nothing to go back to). No stack pushes for pages on a tablet: a tab's history is the navigation.
- [ ] 1.11 **First run and signed out.** Welcome, Sign In, Create Account, Reset Password and the first sync page as centred cards over the app's background (the desktop's `AccountDialog` and `FirstSyncDialog`), in a medium window too; no phone pages full width.

### 2. Presentations (`apps/mobile/src/ui/sheet/`)

- [x] 2.1 **Popover.** Done: `ui/sheet/Floating.tsx` (`PopoverFrame`, `PopoverPanel`), placed by `placement.ts` (below, flipped above, beside a tall anchor, 12 from the edges, above the keyboard), anchored by `useAnchor()` or, when nothing names one, the view the last touch landed on (`touch-point.ts`, noted by the tablet shell's root); measured again on a window change and after the keyboard settles, closed when its anchor is gone; steps push inside with a back button; Escape closes (`layers.ts`). Arrows and Return in lists moved to 10.1; focus returning to the anchor is the system's once the modal window goes. A new presentation of the one sheet: anchored to a measured rectangle (`useAnchor()` returns a ref and its window rectangle, measured on open and on every layout change), placed by the rules in "Presentations" above, sized by its content up to the window's room, with its own scroll; the sheet's steps push inside it with a back button; its search field pinned at the top; the desktop popover's look; the open and close motion from `ui/motion.ts` (a spring out of the anchor, a fade under Reduce Motion), a new spring added there; keyboard: arrows move the highlight, Return picks, Escape closes; focus returns to the anchor when it closes. Tests: placement at every window edge and above the keyboard, flip, rotation keeps it on its anchor, tap outside closes without passing through, accessibility (modal, labelled, focus order).
- [x] 2.2 **Dialog.** Done: `DialogFrame` with `CardPanel`, widths small 420, medium 560, large 720, extra large 960, never wider than the window less 24 a side or taller than less 48, up with the keyboard; a form's own title row (`SheetHeader`) stays; Command Return presses the main button a form names (`useSheetSubmit`, the compose forms); Escape and VoiceOver's escape close it. Confirmations show the desktop's footer (Cancel, then the action, at the bottom right). Asking before a dirty form closes moved to 7.2. A new presentation: centred, sizes small 420, medium 560, large 720, extra large 960, the desktop dialog's look (radius, the title row with the round close button, D65's nested corner math, `CARD_INSET`), its content scrolls under a pinned title and pinned actions (`DialogActions` side by side at the bottom right, the main one filled, as the desktop's `submit-dialog-footer`), keyboard avoidance (moves up, then shrinks), `Cmd+Return` submits, Escape closes; a dirty form asks before closing (the desktop's rule). Tests as for the popover.
- [x] 2.3 **Context menu.** Done: `menu.show` takes `anchor` and `kind` (`menu`, `context`); a long press menu opens at the finger, a button's at the button, through the touch point when the caller names nothing. Secondary click waits on 0.5. `menu.show` takes the touch point (or the anchor) and shows a popover there on a tablet; long press anywhere a phone has a long press menu, plus secondary click where 0.5 found a way. Same `MenuEntry` lists as now.
- [x] 2.4 **Choosing.** Done: `presentation.ts` (`resolvePresentation`, `usePresentation`); `Sheet`, `RouteSheet`, `sheetRoute` (a `kind`, `form` by default), `SheetHost` menus and confirmations go through it; a compact window keeps exactly what it showed (tests in `tablet-presentation.test.tsx`). One resolver (`usePresentation(kind)`, kinds `picker`, `menu`, `context`, `form`, `confirm`, `flow`, `focus`) maps to the table above from the window class; `Sheet`, `RouteSheet`, `sheetRoute`, `menu.show`, `Confirm` and `Compose` all go through it. A route sheet (`new/*`, `pick/icon`, `calendar-event`) shows as a dialog over the page that opened it, the route still the source of truth (links keep working). A phone renders exactly what it does now (test).
- [x] 2.5 **Every existing sheet, mapped.** Done: every picker opened as a card is a popover where it was touched; Filter and Display (`ListControls`, `TasksScreen`) are wide popovers; file Labels a popover; `new/*` medium dialogs, `new/semester-setup`, `new/import`, `new/share` large ones, `pick/icon` and `calendar-event` popovers where the finger was; Edit Card, Moodle import and the other tall sheets large dialogs; everything else a medium dialog. A sheet opened from the keyboard alone (no touch) falls back to a dialog on purpose. Go through every `Sheet`, `sheetRoute`, `menu.show` and `confirm` use (about 40 places: `SpaceSettings`, `FileViewSheets`, `Compose`, `SelectField`, `ListControls`, `LatexPage`, `AccountPage`, `TrashScreen`, `TasksScreen`, `Sidebar`, `RecipeScreens`, `NewScreens`, `DeckPage`, `DisplayParts`, `property-rows`, `SaveBar`, `DateField`, `ActiveFilters`, `entity-actions`, `SemesterList`, `ScanSheet`, `RelatedSection`, `PlannerScreens`, `MoodleFile`, `CalendarScreen`, and the routes) and give each its kind and an anchor. List them here as they are done; a use without an anchor on a tablet is a bug (a test fails on it).

### 3. Shared parts at tablet size

Reference: `packages/frontend/src/components/*`. Each gets a tablet rendering in `ui/` next to the phone's, the same props.

- [ ] 3.1 **Sizes.** A tablet scale in `ui/tokens.ts` (added, never changing the phone's): rows 44, body 15, small 13, icons 18, the desktop's spacing between controls, page gutters 24 (32 in a wide page). Buttons the desktop's sizes with their height at 44 for touch (a hit area round the smaller ones where the desktop look needs them smaller).
- [ ] 3.2 **List header**: title, View tabs (`page-tabs.tsx`, the desktop's tabs, not the phone's segmented), Filter, Display, active filter chips under it (D75, the desktop's `quick-filter-bar`), labelled actions; wraps to two rows in a narrow page.
- [ ] 3.3 **Tables**: the desktop's `data-table` for list modules: column headers that sort on tap, the desktop's columns per module, sticky header, rows 44, a selected row, swipe actions kept from the phone (D76) plus the context menu; in a narrow page the columns reflow (fewer columns, then two line rows), never horizontal scroll (`docs/05-ui-ux-direction.md`, Responsiveness).
- [ ] 3.4 **Grouped list and board**: the desktop's `grouped-view` (groups with headers and counts, collapsible); the board's columns side by side, scrolling sideways when they do not fit, cards dragged between columns with a long press (0.6).
- [ ] 3.5 **Property rows and pills**: the desktop's `property-row`, `property-fields`, `task-properties`, inline in the details pane and in item headers, each opening its picker as a popover anchored to it.
- [ ] 3.6 **Pickers' content in a popover**: date (the desktop's calendar month with the time field, `date-input.tsx`), time, repeat (`repeat-chip`, `RepeatPicker`), select, entity picker and Relate to (`entity-picker`, `RelatePickerPopover`), labels (`label-manager`, the File label choice), icon (`icon-picker`, the grid at 8 columns), colour, Space, course, code language, the filter menu and the display menu (`filter-menu`, `display-menu`), view presets. The rows keep the bottom sheet's look (icon badge, title, subtitle, checkmark), sized for a popover.
- [ ] 3.7 **Feedback**: in place first (D-rules in `docs/05-ui-ux-direction.md`); the desktop's toasts (`app-toaster`) at the bottom right of the window, above the keyboard; empty, loading and error states as the desktop's `empty-state`.
- [ ] 3.8 **Fields**: text, number, time, year, search: the desktop's look with touch heights; a field focused with a hardware keyboard shows a focus ring.
- [ ] 3.9 **Editor chrome**: with the software keyboard, the toolbar over the keyboard as now; with a hardware keyboard (no software keyboard up), the desktop's format bar over a selection and the slash menu as a popover at the caret; the find bar (`FindBar`) under the titlebar with `Cmd+F`; the desktop's block handles reachable by touch (a long press on a block's left edge).

### 4. Top level pages

Each page: the desktop's layout in the tablet page frame (1.8), portrait and landscape as below, its pickers as popovers and its forms as dialogs.

- [ ] 4.1 **Dashboard** (`index`): the desktop's `DashboardView` with its panels (briefing, calendar, tasks, assignments, decks, jots, pinned, the mascot corner), not the phone's Home of shortcuts (D77 is the phone's). Landscape: the desktop's grid of panels in columns. Portrait: two columns on 13-inch, one on medium. Panels' rows open in place, or beside (1.6).
- [ ] 4.2 **Calendar** (`calendar`): the desktop's `UnifiedCalendarView`: Month, Week, Day and the view switch in the header row (not the phone's bar, D80), Today and the arrows; the time grid with the all day row; drag on empty time to create (a popover anchored to the new block with the quick create form), drag an event to move it, its edge to resize; tap an event for its popover; the external overlay read only. Landscape: Week by default. Portrait: Week on 13-inch, 3 days on medium (remembered per device and orientation). Pinch to change the hour height. New Calendar Entry as the labelled action.
- [ ] 4.3 **Tasks** (`tasks`, the cross Space overview): the desktop's `TasksOverviewView`: list grouped by Space with the Space chips, or the board; saved Views as tabs; filter chips; properties as pills opening popovers; New Task asks for the Space in its dialog. Landscape: list beside the open task (1.6). Portrait: full width list.
- [ ] 4.4 **Assignments** (`assignments`, the overview): the desktop's `AssignmentsOverviewView`, grouped by Space, its display menu (`AssignmentDisplayMenu`), the due picker (`AssignmentDuePicker`) as a popover. Moves from a pushed page with a bar into the tablet frame.
- [ ] 4.5 **Pinned** (`pinned`): the desktop's `PinnedView` grouped by type, as a table.
- [ ] 4.6 **Search** (`search`): on a tablet the search palette (1.9) is the way in; the Search page itself stays for a full results list (the desktop's `search-palette` results with entity keys and filters by type), reached from the palette's "Show all results".
- [ ] 4.7 **Trash** (`trash`): the desktop's `TrashView` as a table (name, type, Space, deleted on), Restore and Delete Forever per row and for a selection, emptying through the confirmation dialog.
- [ ] 4.8 **Space page** (`space/[id]`): what the desktop shows for a Space (its modules' overview); Space Settings as a labelled action opening the Space Settings dialog (6.12).

### 5. Module pages (`module/[spaceId]/[module]`, and saved Views of each)

All: the list header (3.2), the desktop's columns (3.3), View tabs and presets, filter and display as popovers, the save bar for changed filters (D78), labelled New action naming what it makes, list beside item in landscape (1.6).

- [ ] 5.1 **Tasks** in a Space: the desktop's `TasksListView` (Linear style list, grouped, inline property pills) and `TaskBoard`; `QuickCreateTask` inline at a group's end as on the desktop.
- [ ] 5.2 **Notes**: the desktop's `NotesListView` and `RecentNotesTable`.
- [ ] 5.3 **Jots**: the desktop's `JotsListView`; Quick Jot from the sidebar as the desktop's popover composer (`QuickJot`), not a sheet.
- [ ] 5.4 **Bookmarks**: the desktop's `BookmarksListView` with previews (`bookmark-preview`), the paste bar placed as the desktop's add field, the bookmark editor (`BookmarkSheet`) as a dialog.
- [ ] 5.5 **Files**: the desktop's `FilesListView`: grid with thumbnails or table, picked labels as chips with Change Labels (a popover), New View (the View builder dialog, D81), Add Files and Scan Document as actions, the paste bar as the desktop's, a drop target for files dragged in (0.6). Landscape grid 5 to 6 columns, portrait 3 to 4.
- [ ] 5.6 **Recipes**: the desktop's `RecipesListView` and `RecipeLists`, tags (`recipe-tags`) as popovers, the gallery with banner images.
- [ ] 5.7 **Courses**: the desktop's `CoursesListView` with the semester panel (`CourseSemesterPanel`).
- [ ] 5.8 **Exams**: the desktop's `ExamsListView` and its calendar.
- [ ] 5.9 **Decks**: the desktop's `DecksListView` (due counts, Study).
- [ ] 5.10 **Assignments** in a Space: the desktop's `AssignmentsListView` with its groups.
- [ ] 5.11 **Sessions**: the desktop's `SessionsListView` and its calendar cutout; Set Up Semesters and New Session.
- [ ] 5.12 **Semesters**: the desktop's `SemestersListView`; the setup wizard as a large dialog (7.4).
- [ ] 5.13 **Calendar entries**: the desktop's `CalendarEntriesListView` and its calendar.
- [ ] 5.14 **Grades**: the desktop's `GradeReportView` table (sticky first column, cells editable in place, `GradeCells`), portrait drops the less needed columns first.
- [ ] 5.15 **Moodle**: the desktop's `MoodleView` and `CoursesPage` (the course grid with `CourseArt`), the account (`MoodleAccount`) as a popover from its header.
- [ ] 5.16 **Saved Views** of every module above: the View's crumb in the titlebar, its title editable in place (`EditableViewTitle`), its actions menu (`ViewActions`) as a popover, its icon (`ViewIconButton`) as the icon popover.

### 6. Item pages (`entity/[id]`, `file/[id]`, `calendar-event`)

All: the reading width of the desktop's `entity-detail-layout`, the title and key, the details pane (1.7), the item's menu (the desktop's `entity-actions`: Pin, Copy Link, Copy ID, Move to Space, Export, Share, Delete) as a popover from a button in the header, no system bar, the item's own parts in the middle. In a split group they work at 360 wide.

- [ ] 6.1 **Note** (page editor): the desktop's `PageDetailView`: the editor at the desktop's reading width, its chrome per 3.9, page export (`ExportPageDialog`, large dialog), Share Page (`SharePage`, dialog), Import (`ImportDialog`), code language picker, inline math editor, the spell check prompt, the presence of others (`page-presence`), Vim indicator when on. Landscape with details pane beside; portrait details over it.
- [ ] 6.2 **Jot**: as the desktop's, with Refine Into New Note (`RefineJotButton`).
- [ ] 6.3 **Task**: the desktop's `TaskDetailView`: status, priority, due, repeat as pills with popovers, sub tasks, parent, description.
- [ ] 6.4 **Bookmark**: the desktop's bookmark detail with its preview.
- [ ] 6.5 **Calendar entry**: the desktop's `CalendarEntryDetailView`.
- [ ] 6.6 **Course**: the desktop's `CourseDetailView` with the week cutout (`CourseWeekCutout`), its sessions, exams, assignments, grades.
- [ ] 6.7 **Exam**: the desktop's `ExamDetailView`.
- [ ] 6.8 **Deck**: the desktop's `DeckDetailView` with its cards as a table, the card editor, the image lightbox (`ImageLightbox`) as a full window view with pinch zoom, Study as the labelled action.
- [ ] 6.9 **Recipe**: the desktop's `RecipeDetailView`: banner, ingredients beside steps in landscape, stacked in portrait; the photo picker.
- [ ] 6.10 **Session** and **Semester**: the desktop's `SessionDetailView` and `SemesterDetailView`.
- [ ] 6.11 **Assignment**: the desktop's `AssignmentDetailView` with grading rows (`AssignmentGradingRows`) and the evaluation toggle.
- [ ] 6.12 **Space Settings** (`space-settings/[id]`): a large dialog with the desktop's sections (name, icon, colour, labels, modules, delete), not a pushed page.
- [ ] 6.13 **File** (`file/[id]`): the desktop's `FileDetailView`: the PDF viewer with its toolbar (`pdf-toolbar`), search (`pdf-search-controls`), thumbnails beside the pages in landscape (a popover from the toolbar in portrait), pinch zoom anchored under the fingers (`pdf-zoom-anchor`); images, office documents, code, Markdown as the desktop's viewers; Share File (`ShareFile`).
- [ ] 6.14 **Outside calendar event** (`calendar-event`): a popover from its block in the calendar, read only, as the desktop's `ExternalEventBlock`; opened from a link, a medium dialog.
- [ ] 6.15 **Conflict badge** and **Review Changes** (`conflicts`, the merge editor): an extra large dialog with the desktop's `MergeEditor` two sides side by side in landscape, one above the other in portrait.

### 7. Create flows (`new/*`, `pick/icon`)

All: a medium dialog over the page that opened them (2.4), the desktop's fields in its order, the pickers inside as popovers over the dialog, the main button filled at the bottom right, `Cmd+Return`, a draft kept across rotation.

- [ ] 7.1 New Task, New Note, New Jot, New Bookmark, New Calendar Entry (with its Space picker on the cross Space calendar), New Session, New Course, New Exam, New Assignment (the desktop's `QuickAssignmentDialog`), New Deck, New Recipe, New Semester, New Space (`space-dialogs`, `space-form-fields`): each the desktop's dialog (`NewEntityDialog`, `NewTaskDialog`, `QuickCreateDialogShell`, `CreateNameDialog`).
- [ ] 7.2 The compose form (`ComposeForm`, `ui/sheet/Compose.tsx`): on a tablet the desktop's quick create look (title field big at the top, properties as pills under it, Send at the bottom right), in a medium dialog. Also (from 2.2): a dirty form asks before its dialog closes.
- [ ] 7.3 **Icon picker** (`pick/icon`): a popover anchored to the icon it changes, the desktop's `icon-picker` grid with search and tabs.
- [ ] 7.4 **Semester setup** (`new/semester-setup`, `SetupSemestersScreen`): the desktop's `SemesterSetupWizard` as a large dialog with its steps.
- [ ] 7.5 **Import** (`new/import`): the desktop's `ImportDialog` and `MoodleImport` as large dialogs; picking files from the system's document picker as now.
- [ ] 7.6 **Share into Nookly** (`new/share`): a large dialog; check it from the share extension in both orientations.
- [ ] 7.7 **Scan Document** (`ScanSheet`): the system scanner as now (it is the camera), what follows in a medium dialog.

### 8. Settings, account and sync

- [ ] 8.1 **Settings** (`settings/index`, `settings/[page]`): the desktop's `SettingsDialog` as an extra large dialog over the app (D82's two panes move into it): the categories on the left grouped as the desktop's (General, Appearance; Writing and study: Editor, Calendar; Data and accounts: Account, Backup, Connections; Power tools: Shortcuts, LaTeX), the picked one on the right; `Cmd+,`. Rows the desktop's `SettingRow` at touch height; theme cards (`theme-cards`) in a row. Agent and About stay desktop only unless they apply (About: the version, links; decide and record).
- [ ] 8.2 **Account** (account page, sign in, sign up, reset): inside Settings as the desktop's `AccountCards`; signing in from outside Settings as the desktop's `AccountDialog` (1.11).
- [ ] 8.3 **Backup** (`BackupPage`): the desktop's `backup-controls` and `backup-restore`, restore confirmed in a small dialog; copy about "this iPad" (11.1).
- [ ] 8.4 **Calendar Connections** (`settings/calendar-connections`): the desktop's `CalendarConnectionsDialog` and `ConnectionCards`, inside Settings under Connections, with Moodle sign in (`moodle-signin`, the desktop's `ConnectMoodle`) beside it.
- [ ] 8.5 **Sidebar settings** (`settings/sidebar`): on a tablet the sidebar's own popover under the mascot (1.2) replaces this page; the route opens that popover.
- [ ] 8.6 **Keyboard Shortcuts** (`settings/shortcuts`): inside Settings as the desktop's `ShortcutsTab`, editing a shortcut with a hardware keyboard (`ShortcutControl`, the conflict dialog `ShortcutConflictDialog`); without one, a read only list with a note.
- [ ] 8.7 **LaTeX** (`LatexPage`): the desktop's `LatexMacrosPanel` inside Settings.
- [ ] 8.8 **What's New** (`settings/whats-new`): the desktop's `WhatsNewDialog`, a large dialog.
- [ ] 8.9 **Sync**: the status button and popover in the titlebar (1.3), share dialogs (`ShareDialog`) as medium dialogs, the first sync page as the desktop's `FirstSyncDialog` (1.11), view only pages marked as the desktop marks them.
- [ ] 8.10 **Welcome** (`welcome`): a centred card in both orientations, the mascot, the copy naming an iPad.

### 9. Moodle and study

- [ ] 9.1 **Moodle course** (`moodle/[courseId]`): the desktop's `CoursePage`: sections listed on the left beside the content in landscape (`SectionPage`, `CourseContents`), sections as a popover from the header in portrait; assignments, forums, grades as the desktop's tabs (`CourseAssignments`, `CourseForums`, `CourseGrades`), progress (`MoodleProgress`).
- [ ] 9.2 **Moodle assignment, forum, discussion, page, file** (`moodle/assignment/[id]`, `moodle/forum/[id]`, `moodle/discussion/[id]`, `moodle/page/[cmid]`, `moodle/file`): pages in the tablet frame at the reading width with the desktop's `MoodleHtml` rendering, no system bar, crumbs in the titlebar (course, then the item); Import as a labelled action.
- [ ] 9.3 **Study session** (`study/[deckId]`): full window, the card centred at most 720 wide, the desktop's keys (Space flips, 1 to 4 rate, `Cmd+Z` undoes), the rating buttons at the bottom in reach of both thumbs in landscape; the top row (Back to Deck, counts, Undo) the session's own, as now.

### 10. Input

- [ ] 10.1 **Hardware keyboard**: every desktop shortcut that applies (`packages/frontend` keymap, `ShortcutHost`), Tab and Shift Tab between fields and through popover rows, Escape closes the top popover or dialog, Return opens the selected row, arrows move through lists and tables, the desktop's New shortcut creates on the page shown. Holding `Cmd` lists them (1.9). Test the list of shortcuts against the desktop's. Also (from 2.1): arrows move the highlight in a popover's list and Return picks.
- [ ] 10.2 **Pointer** (from 0.5): hover highlight on rows, buttons, tabs, the pointer's lift on round buttons, secondary click opens context menus, scrolling with two fingers, the divider and pane edges showing a resize pointer where the API allows.
- [ ] 10.3 **Drag and drop** (from 0.6): tabs, Spaces, sidebar rows, task cards, rows onto the right edge to split, files from other apps onto Files; each with the desktop's drop previews.
- [ ] 10.4 **Gestures**: edge swipes (left: back or the sidebar; right: the details pane), the sidebar's Space pan, pinch in the calendar and the PDF viewer, swipe rows (D76). None of them fight each other or the system's own (home indicator, Slide Over, the Dock): test each pair that shares an edge.
- [ ] 10.5 **Apple Pencil**: Scribble writes into every text field (the system's; check it is not blocked by a gesture), tapping with the Pencil works as a touch everywhere.

### 11. Copy and docs

- [ ] 11.1 **The device's name in copy**: one helper (`deviceName()`: "iPhone", "iPad", "phone", "tablet" on Android) and every text that says "this phone" (about 70 in 31 files: Backup, Haptics, sync, the welcome, the account) reads it. Test that no text names a phone on a tablet.
- [ ] 11.2 **Docs**: `docs/04-navigation-spaces.md` gets a tablet section (window classes, sidebar over or beside, list beside item, back); `docs/05-ui-ux-direction.md`'s Responsiveness gets the presentation table; `DECISIONS.md` gets every decision taken on the way (D84 on).
- [ ] 11.3 **Haptics**: iPads have no Taptic Engine; the haptics setting hides on a tablet (`HapticsRow`), and nothing relies on a haptic to confirm an action.

### 12. Checks and report

- [ ] 12.1 **The matrix**: every route of the app (the list in "Routes" below) on the iPad Pro 13-inch landscape and portrait, the iPad Pro 11-inch landscape and portrait, the iPad mini portrait, and once at a compact width (Slide Over, the phone layout); each screenshot looked at; a page that looks like a phone page is a failure.
- [ ] 12.2 **Rotation under load**: rotate with a popover open, a dialog with a half typed form, the keyboard up in a note, both split groups open, the sidebar over the page, the details pane over the page, a study session, a drag held. Nothing is lost, nothing ends up off screen.
- [ ] 12.3 **The phone unchanged**: the phone's full jest suite, and screenshots of the main phone screens next to the ones from before the rework.
- [ ] 12.4 lint, format:check, typecheck, test, cargo test (if Rust changed), duplication under 1%; report only checks read (`coverage`, `unused`, `audit`, `lint:rust:strict`).
- [ ] 12.5 CI on this branch's open PR green at the end. Never merge it.
- [ ] 12.6 Final report below.

## Routes

Every route and where this plan covers it (tick nothing here; it is the checklist for 12.1).

| Route                                                                                                                                                                            | Item        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `(drawer)/index` (Dashboard)                                                                                                                                                     | 4.1         |
| `(drawer)/calendar`                                                                                                                                                              | 4.2         |
| `(drawer)/tasks`                                                                                                                                                                 | 4.3         |
| `assignments`                                                                                                                                                                    | 4.4         |
| `(drawer)/pinned`                                                                                                                                                                | 4.5         |
| `(drawer)/search`                                                                                                                                                                | 4.6, 1.9    |
| `(drawer)/trash`                                                                                                                                                                 | 4.7         |
| `(drawer)/space/[id]`                                                                                                                                                            | 4.8         |
| `(drawer)/module/[spaceId]/[module]`                                                                                                                                             | 5.1 to 5.16 |
| `entity/[id]`                                                                                                                                                                    | 6.1 to 6.11 |
| `file/[id]`                                                                                                                                                                      | 6.13        |
| `calendar-event`                                                                                                                                                                 | 6.14        |
| `conflicts`                                                                                                                                                                      | 6.15        |
| `space-settings/[id]`                                                                                                                                                            | 6.12        |
| `new/task`, `new/page`, `new/jot`, `new/bookmark`, `new/entry`, `new/session`, `new/course`, `new/exam`, `new/assignment`, `new/deck`, `new/recipe`, `new/semester`, `new/space` | 7.1, 7.2    |
| `pick/icon`                                                                                                                                                                      | 7.3         |
| `new/semester-setup`                                                                                                                                                             | 7.4         |
| `new/import`                                                                                                                                                                     | 7.5         |
| `new/share`                                                                                                                                                                      | 7.6         |
| `settings/index`, `settings/[page]`                                                                                                                                              | 8.1         |
| `account/sign-in`, `account/sign-up`, `account/forgot`                                                                                                                           | 8.2, 1.11   |
| `settings/calendar-connections`, `moodle-signin`                                                                                                                                 | 8.4         |
| `settings/sidebar`                                                                                                                                                               | 8.5         |
| `settings/shortcuts`                                                                                                                                                             | 8.6         |
| `settings/whats-new`                                                                                                                                                             | 8.8         |
| `welcome`                                                                                                                                                                        | 8.10        |
| `moodle/[courseId]`                                                                                                                                                              | 9.1         |
| `moodle/assignment/[id]`, `moodle/forum/[id]`, `moodle/discussion/[id]`, `moodle/page/[cmid]`, `moodle/file`                                                                     | 9.2         |
| `study/[deckId]`                                                                                                                                                                 | 9.3         |
| the shell: sidebar, titlebar, tabs, split, details, palettes                                                                                                                     | 1.1 to 1.10 |
| first sync page, sync status, share                                                                                                                                              | 1.11, 8.9   |

Menus and dialogs that are not routes and where they land: the sidebar's + (1.2), the Space menu and the Spaces overflow (1.2), Remove Module (1.2), the sidebar items popover (1.2, 8.5), the tab menu (1.4), the split button (1.3), the sync status popover (1.3, 8.9), an item's menu (6), context menus on rows (2.3), view presets, filter and display menus (3.6), the View builder and picked labels (5.5), View actions and icon (5.16), the save bar (1.8), every confirmation (2.2), the code language picker, inline math, the spell check prompt (6.1), the bookmark editor (5.4), the deck's lightbox (6.8), the crash report (a large dialog, as the desktop's `CrashReportDialog`).

## Needs the user

- After milestone 1 and 2 (shell and presentations): look at the screenshots in the progress log, and give feedback on the feel on a real iPad, above all on list beside item (1.6) and the sidebar over the page in portrait. Work goes on meanwhile.
- On a real iPad with a Magic Keyboard or a trackpad: hover, secondary click, the menu bar, shortcuts.
- On a real iPad with Stage Manager or iPadOS 26 windows: resizing across the window classes, the window controls (0.4).
- Still open from the seventh round: the desktop page cut off on the right needs what was done just before it happened. The phone's real device checks from earlier rounds are listed in git history (04256a44, "Needs the user").

## Progress log

- 2026-11-15: file cleared and refilled with the tablet rework plan (D83); `AGENTS.md`'s mobile rules now name the tablet's popovers and dialogs.
- 2026-11-15: 0.1 to 0.3 (window classes, the dev window override D84, iPad simulators and `tablet-shots.ts`); the shell draws its pages in tabs and groups from the router (`workspace.ts`, `pages.tsx`, `PageHost`, `follow-router.ts`); the sidebar rebuilt from the desktop's (`shell/sidebar/`).
- 2026-11-16: milestone 2: popovers and dialogs (`ui/sheet/Floating.tsx`, `placement.ts`, `presentation.ts`, `touch-point.ts`, `layers.ts`), Escape and Command Return; checked on the iPad Pro 13-inch (New Task dialog, status popover over it, a task's long press menu with its Labels step). Lint errors from the earlier tablet commits fixed (CI's `lint:js` failed on them).

## Final report

Not yet written.
