# Changelog

All notable changes to Nookly are listed here.

## 0.39.0 (2026-10-19)

### Added

- **Export Notes and Jots as PDF, Word or OpenDocument.** The new **Export...** option opens one dialog for every file format, Markdown included, with a preview of the pages as they will print. Pick the page size, orientation, margins and text size, and choose whether the title goes on top as a heading. Formulas, diagrams and circuits come out as pictures, and every other block keeps its look.

### Changed

- **Save as Markdown file moved into Export.** Markdown is now one of the formats in the Export dialog. Copy Page as Markdown and Export as Nookly Page stay where they were.

## 0.38.0 (2026-10-17)

### Added

- **Filter with OR.** Click **and** between two filters to switch it to **or**, and an item shows when it fits either one. Chips joined with **or** sit together in a box, and click **or** to switch back. A dotted **Add filter** placeholder after your filters is always there, with its own **and** or **or** in front, so the option is easy to spot. Saved Views remember it too.

### Changed

- **Clear filters has a fixed place.** The button, renamed from Clear all, now always sits in the row with the Filter button, above your filters.

## 0.37.6 (2026-10-17)

### Added

- **Filter assignments by when they were evaluated.** The new Evaluated at filter works like Completed at does for Tasks.

### Changed

- **Tasks' Completed filter is now called Completed at.**
- **Filters are listed alphabetically.** Every Filter menu now lists its filters in alphabetical order.

## 0.37.5 (2026-10-16)

### Fixed

- **Files scroll smoothly with many PDFs.** Large Spaces no longer lag or leave blank gaps while you scroll, and PDF previews appear a few at a time instead of all at once.

## 0.37.4 (2026-10-16)

### Changed

- **Notes and Jots scroll under their header.** The title, search and filters stay in view while the list scrolls, and the list no longer scrolls sideways.

### Fixed

- **Notes and Jots stay fast with thousands of entries.** Long lists open quicker, scroll smoothly and keep up while you type in the search field.

## 0.37.3 (2026-10-16)

### Fixed

- **Quick filters star a filter, not its choices.** Star a filter such as Course in the Filter menu to keep it next to the Filter button, where one click opens its choices.
- **Checkboxes keep their size.** The checkboxes in the Filter menu no longer get squeezed when a name is long.

## 0.37.2 (2026-10-16)

### Fixed

- **Split view is faster.** Zooming a group with the shortcut is quicker and the page stays put instead of reloading, and dragging the divider between two groups is smooth.

## 0.37.1 (2026-10-16)

### Fixed

- **Pages fit better in split view.** Page headers with titles and buttons, such as the Calendar's, no longer get squeezed together when a page is narrow.

## 0.37.0 (2026-10-16)

### Added

- **Quick filters on Notes and Jots.** Star a filter such as Course in the Filter menu to keep it next to the Filter button, where one click opens its choices. Each page and Space keeps its own.
- **Notes on the Course page.** The five most recently edited Notes of a course, with Show more opening the Notes page on that course.

### Changed

- **A fuller Course page.** The page now runs from the notes editor to the stat tiles, Sessions, Assignments, Notes and Exams. Sessions is this week of your calendar with the course's own sessions standing out, and Assignments, Notes and Exams look as they do on their own pages.
- **The next session tile names the session.** It shows the session's name along with its day, time and how soon it starts.

## 0.36.0 (2026-10-16)

### Added

- **Find in a page.** Press `Mod+F` to search the page you are writing in. Selected text starts the search, Enter and Shift+Enter step through the matches and select each one, and you can match case, match whole words or use regular expressions. Open the replace field to replace one match or all of them, or pick Select All Occurrences to type over every match at once.

## 0.35.0 (2026-10-16)

### Added

- **Zoom a group.** Press `Mod+Shift+Enter`, or right click a tab and pick Zoom Group, to hide the other side of a split view and give the focused side the whole page. Press it again to bring both sides back.

## 0.34.18 (2026-10-16)

### Fixed

- **Split view tabs are spaced properly.** Fixed the spacing around the tabs in split view.

## 0.34.17 (2026-10-16)

### Changed

- **Wider pages on wide windows.** Notes and Jots use more of a large window instead of leaving wide empty sides.

## 0.34.16 (2026-10-16)

### Fixed

