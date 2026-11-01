# Navigation and Spaces

## Spaces

Formerly called "Environments." Spaces are groupings in the sidebar, similar to Notion teamspaces (for example Work, Private, Study).

Spaces are flat and cannot be nested. Every entity belongs to exactly **one** Space, with no exceptions and no sub-spaces.

Spaces are a hard wall. By default there is no browsing, filtering, or module view across Spaces, apart from the deliberate [cross-Space exceptions](#cross-space-exceptions) below. This matches how Notion behaves.

**Fields:** name, icon, and color. The user picks the icon and the accent color separately. A Space's icon renders in its own accent color, which is the **one** exception to the neutral fallback icon rule (see [base fields](02-entity-model.md#base-fields)).

The user can create as many Spaces as they like using the "+" in the sidebar's bottom row. A new Space can start from a lightweight template, and the community can contribute templates the same way it contributes modules.

Spaces only contain pages and entities. Modules cannot be enabled or disabled per Space, because module config is always global (see [philosophy](01-philosophy.md#module-config-is-always-global)).

The active Space's color carries into the UI beyond its sidebar label: active state highlights, accent borders and buttons, and a subtle tint across its views.

## Sidebar Structure (locked visual spec)

- The sidebar shows **one Space at a time**, like Arc and Zen: the active Space's name over its modules and pages as a flat list. There are **no** sub-groups, folders or category headers such as "Personal" or "Study."
- Only show the modules and pages a Space actually uses. Do not list every available module type by default. Rows appear as content is created, or when a module is added explicitly through the "+".
- Dashboard, Calendar, Tasks, Assignments, Pinned and Quick Jot sit in a block above the Space's modules, since they span all Spaces. A settings button under the mascot opens a popover to hide each of them and drag them into a different order. The popover also hides Trash at the bottom. The choices are device preferences (`nookly:sidebar-items`, `nookly:sidebar-hidden`).
- The active Space follows the focused tab or split group. Opening anything in another Space (Pinned, search, a link, a tab) switches the sidebar to that Space, sliding the list in from the side the Space sits on. Picking a Space in the bottom row only changes the sidebar, never the page. The last active Space is remembered (`nookly:active-space`).
- A module row's context menu has Remove Module. It asks to either hide the module (everything stays saved, hidden from every list, search and Pinned, and back when the module is added again) or move all its content to Trash.

### Bottom row

From left to right: a shared "+", up to four slots of Space icons, a divider, then Trash and Collapse sidebar as small icon buttons. The CLI install card and the update cards stay above the row and only show when needed. So does a one line hint about the two finger swipe, which shows while there is more than one Space and goes for good the first time the swipe is used (`nookly:swipe-hint-done`).

- The "+" opens a popover with New Space and Add Module. Add Module adds to the active Space.
- A slot shows a Space's own icon in its accent color. The active Space is highlighted. Right click a slot for Rename, Change Icon, Change Color, Labels, Add Module and Delete Space. Rename and the two Change entries open the Space's settings, where name, icon and color sit together. Delete asks for confirmation first.
- With four Spaces or fewer, all show. With more, three show and the fourth slot is a three dot button that opens a popover with the rest. A Space from the popover that becomes active temporarily takes the last visible slot. The stored order never changes from this, so going back to a visible Space restores the original row.
- Drag and drop reorders Spaces across the row and the popover as one list, stored in `spaces.position`. A drop on the temporary slot inserts before the Space it displaced.
- The sidebar has a fixed width, so the number of slots is fixed.

### Switching Spaces

| Action                 | How                                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pick a Space           | Click its icon in the bottom row or its row in the three dot popover                                                                                                                                                      |
| Next or previous Space | Swipe left or right with two fingers on the sidebar (it follows the fingers and rubber bands at either end), `Cmd+Option+Down` and `Cmd+Option+Up` (`Ctrl+Alt+Down` and `Ctrl+Alt+Up` on Windows and Linux, wraps around) |
| Go to a Space          | `Go to <Space>` in the commands palette                                                                                                                                                                                   |

Both ways of cycling go through the whole stored order, hidden Spaces included.

The swipe is a drag, not a trigger. The Space's name and modules move together with the fingers, and the next or previous Space comes in beside them. On letting go it lands on the neighbor when the position it would reach by keeping its speed is past halfway, so a flick goes on, and a drag let go early or after stopping comes back. A new swipe can take hold at any moment of the settling, and a Space picked another way (a click, a key, another tab) slides in from the side it sits on. With reduced motion it switches without sliding.

Every horizontal arrow combo is taken (tabs, split, back and forward), and bracket keys are hard to type on European keyboards.

## Icons (sidebar and everywhere else)

Icons work like Notion: each item can have its own user-chosen icon (an emoji or an icon library icon) in full color.

When no icon is chosen, the item falls back to its entity type's default icon, rendered in a **neutral, muted** color and never in the Space accent color. The one exception is a Space's own icon, which uses the Space accent color (see above).

## Tabs

A slim tab strip under the titlebar holds concurrent work. It only shows while more than one tab is open. Each tab is one view with its own Back and Forward history, and several tabs can sit in different Spaces. Open tabs, their order, pins and history are remembered across restarts.

Split view puts two groups of tabs side by side, like editor groups in VS Code. Each group has its own tabs, active tab, pins and history; nothing else is shared. There are at most two, and the right one exists only while it has a tab. One group is focused (a tinted border): the sidebar, the palettes, `Cmd+T`, `Cmd+W`, tab switching and Cmd click all act on it, and clicking or tabbing into a group focuses it. Closing or moving the last tab of a group closes the group. Split, each group shows its own tab strip above its page; with one group the strip stays under the titlebar. The divider keeps at least 360px per side, remembers its position and splits evenly on double click. A window too narrow for both shows only the focused group, with a button to switch. The same page open in both groups can only be edited in the focused one; the other follows its saves.

| Action                    | How                                                                                                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New tab (opens Dashboard) | `Cmd+T`, the `+` button                                                                                                                                                                                  |
| Open a link in a new tab  | `Cmd+click` or middle click on anything that navigates                                                                                                                                                   |
| Close                     | `Cmd+W`, the tab's `x`, middle click on the tab                                                                                                                                                          |
| Close other tabs          | `Cmd+Shift+W` (keeps the current and pinned tabs)                                                                                                                                                        |
| Switch                    | `Ctrl+Tab`, `Ctrl+Shift+Tab`, `Cmd+Option+Left` and `Cmd+Option+Right`                                                                                                                                   |
| Pin, reorder              | Right click a tab to pin it, drag to reorder. Pinned tabs show only their icon and stay first                                                                                                            |
| Split right               | `Cmd+Option+Shift+Right` (`Ctrl+Alt+Shift+Right` on Windows and Linux), Split Right in the tab menu, the Split button in the titlebar, the command palettes, or drag a tab to the right edge of the page |
| Split left                | `Cmd+Option+Shift+Left` (`Ctrl+Alt+Shift+Left`), Split Left in the Split button in the titlebar or the command palettes                                                                                  |
| Move to the other group   | Drag a tab onto the other group, or Move to Left or Right Group in the tab menu                                                                                                                          |
| Focus the left or right   | `Cmd+1`, `Cmd+2`, or click into the group                                                                                                                                                                |
| Zoom a group              | `Cmd+Shift+Enter` hides the other group until pressed again, or Zoom Group in the tab menu                                                                                                               |
| Resize the groups         | Drag the divider, or focus it and use the arrow keys, Home and End                                                                                                                                       |

Closing the last tab leaves a fresh Dashboard tab.

## Cross-Space Exceptions

There are exactly seven. Adding another requires a deliberate decision.

1. **Dashboard:** a single, global page of flat sections. Its content is editable, but the page itself cannot be duplicated. Per-Space and user-created dashboards may come later, but are out of scope for now.
2. **Calendar:** a unified calendar layering the external calendar overlay, every Space's Sessions, and every Space's Calendar entries into one view, positioned directly below Dashboard. Sessions and Calendar entries render in their origin Space's accent color and are editable in place; the external overlay stays read only. It does not replace either module's own per-Space calendar.
3. **Pinned:** a section at the top of the sidebar holding individually pinned items of any type from any Space.
4. **Search:** smart, full-text search across the whole app. It counts as a utility rather than a view, so it ignores the Space wall.
5. **Recents:** quick access to the last few entities actually opened, of any type and from any Space. Unlike Pinned, it is automatic rather than curated by hand. It lives in the `Cmd+K` palette only; there is no Recents page.

6. **Tasks:** an overview of every Space's tasks, positioned directly below Calendar. Each row shows its origin Space as a color coded chip. It lists, filters and edits in place; creating a task still happens inside its Space. Both overviews can be saved as Views and take the same view presets as their Space pages.

7. **Assignments:** the same for assignments, positioned directly below Tasks. It also groups by Space, and creating an assignment still happens inside its Space.

Any future cross-Space feature must be added individually and deliberately. It is not a general capability modules can opt into.
