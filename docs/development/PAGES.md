# Pages

This file is the source of truth for what the mobile app shows on its pages, on tablets and on phones. Each entry describes the desktop app as it is today: what sits on the page, where, and what you can do there. A line starting with Mobile says how the page should collapse. Tablets (768 points and up) follow the desktop closely, phones stack it. Where the app and this file disagree, this file wins.

Written on 2026-10-20 from desktop 0.38.3, from the code and from a running debug build.

## Contents

- [Shell](#shell)
- [Global pages](#global-pages): Dashboard, Calendar, Tasks overview, Assignments overview, Pinned, Trash
- [Space pages](#space-pages): Notes, Jots, Tasks, Courses, Semesters, Sessions, Calendar entries, Exams, Decks, Assignments, Files, Bookmarks, Recipes, Grades
- [Item pages](#item-pages): the shared frame, Note and Jot, Task, Exam, Assignment, Course, Semester, Session, Calendar entry, Deck, File, Recipe, Bookmark
- [Settings](#settings): General, Appearance, Calendar, Editor, LaTeX, Backup, Agent, Account, Shortcuts

## Shell

Every page lives inside the same frame. A 44px titlebar runs along the top: window buttons and the back and forward arrows on the left, then breadcrumbs (a Space, its module, the open item), and on the right the pills Commands, Quick open and Search with their shortcuts, an Import button, the sync status cloud and the settings gear. Under it, a slim tab strip appears only while more than one tab is open; pinned tabs show only an icon, and a tab can be dragged to the right edge to split the page into two side by side groups. The floating sidebar sits on the left with rounded corners and holds, from top: the mascot card (date, week number and one cycling line such as "3 tasks due or overdue", which opens the matching list), a small gear that hides and reorders the rows, then Dashboard, Calendar, Tasks, Assignments, Pinned and Quick Jot. Tasks and Assignments carry a chevron that unfolds their saved views, and Assignments shows the nearest due time as a badge. Below that is the Spaces list with a ghost plus for a new Space. Each Space is a coloured folder and its name; clicking unfolds only the modules it uses (Notes, Tasks, Semesters, Courses, Exams, Grades, Assignments, Decks, Files and so on) with small meta badges such as the next exam date or the deck count, and a ghost plus adds a module. Spaces and modules can be dragged to reorder. The footer holds the CLI install card, the update card, Trash and Collapse sidebar. Collapsed, the page goes edge to edge and the sidebar slides back over it when the pointer rests on the left edge. The main page fills the rest with a 1px border and rounded corners; an item page adds the right details sidebar to it.

Overlays reachable from anywhere: Search (Cmd+K) is a floating spotlight panel with a single input "Search, create, or jump anywhere…", a Recents group when empty and grouped results by type; Quick open (Cmd+P) is the same panel with "Jump to…" over recent and pinned items; Commands (Shift+Cmd+P) is "Run a command…". Quick Jot (Cmd+J) is a small floating card with one multiline field "Jot something down", a quiet Space chip at the bottom, and hints for Enter to save, Shift+Enter for a new line and Shift+Cmd+J for a session jot. Import opens a dialog that takes a Nookly export file into a Space. New Space is a dialog with a name field, an icon picker and a colour choice. What's new opens once after an update as a dialog with a card per highlight (icon, title, one sentence, optional New or Improved tag and shortcut) and small lists for Improved and Fixed. Almost every row, tab, title and card has a right click context menu.

Mobile: on a phone the sidebar becomes the left drawer and the details sidebar the right drawer or a sheet, the titlebar becomes a native header with the title and a search button, and Search, Quick open and Commands collapse into one search sheet. On a tablet keep the sidebar persistent, keep the titlebar actions, and offer tabs and split view as on the desktop.

## Global pages

### Dashboard

The Dashboard is one global page and never scrolls sideways. At the top is the briefing, a large sentence in plain language such as "Good evening! 3 tasks due today and 9 overdue, 3 cards ready to study in Sorting. Nothing waiting on sessions, exams, assignments and jots.", where counts and names are tappable tokens with emoji that open the matching list. The mascot sits in a curved cutout in the top right corner and the sentence wraps around it. Below are two columns, roughly 60 and 40 percent. The left column stacks four tabbed panels. Assignments has the tabs For today, Due today and Next 7 days, each with a count. Tasks has Today, In progress, Upcoming and No date, with rows of key, status circle, title, a Space chip and a due text that turns red when overdue. Decks has Learn today, with deck tiles that show the card stack, name, new, learning and due counts and a blue play button with the number to study. Jots has To be refined, with rows of the key and the first line of the jot ("Empty Jot" in italics when blank) and a Space chip. Each list shows four rows and then "Show N more" which opens the full list, and an empty tab says "Nothing here. Enjoy the calm." The right column is today as a day grid from the cross Space calendar, scrolled to two hours before now, tinted by Space colour, with a today pill in the header that opens the Calendar.

Mobile: phone stacks the briefing, the four panels and then a compact agenda for today. Tablet uses the two columns as on the desktop.

### Calendar

The cross Space calendar shows Sessions, Calendar entries and read only external events layered into one grid, each tinted with its Space colour. The header is a single row: calendar icon and title, a Today button, previous and next arrows, the range ("19. Okt. to 25. Okt.") and the week number, then on the right the view switch Day, Work week, Week and Month, and a New entry button. Day, Work week and Week are time grids with an hour gutter on the left, a day header row with the weekday and a date that is filled blue for today, a tinted column for today, a thin line at the current time and an all day strip under the headers that appears when needed. Month is a six row grid with chips per day. Clicking an empty slot or dragging across hours opens a small create dialog (calendar entries only here), and clicking a block opens a popover to read, edit, move or delete it; blocks can also be dragged and resized with snapping. Keys are T for today, left and right to step, 1 to 4 to switch views and C to create. The chosen view is remembered.

Mobile: phone offers Day, 3 Days and Week as grids plus an Agenda list, with the create button as a floating action. Tablet offers the desktop views.

### Tasks overview

Every Space's tasks in one page. The header holds a checklist icon and "Tasks", then View presets, Filter, Display and the blue New task button; active filters appear as chips under it and a save bar offers "Save as view" when the filters or display changed. By default it is a list grouped by due date: Overdue, Due today, Next 7 days, Later, No due date and Done, each group a collapsible band with an icon, name and count. A row has a status circle, the due date, the time left ("3d overdue" in red, "Today" in amber), the key, the title, a label chip, a Space chip in the Space colour, an effort chip and the created date at the right. A legend strip with the column names sits along the bottom edge of the page. Display switches between list and board, groups by status, label, Space, start, due, created or updated, sub groups, orders and chooses which properties show. Clicking a row opens the task page; creating a task still happens inside a Space.

Mobile: phone shows grouped rows with the key and chips on two lines, filter and display in sheets. Tablet can show the board beside the list.

### Assignments overview

The cross Space overview of assignments, built like the Tasks overview but simpler. The header has the clipboard icon and "Assignments", then View presets, Filter, Display and New assignment. Rows are grouped by deadline: Overdue (red), Today (amber), This Week, Next Week, Later, No Due Date and a collapsed Done band for handed in work, each a collapsible band with a count. Display can also switch to a board by status (Not started, In progress, Submitted, Graded) and regroup by course, grade, status, Space or age. A row has a round checkbox that marks it done, the due date, the time left ("in 5 days"), the key, the title, a Course chip with a graduation cap and a Space chip. The column legend strip runs along the bottom. Filters offer course, status, space, created and updated. Opening a row goes to the assignment page.

Mobile: same grouped list, due date and time left first, with the course chip under the title on a phone.

### Pinned

A quiet list of everything the user pinned, across all Spaces. The title "Pinned" has a count next to it. Below, one section per Space with a coloured glyph, the Space name and a count, separated by a hairline. Inside each Space the items are grouped by module with a small muted heading (icon, label, count): Notes, Tasks, Courses, Exams and so on, and "Other" for the rest. Each group shows compact rows or a small table suited to the type, for example task rows with status and due date, and a click opens the item. An empty page says "Nothing pinned yet. Pin an item from anywhere to keep it one click away."

Mobile: same sections, one column, collapsible per Space.

### Trash

Everything that was deleted, from every Space. The header has the title "Trash" with a count and the sentence that deleted items stay until restored and nothing is purged automatically; on the right a destructive "Empty Trash" button opens a confirmation that says how much is erased and from how many Spaces. Under it, a Filter field "Filter Trash" and a Filter menu. The body is a table with the columns Title (with the type icon), Type, Space and Deleted (relative, full date on hover), and per row a Restore button and a "Delete forever" button which asks first. When nothing is deleted a centred empty state says "Trash is empty".

Mobile: rows with swipe to restore or delete, the empty action in the header menu.

## Space pages

Every Space page is reached from the Space's row in the sidebar. The breadcrumb reads Space, module. Create is also available on the keyboard with C or Cmd+N, and in every empty list the state offers the same action.

### Notes

The Notes page is a table of the Space's pages. The header shows "Notes" with the count and a "New Note" button on the right; under it a search field "Filter notes" and a Filter button (labels, and other fields). The table has the columns ID (NOT-118), Title with a page icon in bold, Preview (the first words, truncated), Labels and Last edited (relative, "3m ago"), and the sortable headers are ID, Title and Last edited. Rows are about 43px tall and a click opens the page; a right click offers pin, trash and export. New Note drops straight into an empty page with the cursor in the title.

Mobile: rows of title, a one line preview and the time on the right; the ID and labels move into the row's second line.

### Jots

Jots are quick captures that wait to be refined into notes. The page title "Jots" has a count and a "New Jot" button that opens Quick Jot. Under it a preset row of buttons with counts: Unrefined, Refined, This week and All, then a filter field and a Filter menu (labels, course, "Refined into a Note"). The table shows ID, Title (the first line when the Jot has no title, "Nothing written yet" in italics when empty), a Preview, "Refined into" with a link to the note, Session when a Jot belongs to a session, and Labels. An empty Space shows the feather icon and "Nothing captured yet" with the shortcut hint.

Mobile: the preset row becomes a segmented scroller, a bottom capture bar replaces Quick Jot, rows are two lines.

### Tasks

The Space's tasks as a board by default. The header is the same bar as the overview: icon and "Tasks", View presets, Filter, Display and the blue New task button, with chips and a save bar underneath. The board scrolls sideways and has one column per status in order (Backlog, Todo, In Progress, Done, Cancelled): a header with the status icon, name and count and a stack of cards. A card has the key in small grey, the status circle and the title, then chips for the due date (red when overdue, amber today) and the effort. Dragging a card to another column changes its status, and each column offers "New Task in <status>" to create one with that status filled in. Switching Display to list gives the grouped rows described under Tasks overview, without the Space chip. New task opens a light overlay with a large title field, pills for Status, Labels, Due date and Related, and a Create task button, and keeps the overlay open for the next one.

Mobile: phone shows a list grouped by status by default with a board that scrolls one column at a time; tablet shows the full board.

### Courses

A gallery of the Space's courses. The header has the title "Courses" and a blue "New course" button. Courses are grouped by semester in collapsible bands, each with a calendar icon, the semester name, a count and an "Active" badge for the current one, and a sort select. Each course is a card about 330px wide: a soft gradient banner with a graduation cap, then the course name and its key (CRS-1), a line for the next session or "No sessions", "Assignments 0/1 · due 5d" with a progress ring and "Exams 0/1 · next 19. Nov.". Dashed placeholder cards fill an empty page. A click opens the course page.

Mobile: single column cards on phone, two columns on tablet.

### Semesters

A list of semesters, one expandable row each. The header has "Semesters" with a "Set up semesters" button (a five step wizard: grading system, region, current term, how many, review) and a blue "New semester". A row has a drag handle, a chevron, a calendar icon, the key (SEM-1), the name in bold, a blue "Current" badge, "1 course" with a graduation cap, then at the right the date range or "Set dates" and a three dot menu (rename, flag as current, delete). The current semester has a blue outline. Expanding a row lists its courses, and a Course can be added or created from there.

Mobile: rows collapse to name, badge and course count, the menu in a swipe or long press.

### Sessions

The Space's timetable, a calendar first page. The header matches the Calendar page: icon and "Sessions", Today, arrows, range and week number, view switch (Day, Work week, Week, Month) and "New session"; a badge "Filtered by Algorithms I" with an x appears when you arrive from a course. The grid is the same time grid with Sessions as coloured blocks that show the title, the course and the time, calendar entries as secondary blocks, external calendar events as read only blocks, and exams as markers on the all day strip. Clicking an empty slot or dragging creates a session through a small dialog with Title, Course (required), Date, time, Location and Repeat; clicking a block opens a popover with the summary, a cancel toggle, edit, delete (with a scope choice for repeating sessions) and "Open Session". Month shows chips.

Mobile: grid views on a phone as described for Calendar, a create sheet instead of the dialog.

### Calendar entries

The Space's own Calendar module, a sibling of Sessions without courses. It uses the same header ("Calendar", New entry) and the same grids; entries are blocks tinted with the Space colour, sessions show as secondary context, and entries can span several days and sit on the all day strip. Creating opens a dialog with the title, date and times, an All day switch, location and repeat.

Mobile: reuse the Calendar page with the Space already filtered.

### Exams

A timeline page, upcoming first. The header has the exam icon and "Exams", a Filter button (course) and "New exam". The body is a vertical line with dates on the left (the date and weekday) and a node per exam; past exams sit above a "Today" marker as small dimmed rows with a "Grade" badge or "Completed", upcoming below. The next exam is a highlighted card with "NEXT UP", the title, a course chip and a big number with "days to go"; later ones are lighter cards with a "Studying" badge when that is the status. Empty state: "No exams yet. Press C to add one."

Mobile: single column of the same cards, the date above each card on a phone.

### Decks

A grid of flash card decks. The header has the cards icon, "Decks" and "New deck". Two sections: "Ready to study" with a count and "All caught up". A deck tile shows a small stack of cards with the card count, the name in bold, and the three figures "3 new", "0 learning", "0 due" with the new figure in blue, an exam chip when linked, and a blue play button with the number to study at the top right. "New deck" adds an inline tile where the name is typed. Clicking a tile opens the deck, the play button opens it straight in study.

Mobile: two tile columns on a phone, three or four on a tablet.

### Assignments

The Space's assignments as a list, a sibling of the overview without the Space chip. The header is the same bar with View presets, Filter, Display and New assignment. Groups run by deadline (Overdue, Today, This Week, Next Week, Later, No Due Date, and a collapsed Done), each with a count, and Display offers the board and the other groupings. Rows: checkbox, due date, time left, key, title and a course chip. The legend strip sits along the bottom. Saved views for this page are not on the phone.

Mobile: as the overview.

### Files

A grid of the Space's files and links. The header has the file icon and "Files", a Filter menu (kind, labels) and Display (layout grid or list, grouping, ordering); a small "Reindex" button appears when older files need indexing. The grid is made of tiles about 180px wide: a soft square with a large coloured icon by kind or a thumbnail for images and PDFs, a type badge such as TXT or PDF in the lower left, the file name under it in two lines and a muted "Document · 20. Okt." line. A floating drop bar sits at the bottom centre: a link icon, the field "Paste a link or file path", an upload arrow, "or" and a "Choose Files" button; files can also be dropped anywhere on the page. Links to Google Drive, Dropbox and iCloud show their own icons.

Mobile: two columns grid, an add button that opens the share sheet for files and a paste option.

### Bookmarks

A grid of rich link cards. The header has the bookmark icon, "Bookmarks", Filter (labels, site) and Display (grid or list, grouping, ordering, preview images, descriptions). A card has a 1.91 to 1 preview image on top (a screenshot or the site's preview image, an icon as fallback), a favicon and the title in bold, a two line description, the host and the date added, and a small button in the top right corner that opens the details sheet. A paste bar sits at the bottom with "Paste a URL to save it" and a card with a spinner appears while the page is read. The list layout shows favicon, title, host, labels and date on one row. Clicking a card opens the link in the browser, the button opens the details sheet described under Bookmark.

Mobile: single column cards on phone, share sheet capture, tablet grid with two or three columns.

### Recipes

A gallery of recipes. The title "Recipes" sits in the header with a New recipe button. Each card is about 250px wide with a banner image on top (a food icon when none), the name, the key, a pill for the kind (Breakfast, Lunch, Dinner, Snack, Dessert or Other), the duration with a clock ("35 min") and small tag chips. Dashed ghost cards and the text "No recipes yet. Add a recipe to start tracking its ingredients and steps." fill an empty page. Creating asks for just a name.

Mobile: single column cards on phone.

### Grades

A read mostly report that rolls grades up. The page title "Grades" sits on top, then two big figures side by side: "Cumulative average" and "Current semester" with the semester name and the number of graded courses; with two or more semesters a small line chart of the semester averages sits beside them. Under that, one collapsible band per semester with its name, a "Current" badge, "0 of 1 graded" and its average on the right. Inside, one card per course: the name, "0 of 2 graded", its average, and a segmented progress bar where each segment is an item sized by weight. Below it a table of assignments and exams with the columns Date, Weight (an editable percentage, "auto" when even), and Grade (an editable cell). Without grades the figures read "No grade".

Mobile: figures at the top, semester sections, course cards, items as rows with an editable grade on the right.

## Item pages

### The shared frame

Every item page opens in the same frame. The header row has the item icon (click to change), the key with a copy button (TSK-1), the editable title in the heading font that grows to the width, optional extras (a Current badge, the task stepper), a conflict badge when sync has two versions, and the item actions on small widths. Below it the body scrolls on its own. A banner above the header says when the item is in Trash (with Restore) or is shared read only. On wide windows the right details sidebar sits at about a quarter of the width: at the top a collapse button and the actions (share, export, pin, more), then type specific properties, then in a fixed order Labels, Attachments, Mentioned, Mentioned in and Relationships ("Relate to…"). It can be dragged wider, resized with the arrow keys, collapsed to a slim rail and the choice is remembered. While the sidebar is hidden, the main properties show as small pills above the content.

Mobile: phone puts only the title, description or editor, and the item's own lists in the main part, and everything else in a right drawer opened from a details button; tablet shows the inspector beside the page.

### Note and Jot

A full width document canvas with the text centred at about 48rem. The title is in the header, and Enter in it jumps into the body. The editor is a block editor: a floating toolbar on selection, drag handles on the left of every block, a slash menu with Text, Highlight, Headings 1 to 6, Toggle heading, Toggle, Quote, Callout, Divider, Code block, Bulleted, Numbered and Check lists, Steps, Tree, Table, Details, Stats, Progress, Timeline, Equation, Math block, Inline math, Diagram, Circuit, Image, Video, Audio, File, Web bookmark, Embed and Linked item, and @ mentions of other items. A page with at least two headings gets a floating section navigator at the bottom. The right sidebar has no type properties; a Jot adds a "Refine into new Note" button above everything. Several people can edit a shared page live with carets.

Mobile: the same editor full screen with a keyboard toolbar; blocks the phone cannot edit show as cards.

### Task and sub task

The page is the description editor with the sub task block under it. In the header a small stepper "3 / 12" with up and down arrows moves to the neighbouring task in the order of the list (J and K do the same). The properties card at the top of the sidebar lists Status (with a progress icon), Labels, Start date, Due date (coloured by urgency), Effort, Repeat, Progress for tasks with sub tasks, Completed, Created and Updated. The Sub-tasks section under the description has a header with the rolled up progress and a plus, one row per sub task (checkbox, title, due), an inline add row "Sub-task title, Enter to add, Esc to stop" and multi select with bulk actions. A sub task page is the same without its own sub tasks and steps through its siblings.

Mobile: description and sub tasks in the main part, the property card in the right drawer.

### Exam page

A description editor with two things around it. The properties card in the sidebar has Status (Upcoming, Studying, Done), Exam date, Time, Room, Weight, Grade, Course, Created and Updated. Under the description is a tabbed related section: Decks (decks written for this exam with "3 to study of 12", and an inline add row "Deck name, Enter to add, Esc to stop"), Study blocks (planned study sessions on dates, with an add row that takes a date) and the generic related tabs. While the sidebar is hidden, status and date show as pills above the editor.

Mobile: description, tabs, and the property card in the drawer.

### Assignment page

The same shape as the Exam page, shorter. The description editor sits in the middle with the related items section (tasks and notes) under it. The sidebar card has Status, Due date, Weight, Grade, Course, Created and Updated; with the sidebar hidden, a status pill and a due date pill (or "Set due date") show above the editor. Status runs through Not started, In progress, Submitted and Graded.

Mobile: as the Exam page.

### Course page

A hub page. At the top is the course description as a compact editor ("Type / for commands, or just start writing…"), then a row of four tiles in a bento row: Next Session, Next Exam, Open Assignments ("1 open / 1 total, due 5d") and Course Grade, with a fifth Study Progress tile when decks exist. Under it three sections with a bold heading and a "View all" link: Sessions, Exams (title, date and a status pill) and Assignments (title, date and a status pill), each with an empty state. The sidebar starts with Professor, then Semester with an edit pencil, then the shared sections.

Mobile: tiles in a two column grid on a phone, sections as lists.

### Semester page

A description editor for semester notes on top, then a stats strip of three counts ("sessions this week", "upcoming exams" in the next 7 days, "open assignments") rolled up across its courses. Below is the grid of its courses as cards, and an "Add course" block where an unassigned course can be linked or a new one created with a name and "Create & link". The title carries a blue "Current" badge when it is the current semester. The sidebar is the shared sections, with Courses in the relationships.

Mobile: stats as three compact tiles, course cards in a list.

### Session page

A single occurrence of a session. The body holds notes for the session as a small markdown editor ("Notes for this session…"), a small calendar cutout showing where it sits in the week, and two preview cards: the Jot and the Note written for this occurrence, or buttons to create them. The sidebar is one bordered card with the session summary (course, date, time, location, repeat, cancelled), an edit button that turns it into a form with a scope choice (only this, this and after, upcoming) and a delete button, followed by the same Jot and Note links.

Mobile: notes first, summary in the drawer.

### Calendar entry page

A description editor with a properties card in the sidebar: Date, All day, Time (start and end), Location, Repeats and Created. Repeating entries show the rule, and edits on a series ask for a scope.

Mobile: as the Session page.

### Deck page

A writing desk and a study session in one page, in three modes. The overview has a hero row: a card stack with the count, the figures New, Learning and Due in large numbers (blue, pink and green, grey at zero), a footnote ("5 rated today" or when the next card is due), a "Write cards N" button and a blue "Study 3" button. Under it a heading "Cards 3" and a grid of mini index cards (front side up, with the learning state), and "No cards yet" with "Write the first card" when empty; clicking a card edits it. Write cards shows one large index card, 5 by 3, that you type the front on, flip, type the back on, and then drops onto the pile while a blank card slides in; drafts are kept per deck. Study shows a progress bar and the counts of cards left at the top, one big card that flips with Space, and after the flip four rating buttons Again, Hard, Good and Easy with the next interval under each and keys 1 to 4, an undo with Z, and an "All caught up" screen with a confetti icon at the end. The sidebar properties are Exam (picker), Cards, Rated today, Next due and Created.

Mobile: the same three modes full screen, swipe to flip or rate is welcome.

### File page

The file fills the body, its properties sit in the sidebar. A viewer is chosen by kind: images are fitted and centred, PDFs open in a paged viewer with zoom and search, video and audio use native players, Markdown is drawn like a note, text and code use a highlighted view in the viewer theme, Office files are converted and shown, and anything else shows a placeholder with its icon and actions. Links without a stored copy show the link and an open button, and a file that is still downloading from the account shows a skeleton. The sidebar has Kind, File name, Source or Location, Added and the shared sections, plus actions to open with the default app and to reveal in Finder.

Mobile: viewer full width, properties in the drawer, share and open in actions in the header menu.

### Recipe page

A reading page with a banner. At the top an image banner bleeds across the full width (click to choose an image) and the title overlaps its lower fade. Under it at reading width: a properties row of three fields, Duration (stepper with min or h), Category and Tags (a multi select with search), then a hairline, the Ingredients list (editable rows with drag handles, amount and name, a remove button and an add row "Add an ingredient"), another hairline and the Steps list (numbered, each with optional time and drag handles, add row "Add a step"). When no duration is set it is the sum of the steps.

Mobile: single column, tap to edit rows, drag handles stay.

### Bookmark

A bookmark has no page of its own; it opens in a sheet from the right. At the top the preview image at 1.91 to 1, then the favicon and the editable title, a short description, a row with "Open in Browser", a refresh button for the preview, a compare button when both a screenshot and the site image exist, and the item actions. Below are the properties URL (editable, with a copy button), Labels, Key, Added and Preview, followed by the shared sections.

Mobile: a bottom sheet over the Bookmarks page with the same content.

## Settings

Settings is a large dialog opened by the gear in the titlebar or Cmd+,. A search field "Search settings" spans the top with a close button, and the left column lists General, Appearance, Calendar, Editor (with LaTeX indented under it), Backup, Agent, Account and Shortcuts, with "Open settings file" pinned at the bottom. The right side shows one category at a time as a title, grouped sections with a small heading, and rows with a bold label, a muted sentence of help and the control on the right. Searching jumps across categories to matching rows. Every row has a stable key that the settings file and the CLI use. Mobile: phone shows a list of categories that pushes a screen per category, tablet keeps the two column dialog.

### General

Sections Profile, Date and time, Tasks and About. Rows: Your name (what the Dashboard greeting calls you), Time zone, Date format and Time format (each can follow the time zone), Effort scale (T-shirt sizes or points), and under About the version, "See what's new" and "Check for updates" with an update card when one is ready.

### Appearance

Two rows: Theme as a three way switch Light, Dark and System, and File viewer theme as Light, Dark or "Use Defaults" (code dark and documents light).

### Calendar

Sections Defaults, Week and day, Current day and Connections. Rows: Session length and Calendar entry length (minutes), First day of the week (Automatic or a day), Day starts at (hour the grids scroll to), Snap to (how finely dragging snaps, for example 15 minutes), Current day colour (Primary or Neutral), Current day intensity (Low, Default, High), and External calendars with a Manage button that opens a dialog to connect read only calendars.

### Editor

Sections Code and Editing. Rows: Default code language, Format code when pasted, Vim keys in pages and Turn arrows into symbols.

### LaTeX

One list of the user's macros for every formula in every Space, with the switch List or Raw. A macro row shows the command (\abs), the number of arguments, the definition and a live preview, and an "Add macro" button adds one.

### Backup

Rows: Backup folder with a Choose button, Back up every day (keeps the newest 10), Back up now (one file with every Space, note, file, deck and setting, and the date of the last one) and Restore from a backup, from the chosen folder or from a file, which confirms before replacing anything.

### Agent

A folder of instruction files for the user's own coding agent: the folder path with Copy and Reveal buttons, a toolbar with New File and New Folder, a tree of Markdown files (AGENTS.md, NOOKLY.md) and an editor for the selected one. Not on the phone.

### Account

Sections Server, Account, Devices, Shared with me and Conflicts. Server is the sync server address. Signed out, Account explains that sync is optional and offers Sign In and Create Account; those open a dialog titled "Sign in to Nookly" with a segmented switch, fields Username or email and Password (Sign In) or Username, Email and Password (Create Account), a Forgot password link that asks for an email, and a "Change Server" link. The first sign in on a device that holds data opens "Bringing this device into your account": a backup step, "Sending your items" and "Sending your files" with progress bars, a check with the server and a summary of how many items and files arrived. Signed in, the account shows the user with Sync Now and Sign Out, a Change Password form, a "Send Again" button while the email is unverified and a Delete account action, then the list of signed in devices with a sign out per device, the pages shared with you and the list of conflicts. Resolving a conflict opens the merge editor: the two versions side by side with the badges "This device" and the other device's name, and the actions Keep This One, Keep the Other, Keep Both and Edit Combined Version, which opens a text area labelled "Combined version" with Save Combined. A conflict never blocks the item; a badge in the item's header invites resolving it.

### Shortcuts

A list grouped as Navigation, Tabs, Create, Calendar, Tasks and Study, one row per shortcut with its stable name in small grey, the title, a description and the key cap on the right which is clicked to record a new key combination; taking a key that is in use asks first, and "Reset all shortcuts" sits at the top right. Below the groups, a read only block of fixed shortcuts (copy, paste, undo, close with Esc, rate a card with 1 to 4 and so on). Hardware keyboard users on a tablet should find the same list here.