- **Formulas stay formulas.** A formula could come back as plain text with its dollar signs after a reload when its text ended in a space or a line break, when a digit followed it straight away, or when it held a dollar sign. They now stay drawn, and the edit box tidies the spaces around a formula when you finish.

## 0.34.15 (2026-10-16)

### Fixed

- **LaTeX is marked as part of Editor.** In Settings, the LaTeX page under Editor stays indented and now carries a corner icon that shows it belongs to Editor.

## 0.34.14 (2026-10-16)

### Fixed

- **Decks on the dashboard are no longer squeezed.** When a deck card is narrow, its name, counts and Study button stack instead of covering each other.

## 0.34.13 (2026-10-16)

### Changed

- **Tabs show the ID of their page.** A tab for a task, note or file now starts with its ID, such as TSK-14, so similar names are easy to tell apart.

## 0.34.12 (2026-10-16)

### Added

- **Say what a file is attached to.** On a file or bookmark, Relate to now offers Attached to, so you can link it to a page from the file's side.

## 0.34.11 (2026-10-16)

### Fixed

- **Search ignores accents everywhere.** Quick open, commands, search and every list in a menu find "Übungsblatt" whether you type "Übungs" or "ubungs", and whether the file name came from macOS or not.

## 0.34.10 (2026-10-16)

### Added

- **Upload a file straight from a page.** The attach menu in the details sidebar has an Upload File button at the top that adds the file to Nookly and attaches it in one step.

### Fixed

- **Long label names no longer squash their checkbox** in the label picker.
- **The attach menu finds files with accents in their name.** Typing "Übungs" now finds "Übungsblatt 2.pdf", and "ubungs" finds it too.

## 0.34.7 (2026-10-16)

### Fixed

- **Markdown files with a divider or front matter open again.** A `---` line no longer leaves the viewer empty.
- **Markdown files open dark by default,** like code and text files.
- **Markdown files no longer have extra space on the left.**

## 0.34.6 (2026-10-15)

### Added

- **Ungraded assignments.** A new Evaluation property, Ungraded or Graded, tells homework from graded work, in the create dialog and on the assignment. Only a graded assignment shows the Grade field and takes a share of the course grade, and the Grades report leaves ungraded ones out.
- **Formulas on their own line in deck cards.** Write `$$…$$` for a centred formula that can run over several lines, or use `\(…\)` and `\[…\]`. The card writer shows a preview as you type.

### Changed

- **The slash menu is easier to search.** `/h2`, `/heading2`, `/title` and `/header` find the headings, and typing letters in order such as `/bkmk` finds Web bookmark. Closer matches stay on top.

### Fixed

- **Dollar amounts in deck cards stay text.** "It costs $5 and $10" no longer turns into a formula, and `\$` shows a plain dollar sign.
- **Decks on the dashboard look better when space is tight.**

## 0.34.3 (2026-10-15)

### Fixed

- **Hiding the details sidebar in split view only affects your side.** The shortcut and the button now hide or show the sidebar of the side you are working in, and the other side stays as it was.

## 0.34.2 (2026-10-15)

### Fixed

- **The dashboard summary no longer repeats your next session.** When a session is about to start, it is mentioned once instead of twice.

## 0.34.1 (2026-10-15)

### Changed

- **Long pages render in full again.** Parts of a page scrolled out of view are no longer skipped, which brings back the page's normal scrolling and find behaviour.
- **Split view shortcuts no longer clash with text selection.** Split Right and Split Left are now `Mod+Alt+Shift+Right` and `Mod+Alt+Shift+Left` (Cmd+Option+Shift on Mac, Ctrl+Alt+Shift on Windows and Linux).

## 0.34.0 (2026-10-15)

### Added

- **Split view.** Work in two groups of tabs side by side. Right click a tab and pick Split Right, press `Mod+Alt+Shift+Right` (or `Mod+Alt+Shift+Left` for Split Left), use the new Split button next to Import (Split Left or Split Right), run Split Left or Split Right from the command palettes, or drag a tab to the right edge of the page. Each side keeps its own tabs, pins and history, the divider between them can be dragged (double click it to split evenly again), and `Mod+1` and `Mod+2` move between the sides. Your split comes back after a restart, and a narrow window shows one side at a time.

### Changed

