# Random Things to fix/implement


## Mobile

- [ ] when typing in the search bar input, am x button morphs out of the input to its right, awesome. however the animation is really buggy when the x disappears again. also, make the placeholder in the search bar much shorter. its a search bar, should be self-explanatory and doesnt need such a long placeholder
- [ ] on the cross-space Tasks page, why cant i tap on the "is any of" (or similar) part of a filter? works on other pages when i add filters. this only seems to happen with pre-selected "Due date" and "Created" filters (maybe coming from desktop resulting form our sync? i dont know).
- [ ] make sure empty states look a bit nicer. e.g. the empty state for the Assignments page is "Nothing matches these filters." as a text. offer a simple clear filters button below a nicer empty state.
- [ ] also, filters on the assignments page dont appear as these badges with the "is any of" (or similar) parts like on tasks. they re just hidden away in the filter menu. even the bottom sheets for filter and display options opening and closing is slow.
- [ ] switiching between list and board view for tasks is a bit laggy and takes a long time (at least a second) to switch
- [ ] the save view functionality should not be inside the Display options bottom sheet. instead, if the user actually makes a change to the filter or display options in the current view (or base page), a floating bar at the bottom should appear offering the same three options as on desktop: discard, save as view or just save. make it a bottom floating bar like on bookmarks and files page. (this is for all pages with filters/display options; saving views does not exist on all pages with filters/display options, this is why the save as view option is only visible on pages that support views: display discard and save only on pages that do not)
- [ ] the bottom floating bars on the bookmarks and files page correctly mimic the phone's curvature now, nice! however, this corner radius should also be done in the top left and right corners for a fully rounded pill-like bar. make sure this change is also ported to the new save view floating bar mentioned before
- [ ] when a long label is selected for a file, the detail sidebar in the file viewer abbreviates the label "Labels" for the select trigger. make sure that never happens, only label names should be abbreviated
- [ ] on the bookmarks list page, increase the size of the "(i)" button to make it easier to be tapped. and transform it into a secondary button for easier recognition
- [ ] in the relationship picker, make sure that the list below the search bar and "kind of link" selector only shows items that are valid for the currently selected kind of link
- [ ] also, the search bar's placeholder in the relationship picker isnt properly vertically centered. the icon is though. this is an issue we see often. fix it globally.
- [ ] when adding a semester, you can select between "Winter" and "Summer" in the second select option badge. make sure that the opened select items get an icon each like on desktop. this icon should then propagate into the trigger as well. apply this rule of using more icons for select options to all kinds of selects, but only where it makes sense (giving the year select icons obviously doesnt work).
- [ ] the year select on semesters should be a select. instead, make it a number input. copy the exact style of the time input for exams or calendar entries/sessions and just use one input for one number.
- [ ] also rename the placeholder "Typical dates for" in the last option on creating a semester to "Timespan"
- [ ] labels in the label select dialog (typically triggered from all kinds of detail sidebars) get too much height. this way the list becomes really long to scroll. remove some of the spacing between them (probably minus 25% or so)
- [ ] on the jots list page, make sure the top things like "jots", filter and display options and the tabs are always visible and only the list below should be scrollable. that should be the case for all entity list pages
- [ ] "Where do you study?" doesnt have germany in semester setup wizard. be sure to add it.
- [ ] "Choose an icon" bottom sheet needs categories at the top for quick navigation to them
- [ ] choosing a photo on recipes opens the file picker instaed of asking first if you want to choose from library, take a photo or choose a file. fix this
- [ ] on the calendar, remove the tabs at the top for switching views. instead, move this into a native icon button in the top right left of the plus icon. this should open a select dialog where you can select the 4 options. this way we save vertical space. 
- [ ] also, dont show the date/timespan part in the header "Xy t XY, week xy". just show the "Week XY" part in full opacity. (except for agenda view)
- [ ] also make the date numbers in the columns bigger

## Desktop

- [ ] Some pages seem to be cut off on the right. i have put a few screenshots at @.reference-images/desktop/right-side-cut-off-bug-<xy>.png to show some of these pages. their content is just cut off for no reason
- [ ] check CLI coverage for all features. the cli must be able to access all features and settings (except for highly sensitive ones like login; there it should have access but only redacted). an agent must be able to customize and use nookly entirely like a human would through the GUI.

## Both 

- [ ] the new system for using labels in the files page is a nice step towards a usable system. currently you are listing all labels above the actual files: see @.reference-images/desktop/files-label-list.png. however thats not really useful once you have a lot of labels. isntead we should have some kind of view builder dialog where you can name such a view and attribute labels to it. this should be accessible on mobile as well. these views should also allow to capture filters and display options. also make sure the cli has access to that as well so that an agent could build views for you.