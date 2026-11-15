# Random Things to fix/implement


## Mobile

- [ ] at the top of the nav sidebar, the blur behind "Nookly" and the search icon looks nice and works as intended, awesome! however, it extends too far to the bottom. it should not touch the blobatar box at the top of the siebdar if not scrolled.
- [ ] i really hate the current look of our regular input field. please redesign it. its just flat and ugly. now way to describe it really. just think of something that fits our style more accurately.
- [ ] the semesters on the semesters list page still look crammed. remove the set dates option and move it into the three dot menu. also, why did we use green as the accent color for the logo and "Current" badge? should be our regular blue
- [ ] look at how decks currently work. they are buggy as hell. fix them entirely.
- [ ] files list page must support thumbnails on files that support it on desktop
- [ ] moodle module:
  - [ ] sign out and "open in moodle" buttons should be icon buttons in the page header
  - [ ] when moodle files are open, we are showing "import to nookly" and "open in moodle" at the bottom. because open moodle wil be moved into the page ehader anyway, make sure to make the import to nookly button full width
  - [ ] the import to nookly bottom sheet must look more like our other bottom sheets. these select components look way too much like apple native ios fields (boring)
- [ ] the floating bar on the bookmarks page is too low. move it up a little
- [ ] the filter options bottom sheet on the bookmarks page is just empty
- [ ] the round search bars (e.g. in the releationship picker dialog) just double their height once you start typing (bug)
- [ ] and below the search bar in the relationship picker dialog, the "kind of link" select trigger is not rounded. looks ugly this way
- [ ] navigation or actions that change the view are pretty slow most of the time (e.g. changing filters or display options; or when navigating using the sidebar nav)
- [ ] the "filter notes" search bar on the notes list page didnt get our regular rounded off search bar design.
- [ ] the drag left to right gesture to open the nav sidebar is a big buggy and not really accessible. make sure that at least 90% of the screen is dedicated towards this gesture to open the sidebar. only the leftmost 10% should be used for the back navigation. and make sure that this gesture exists on every page.
- [ ] the drag left and right on tasks for quick actions like it is common in ios is just ugly and doesnt feel like the real deal. also, because item lists on the pages apply the padding to the edges on the list container itself, it doesnt feel like you are pulling options from outside of the screen. make sure the padding is applied on each item individually (inside it) so the hovering color really goes from left to right edge (for tasks, notes etc)
- [ ] make sure the global search gets the same filter options as the desktop cmd+k search
- [ ] pressing the plus in the bottom left of the sidebar nav should open a dialog instead of a bottom sheet. 
- [ ] same for the three dots for showing the hidden away spaces (for this dialog even display a serach bar for the case that a user has a lot of spaces)
- [ ] you currently already can move spaces in the sidebar using drag, but that only works for the three spaces displayed all the time. if i want to pull in a space from the three dot menu, it doesnt work. find a clean way to introduce that feature.
- [ ] increase the three dot button on the space that opens "Add Module" and "Space Settings" bottom sheet
- [ ] and transform that bottom sheet into a dialog
- [ ] for dialogs in general, make sure the padding below the x button is the same amount as on its right and top.

## Desktop

- [ ] 


## Both 

- [ ] in general think of way way more filter options for all list pages. currently filtering is really reserrved and only available for very few properties
- [ ] when searching in cmd+k or the global search on mobile, make sure typing an entity id shows result. e.g. typing "TSK-" or just "TSK" should first show all results that actually contain "TSK" or fuzzy matches and then should just show the list of tasks
- [ ] files are organized in a flat hierarchy using labels instead of a tree-like folder structure. this was chosen to eliminate typical disadvantages of a folder system (Exclusive Categorization (One-Place Limit), Decision Fatigue in Deep Hierarchies, Rigid Retrieval Paths, Loss of Context on Move). however, the current setup is the same kind of useless. unless you know the exact labels of a file or its name, you cant really manage your files nicely. find a sohpisticated and extensive way so that users can easily and effortlessly access/view/find/look at their files they have already labelled nicely. make sure this way of accessing the files is not ephemeral. also find a neat and subtle way to nudge the user towards labelling files that havent already been labelled. make sure that we support both these features on desktop and mobile. and like everything in this app, it must sync.