- **Pages fit the space they get.** Lists, grids and the details sidebar now adapt to the width of their side of a split, or of the page when the sidebar is collapsed, instead of the whole window.
- **Long pages stay smooth.** Parts of a page that are scrolled out of view are no longer laid out until you get there.

### Fixed

- **Tabs work better with a screen reader.** Each tab is announced once, without its close button inside it.

## 0.33.31 (2026-10-15)

### Fixed

- **Long section lists scroll.** The section list in the floating progress pill stops growing at a comfortable height and scrolls when a page has many headings.

## 0.33.30 (2026-10-13)

### Added

- **Vim keys in pages (early version).** Vim controls for pages only, not the rest of the app. Turn on Vim keys under Settings, Editor to edit pages in normal, insert and visual mode with motions, operators, text objects and counts. A mode indicator shows where you are, and ? lists the keys.
- **Highlight text.** Type `==text==` or press `Mod+Shift+H` to highlight a selection, or pick Highlight in the Format menu or the command palette. Highlights work with bold, italic and inline math, and bold with italic no longer comes back with stray asterisks.
- **Your own LaTeX commands.** Define macros as a list under Settings, Editor, LaTeX, each with a live preview, and use them in every math block and inline formula. Mistakes show before you save, and copied or saved Markdown carries the commands it uses.
- **Pin table columns.** Pin the first columns of a wide table so row labels stay in view while the rest scrolls sideways.
- **Format code blocks.** The new Format button in a code block tidies its code for JavaScript, TypeScript, JSON, CSS, HTML, Markdown and YAML, and a setting can do it whenever you paste.
- **Open a file on a page.** A file in a note can open on a page you choose, so notes that link the same PDF can each start where they need to.
- **Choose how today is marked.** Settings under Calendar set the current day's colour (Primary or Neutral) and intensity (Low, Default or High) in the week, day and month views.
- **New Tab in the command palette.** Type "new tab" in Cmd+K or Cmd+Shift+P to open a new tab without the mouse.
- **Hide Trash from the sidebar.** The Customize sidebar menu now also hides the Trash row, next to the items it already hid and moved.

### Changed

- **The Dashboard sentence names the next session only.** It no longer counts the other sessions later in the day.
- **Attachments are grouped by type.** Notes, journals, sessions, courses and other attachments each get their own heading in the sidebar, like Relationships.
- **Search lists best matches first.** Typing `/in` in the slash menu shows Inline math first, and results that start with what you typed come before ones that only contain it.

### Fixed

- **Inline code and highlights leave cleanly.** Deleting everything inside one removes it, so the line is plain again, and the arrow keys step out of it at its end and at the start of a line.
- **Bullet points fixed.** An indented item keeps its letter or number, and a numbered list can start anywhere, like `b)`, `c.` or `12.`, and carries on from there.
- **Tab indents bullets.** Tab nests a bullet or numbered item under the one above it and Shift+Tab takes it back out, and nested items are now saved with the page instead of being lost. On the first item, Tab no longer jumps focus out of the editor.
- **PDFs and documents keep their sideways position.** A zoomed PDF or document comes back scrolled to the same spot across as well as down when you switch tabs.
- **Table controls stay in reach.** Scrolling a wide table sideways no longer carries its toolbar out of the editor.
- **Math blocks from the slash menu keep your text.** Inserting a Math block, Equation, Diagram or Circuit below a line that has more text above it no longer pulls that text into the block.
- **Cmd+Left works on lines with inline math.** It goes to the start of the line, and Cmd+Right, Home and End go to its end, instead of jumping to the top of the note.
- **Finished work is never overdue.** A done task or assignment with a past due date now reads "Yesterday" or "3 days ago" in lists and on the Dashboard, and tasks past their date that are done move out of the Overdue group.
- **The page lines up with the sidebar.** The main content now starts and ends at the same height as the navigation panel on the left.

## 0.33.11 (2026-10-13)

### Fixed

- **Search finds names with accents.** Typing `Ü` or `ubung` now finds a file called Übungsblatt in mentions, lists, the Trash and relationship suggestions, however the name was saved.

## 0.33.10 (2026-10-13)

### Fixed

- **The Dashboard calendar no longer overlaps the corner.** Its date header, current time line and scrollbar stay behind the mascot cutout when scrolled.

## 0.33.9 (2026-10-13)

### Fixed

