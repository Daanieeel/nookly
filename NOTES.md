# Random Things to fix/implement

first step: make the apps most back background color not a full black, but a deep charcoal instead. for both mobile and desktop.

only after that continue:

## Mobile

- [ ] at the top of the nav sidebar, the blur behind "Nookly" and the search icon looks nice and works as intended, awesome! however, try to make it a blur gradient so there isnt a hard cut at the bottom of it.
- [ ] give the items in the nav sidebar a little more padding on the left (not on the right though) so they dont perfectly align with the box at the top anymore (intentionally).
- [ ] fix a bug where the space icons at the bottom of the sidebar are misaligned: @.reference-images/sidebar-spacer-switcher-bug.jpeg
- [ ] look at the visuals from linear issue tracker app: .reference-images/linear-examples/**. Copy how they doe the bottom sheet thingies and how they implement pickers in the middle of the screen in a clean way to offer bigger rows and options for easiert tapping without using the generic bottom sheet with a list style we currently have. copy linear's exactly for our components. you are allowed to touch our primitive components for that and build new ones/delete old ones if needed.
- [ ] Quick Jot, Create Task and Create Assignment bottom sheets must all look like @.reference-images/linear-examples/create-new-ticket.jpeg in linear. make sure the description part has full block capabilities like on desktop.
- [ ] redesing the tab switcher component (e.g used on the calendar page). it really doesnt fit the style/vibe of our app. feels out of place and kind of flat.
- [ ] on the calendar page, make sure to keep the date and Week at the top in the header, but try to visually separe them without a comma, but using less opactiy on the "Week XY"
- [ ] on the calendar page, the space where all-day events would be is missing the vertical day borders (bug)
- [ ] make sure to redesign the new calendar entry bottom sheet in the same linear style i mentioned earlier. the current state isnt even acceptable with the old design. labels overflow or are cut off after two letters, there is not enough space and everything is crammed.
- [ ] redesign the filter and display options on pages like tasks, assignments etc. to look like the linear version: @.reference-images/linear-examples/display-options.jpeg (linear doesnt have board view on mobile, so make sure to keep our list<>board display option)
- [ ] the "repeat" option on tasks doesnt feature the full capabilities of this option like on desktop. only allows daily, weekly and monthly instead of the more advanced version that we have on desktop. also, it is entirely missing from "new session"  and "new calendar entry" sheets.
- [ ] the label font size for items in the sidebars (nav and detail sidebar) needs to be just 1 size smaller and the font weight one weight thicker. keep their icon sizes and opacity though, looks nice! however, dont color the active item's icon in the nav sidebar.
- [ ] in the space settings, the "Choose Emoji" button needs a lower text opacity. and the emoji isnt properly aligned and thus cut off. look at @.reference-images/choose-emoji-positioning-bug.png and fix it
- [ ] in the sapce settings, its nice that you can set the color of a label, however this should only be possible once you tap it and a bottom sheet opens. currently if you have a lot of labels, the page is practically infinite in height due to every label rendering the color picker options.
- [ ] deleting a space forever needs the same kind of warning that we have on desktop
- [ ] markdown editor:
  - [ ] when the markdown editor is empty and it shows the "Write something" placeholder and the user taps to open the keyboard, no cursor is displayed, so the user doesnt actually know wheere he is currently typing.
  - [ ] the hide keyboard button needs some kind of chevron down overlayed at the bottom of the keyboard icon to explain the action more clearly
  - [ ] bug: user taps into an empty editor to type, closes keyboard, taps again, nothing happens. seems like once you leave an empty editor, you have to leave the page, open it again and only then can you start typing again
  - [ ] undo/redo buttons dont seem to work at all
  - [ ] indentation buttons should be disabled if they would do nothing
  - [ ] when you tapped a list button (ordere, unordered, todo) and you then tap another kind, it should change the current list type to the other
  - [ ] if you leave the page with the keyboard still open, it closes automatically and fast, good. however the action bar above it for our markdown editor actions, doesnt close as fast and stays visible and floating in the middle of the screen for a brief second more (needs fix)
  - [ ] on tasks, if the date shown is overdue, the calendar icon and the date label turn red, nice. however, they have different colors. make sure they both use our destructive color.
  - [ ] markdown editing in notes and jots is awesome with live sync on. shows the other device's cursor and syncs nicely. however, when using the embedded markdown edtiros in somethin like tasks, assignments, courses etc. the sync is does not work all the time, especially after you have just come online again and the cursor positions are not displayed on other devices at all
  - [ ] everywhere where we have an embedded markdown editor (like on tasks, assignments, courses, semesters etc) the markdonw editor has a lotmof unnecessary margin below it that is not part of the actual editor
- [ ] on task page: if you want to add a sub task and tap there, you can start typing. however, the keyboard then proceeds to hide the input field you are currently typing on (bug)
- [ ] on task page: in the labels badge, the labels dont have a color indicator dot and having multiple selected looks really awkward and ugly (separated by comma). also, it gets very wide once you select a few more than just 2-3. make sure to abbreviate after 2 labels.
- [ ] when navigating using the nav items in the nav sidebar, we want to keep the capability to navigate back/forth using the cmd + arrow key left/right shortcut. however, we do not want to provide navigating back/forth using the swipe gesture at the edge of the screen.
- [ ] semesters list page looks similar to desktop. however, it is almost entirely useless and clunky to use. "Set dates" option is listed in small text below the semester title, but isnt clickable. Clicking the semester to expand it is nice for mobile, however we should offer a button to immediately open the semester so the user doesnt always have to use the three dot menu to open it.
- [ ] "set up semesters" wizard is ugly. make sure it also gets the linear style redesign
- [ ] "set up semesters" button should be a native button left of the "+" button at the top right isntead of a large button on the page.
- [ ] make sure "New Semester" sheet also gets the linear style redesign
- [ ] the maginfying glass (search) button in the nav sidebar needs to become a native button
- [ ] "Create Jot for this session" and "Create Note for This Session" buttons on the detail page of a session need icons, full width and the option that makes most sense needs to get button variant default (so the blue variant). no jot, no note -> create jot; jot, no note -> note; both exist -> both secondary buttons (just like on desktop).
- [ ] exams list page (timeline) has too much padding on the left. also make sure the "--- Today ----" row gets full width.
- [ ] I dont like that "Add module to [space]" is a full new page. Make it a bottom sheet (mind the linear redesign) and make sure to onyl show modules that the space doesnt already have
- [ ] on the bookmarks page, the "Past a URL to save it" input needs to be a floating bar at the bottom just like on desktop (but make it respect the iphone's corner radius with its own corner radius). make sure to also give it a send button and to give the link item an apprpriate size.
- [ ] for the bookmarks page, add a display options and filter options buttons just like on desktop (mind the linear redeisng; however make sure to keep the option to toggle between list and grid view)
- [ ] the moodle module doesnt seem to exist/do something on mobile at all. just shows a list of entities.
- [ ] rework the entire recipe list page and the recipe detail page:
  - [ ] recipe list page doesnt show any color (for the labels)
  - [ ] the detail page is incredibly ugly. no placeholder for a missing banner like on desktop, Choose Banner button is way too prominent, ingredient and step addition is ugly and clunky (input fields are way too narrow because of their save buttons on the right)
  - [ ] rework the spacing in the detail sidebar as well
- [ ] the feather icon on the jots list page is just full black (bug)

## Desktop

- [ ] at the bottom of the nav sidebar, the blur gradient behind the space switcher looks nice! however, it extends too much to the top. look at @.reference-images/desktop/space switcher blur bug.png to see the issue. it partly covers the bottom most item in the sidebar.
- [ ] swap the positions of the "Split" and sync indicator buttons in the titlebar
  
## Probably both

- [ ] Make the progress screen for importing items into an account a full page experience instead of this boring dialog. users cant do anything during the importing process anyway and a dialog suggests that it can be closed. (this should happen after the user chose to move all their local items into an account)