- **Notes keep their scroll position when you switch tabs.** A long note no longer jumps to the bottom while it is still loading.

## 0.33.8 (2026-10-13)

### Fixed

- **Copy ID copies the readable ID.** It gives you the ID you see on the item, like TSK-12.

## 0.33.7 (2026-10-13)

### Fixed

- **PDFs keep their zoom when you switch tabs.** A zoomed PDF comes back at the same zoom and position, and spreadsheets come back on the same sheet.

## 0.33.6 (2026-10-13)

### Changed

- **Smaller cleanup.** Removed a one time What's new reset that already did its job.

## 0.33.5 (2026-10-13)

### Fixed

- **Typing after @ is fast again.** Mentioning with many sessions no longer lags.

## 0.33.4 (2026-10-13)

### Added

- **Open embedded files in Nookly.** Click a file in a page to open it, or use Open in Nookly on its toolbar.

## 0.33.3 (2026-10-13)

### Added

- **Copy ID in the right click menu.** Every item can copy its ID (like TSK-12), right below Copy Link.

## 0.33.2 (2026-10-13)

### Changed

- **The Dashboard calendar is a little shorter.** It keeps a minimum height of 800 pixels.

## 0.33.1 (2026-10-13)

### Changed

- **The Dashboard calendar opens earlier and stays tall.** It scrolls to two hours before now, and keeps a comfortable height even when you have no Jots.

## 0.33.0 (2026-10-13)

### Changed

- **A new Dashboard.** Below the greeting, Assignments, Tasks, Decks, Jots and today's calendar now sit side by side. Assignments and Tasks have tabs and show your four most important items, decks with cards to study today show a play button, and Jots list the oldest first.
- **Due dates on the Dashboard read naturally.** Within 10 days they say "Today", "Tomorrow" or "in 4 days", and further out they show the date.
- **The Dashboard sentence reacts to your day.** It greets you by name, skips sessions that already started, opens with what matters most (a session about to begin, an exam today or tomorrow), mentions cards to study and your oldest Jot, and folds everything that is quiet into one friendly line of links. Set your name in Settings under General.
- **Show more buttons are quieter.** Longer lists end with a faded button that opens the full list.
- **Dashboard links open the right page.** Counts in the sentence and "Show more" open Tasks, Assignments or Jots with the matching filters already applied.
- **Assignments "For today" is for the lecture.** It lists only assignments tied to a session that is today, including ones already submitted or graded, so you can find what you present.
- **Space and ID on the Dashboard.** Assignments, Tasks, Jots and decks show their Space, and rows have a copyable ID.

### Fixed

- **Tasks due today no longer go missing around midnight.** The Dashboard sentence could say nothing was due for a couple of hours after midnight.

## 0.32.6 (2026-10-11)

### Changed

- **Agent files sit in a file list with folders.** In Settings, the Agent tab now shows your files down the left instead of as tabs, and you can organize them in folders.

## 0.32.5 (2026-10-10)

### Fixed

- **What's new shows after updating from an older version.** If Nookly never noted which version you last saw, the update card and What's new dialog now appear instead of staying hidden.

## 0.32.4 (2026-10-10)

### Changed

- **The page has a border like the sidebar.** The main area now has the same outline as the left navigation, and it goes away with the sidebar collapsed.

## 0.32.3 (2026-10-10)

### Fixed

- **The titlebar no longer overflows.** A long page or space name now shortens instead of pushing the Settings button out of the window.

## 0.32.2 (2026-10-10)

### Changed

- **What's new tags are clearer.** "New" shows in green and "Improved" in blue.

## 0.32.1 (2026-10-10)

### Changed

- **What's new covers every update you skipped.** After a jump over several versions the dialog lists each one since the version you were on, newest first, instead of only the latest.

## 0.32.0 (2026-10-10)

### Added

- **Export tasks, decks and assignments.** Save one as a Nookly file from its more actions menu. A task takes its subtasks along, a deck its cards, and an assignment its status, due day and grade. Labels, links and review history stay behind.
- **Import them again.** The Import dialog now takes any Nookly file, shows what is inside (the status and dates of a task, the cards of a deck) and imports it as a new item. An assignment is filed under a course you choose.
- **Command line.** `nookly cli <type> export` and `nookly cli <type> import` work for notes, jots, tasks, decks and assignments.

### Changed

- The command palette entry is now **Import from File**, since it takes more than pages.

## 0.31.10 (2026-10-10)

### Added

- **Import a page.** The new Import button in the title bar (or Cmd+I) brings in a page exported from Nookly. Drop the file in, choose the Space, relate it to things you already have, and see what it contains before you confirm.
- **Share a page.** A Share button in the details sidebar of a page, and Share in its more actions menu, send it as Markdown or as a Nookly page file through the share menu of your system.
- **Nookly page files.** Export a page with everything on it, and bring it back with Import.
- **Agent files.** Settings has a new Agent tab with markdown files for your own coding agent. It starts with an AGENTS.md and a NOOKLY.md that explains how to work with Nookly. Files save when you leave the text.
- **Repeating tasks.** A task can repeat, and finishing it creates the next one.
- **Jot for the session now.** Cmd+Shift+J opens the jot of the session that is running right now, or tells you there is none.
- **Symbols and emoji.** Type a colon in a note and pick a symbol or an emoji, with the common ones ready right away.
- **Mention a page of a file.** Mention a file with @, press the right arrow or type #12 to pick a page, and clicking the mention opens the file on that page.
- **Move table columns.** Drag a column of a table to a new place.
- **Indent with Tab.** Tab and Shift+Tab indent and outdent text in a note.
- **Paste without formatting.** Cmd+Shift+V pastes plain text.
- **Open links with a click.** Cmd or Ctrl and a click opens links, images and files.
- **Scroll position per tab.** Every tab remembers where you were.
- **Hide board columns.** Hide a column on a board, and finished statuses in the open views.
- **Next assignment at a glance.** The Assignments item in the sidebar shows the next one that is due.
- **Open the settings file.** From the command palette or the Settings dialog.
- **Recalculate a formula.** A button on inline formulas recalculates their width.
- **Today in the calendar.** The current weekday is highlighted.
- **What's new.** After an update a card in the sidebar says it worked and shows what changed. Settings has the same button next to the version.

### Changed

- **Relating things is easier.** The Relate to picker now asks one thing at a time: what type, how, and which one. It suggests what belongs with the item, such as the notes of the same course, and shows sessions with their course and time.
- **Sessions are found by date and time.** Search by day or time (Mar 10, Tuesday, 9am) when you relate to a session, mention one, or pick one.
- **The @ menu is grouped by type.** Notes, files, sessions and the rest each have their own heading.
- **Mentions stay up to date.** Renaming a note, a task, a file or anything else updates the mentions of it.
- **Notifications look better.** They have a close button, a Clear all bar when there are several, and their own icon for success, warning, caution and error. Errors stay until you close them, the rest go by themselves.
- **Escape goes back.** In a file it returns to the list instead of leaving full screen.
- **Files from a note stay with it.** A file you add to a note is connected to the note and its course.
- **Wide tables scroll sideways** instead of squeezing their columns.
- **The time field is easier to click.** A click anywhere in it starts at the hour.
- **Blocks added with the CLI open on their preview** for math, equations, diagrams and circuits.

### Fixed

- A PDF that comes back after being unavailable no longer leaves Nookly blank, and can be tried again.
- The menus for @ and / open again after you have closed them.
- Mentions of a file keep their name when the file is renamed.
- The caret no longer ends up inside the hidden code of a block that shows its preview.
- Long folder paths no longer run out of the Settings dialog.

## 0.18.46 (2026-10-09)

### Added

- Add markdown editor and settings areas to the feature request template

### Changed

- Note that multiple areas can be selected in the feature request template
- Show the multiple areas note as the area description in the feature request template
- Destroy editors in the default code language test so CI stops failing on a late timer
- Keep the scroll position and avoid flashing when zooming in a pdf

### Removed

- Remove the per note code language setting from the note sidebar

## 0.18.44 (2026-10-08)

### Added

- Add operation legend for circuit block

### Changed

- Jots created on a session link to the session's course
- Lettered lists keep their letters
- Lettered lists in jots and every markdown editor

## 0.18.40 (2026-10-07)

### Changed

- Linux bundle icon destination needs absolute path
- Small issues batch (#86)

## 0.18.23 (2026-10-06)

### Changed

- Refine into new note button
- Circuit gate labels inside gates, copy button, thinner overlines
- Backfill file viewer theme Light to defaults (#73)
- 67 linux app icon (#72)
- 65 next session excludes started (#71)
- 64 page padding notes jots only (#70)
- 63 assignment due session picker (#69)
- 66 relate task on create (#68)

### Documentation

- Update CHANGELOG.md

## 0.18.15 (2026-10-06)

### Changed

- Upgrade from 0.17.7 with rows of a deleted space
- Circuit block (#62)

## 0.18.6 (2026-10-06)

### Changed

- Grade report upgrade skips spaces that no longer exist
- Filter notes by course, pinned, last edited and created

## 0.18.3 (2026-10-06)

### Changed

- Grade report (#61)

## 0.17.11 (2026-10-05)

### Changed

- File viewer keeps its scroll position across tabs
- Repeat until a date as well as for a duration
- Assignments due before a course's next session
- Calendar blocks only show the lines that fit

## 0.17.7 (2026-10-05)

### Changed

- Math, equation and diagram blocks pasting back as code blocks
- Turn any block into every block it can hold

## 0.17.6 (2026-10-05)

### Changed

- Accept time and room on exams

## 0.17.5 (2026-10-04)

### Added

- Add file preview thumbnails

### Changed

- Image ocr returning no content & reindexing blocking the main thread

## 0.17.3 (2026-10-04)

### Changed

- Improve code quality & add more test coverage (#55)

## 0.17.0 (2026-10-03)

### Changed

- Weekly repeat select in new session dialog, term icons in semester setup
- Space color in view dialog, edit and remove semesters in setup, cmd+arrow history
- Number input with weeks or months interval for session repeat
- Repeat cadence and duration for new sessions
- Repeat control as filter style chip
- Larger repeat chip text
- Repeat chip fills dialog width
- Brighter clickable chip segments, centered content
- Cross-space view presets no longer ask for a space
- Save view dialog no longer asks for a space
- Improved form error states (#53)
- Tabs (#54)

## 0.15.1 (2026-10-03)

### Changed

- Save filters and display as page default from the floating bar

## 0.15.0 (2026-10-03)

### Changed

- Main calendar arrow keys (#45)
- 33 mention search entity keys (#44)
- Paste files in markdown editor (#43)
- Session detail page (#42)
- Cross-space task and assignment overviews (#41)

## 0.12.2 (2026-10-02)

### Changed

- Filter button height and shortcut display

## 0.12.1 (2026-10-02)

### Changed

- Explain —yes flag correctly in agent-instructions
- Task view filters (#36)
- View presets (#37)

## 0.11.29 (2026-10-02)

### Changed

- Show keyboard shortcuts on the sidebar toggle buttons
- Turn typed arrows and comparisons into symbols in the markdown editor
- Draw the double arrows larger in the markdown editor

## 0.11.27 (2026-10-02)

### Changed

- Render only nearby pages in the pdf viewer so large pdfs stay smooth
- Import large files off the main thread and index their text in the background

## 0.11.25 (2026-10-02)

### Changed

- Clearer relationship picker with plain names, typed targets and session dates
- Let the cli edit a course's notes page through the course block commands

## 0.11.23 (2026-10-02)

### Added

- Add nookly cli jot refine, a generic entity action registry

## 0.11.22 (2026-10-02)

### Changed

- Update twinkleplop packages to latest patch
- Support headings up to h6 in the markdown editor

## 0.11.20 (2026-10-02)

### Added

- Add code block improvements

## 0.11.19 (2026-10-02)

### Changed

- Current time line spans all days with time label in gutter

## 0.11.18 (2026-10-02)

### Changed

- Name session jots and notes <Course> - <Session>, <date>

## 0.11.17 (2026-10-01)

### Changed

- Time input not adopting european time format (#32)

## 0.11.16 (2026-10-01)

### Changed

- Linux gpg signing (#29)
- Faster update checks (#28)

### Removed

- Remove space modules (#31)

## 0.11.13 (2026-10-01)

### Changed

- Bump zip from 4.6.1 to 8.6.0 in /apps/desktop/src-tauri (#26)
- Bump the minor-and-patch group in /apps/desktop/src-tauri with 11 updates (#25)
- Switch to tanstack packages (#27)

### Fixed

- Fix all day appointments in calendar

## 0.11.3 (2026-09-29)

### Changed

- Filter, group and order tasks and assignments by every field
- Validate view config written through the CLI
- Keep type inference for assignment ordering

## 0.11.1 (2026-09-29)

### Changed

- Truncate long backup file paths

## 0.11.0 (2026-09-29)

### Changed

- Back up the whole app to a folder (#24)

## 0.10.10 (2026-09-29)

### Added

- Add sorting options for courses

## 0.10.9 (2026-09-29)

### Changed

- Dragging sessions in edit menus

## 0.10.8 (2026-09-29)

### Added

- Add location field for create session dialog

## 0.10.7 (2026-09-29)

### Added

- Add professor field for courses

### Changed

- Enlarge recipe preview banner
- Fit more course cards per row on courses list

## 0.10.4 (2026-09-29)

### Changed

- Cmd+shift+b toggles the right detail sidebar

## 0.10.3 (2026-09-29)

### Changed

- Floating bar hidden behind sticky group headers on files page
- Replaced file image no longer shows old copy in notes

## 0.10.1 (2026-09-28)

### Fixed

- Fix collapsible sidebar

## 0.10.0 (2026-09-28)

### Changed

- Task assignment kanban views (#23)

## 0.9.1 (2026-09-28)

### Fixed

- Fix fullscreen titlebar

## 0.9.0 (2026-09-28)

### Changed

- Recipe tracking (#22)

## 0.8.10 (2026-09-27)

### Changed

- Wrap long label/value text in the Details block instead of scrolling it
- Indent the section navigator to reflect heading levels
- Rewrite CHANGELOG.md by hand for clarity and completeness

## 0.8.8 (2026-09-27)

### Changed

- Calendar improvements (#20)

## 0.8.0 (2026-09-26)

### Changed

- Calendar module (#19)

## 0.7.1 (2026-09-26)

### Changed

- Ocr for files (#18)

## 0.2.0 (2026-09-25)

### Changed

- Make file added field editable
- Filter list by label, expose labels via --fields, reject unknown flags
- Format FileDetailView.tsx

## 0.1.5 (2026-09-25)

### Changed

- Format sidebar.tsx
- Dependency updates (#16)

### Fixed

- Fix module & space dragging

## 0.1.3 (2026-09-25)

### Added

- Add smoke test step for macos to release pipeline

### Changed

- Format lib.rs

### Fixed

- Fix app crashes
- Fix release workflow

## 0.1.2 (2026-09-25)

### Changed

- Move to monorepo
- V0.1.0
- Separate dev data
- Never honor NOOKLY_DATA_DIR in a release build
- Update BookmarkSheet.tsx
- Back up the database right before a pending migration runs
- Update mod.rs
- Monorepo (#11)

### Fixed

- Fix table column misalignment in preference-keys.md

### Documentation

- Update AGENTS.md

## 0.0.0 (2026-09-24)

### Added

- Added shadcn lint
- Add colors positive and caution
- Added eslint-plugin-better-tailwindcss
- New blocks (#9)

### Changed

- Initial Commit
- First draft
- Second draft
- Sidebar
- Dashboard sentence
- Titlebar
- Kbd shortcuts
- Mascot placement
- Mascot cutout
- Mascot
- Sidebar
- Courses page
- Course pages
- Semester page
- Courses list page
- Cli
- Tables
- Table drag & drop
- Update TableRowHandles.tsx
- Code block syntax highlighting
- Reworked docs
- Block handles and plus button
- Page options
- Improved error/success feedback
- Right sidebar resizing
- Moved local storage keys
- Spotlight search
- Cmd+k filtering
- Filters
- Quick actions spotlight
- Bump dirs from 6.0.0 to 7.0.0 in /src-tauri
- Bump thiserror from 1.0.69 to 2.0.20 in /src-tauri (#4)
- Bump tauri in /src-tauri in the minor-and-patch group (#3)
- Improve markdown render performance (#6)
- Bump tauri-apps/tauri-action from 0 to 1 in the actions group (#2)
- Notes (#7)
- Auto updater (#8)
- Tasks (#10)

### Fixed

- Fix shadcn lint errors
- Fix right sidebar
- Fixed version check
- Fix windows & linux builds
- Fix app icon bundling

### Removed

- Deleted entity view

### Documentation

- Update 05-ui-ux-direction.md
- README & License
- Update AGENTS.md

