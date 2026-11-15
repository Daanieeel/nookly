# Random Things to fix/implement


## Mobile

- [ ] now that we have move to squircles instead of circles, the corner radii of the x button in a dialog and the dialog itself dont match anymore. make sure you use the correct math ragarding two corner radii and the padding between them.
- [ ] "Drag a Space above the line to show in the sidebar." notice can be removed. it is self-explanatory.
- [ ] if you have a lot of filters selected, it really overcrowds the page. pleaes display the filter chips/badges exactly like on desktop with the different parts like "any of", "is not" etc. for this, you are allowed to make each of these badges full width for enough space, so you can line them below each other. with the new design, the overcrowding is acceptable. for reference, look at @.reference-images/mobile/filter-overcrowding.png to see how ugly it is
- [ ] the search bar in global search is too small. give it more height to feel more spacious. i dont know if this input is used somewhere else as well. if so, make sure the same change is applied there
- [ ] also, the icon and placeholder in the input arent correctly vertically centered to each other. the placeholder is too low.
- [ ] and: dont apply lower opacity to placeholders and their icons. instead use some shade of muted color. this prevents lower svg layers shining thorugh on the icon (is the case for the magnifying glass handle for example).
- [ ] semesters on the semesters list page still look crammmed. move the "current" badge to the bottom center of the box and overlay it on top of the border. remove the chevron and the "open" button and make the semester open on tap. do not inlcude the expand/collapse funtionality.
- [ ] inside a semester, the "add course" button needs full width
- [ ] when clicking the + icon on the semesters page to add a semester, the bottom sheet opens over the entire screen although there is no embedded markdown editr/nothing to type. make sure this bottom sheet receives only the height it needs.
- [ ] on the files page, "Paste a  link or [Choose Files]" must become a floating bar like on the bookmark page. also, remove the "Choose Files" button part because we already have the + icon in the top right. Make sure thee + icon in the top right supports adding multiple files (if it doesnt already)
- [ ] The "Site" filter dialog on the bookmarks page needs a search bar and the items in it need to display their favicons. and also for the items there: only highlight the important part of the url. e.g: for "https://www.google.com" make "https://www." a lower opacity than "google.com"
- [ ] the details page after clicking on a bookmark looks ugly. make it prettier and more useful. also, the "refresh details" button wraps into the next line if it shows a success state (layout shift; needs fixing)
- [ ] the bookmark previews still dont work
- [ ] every entity on their list page with a list view needs the swipe left or right gestures for quick actions. introdcue them to all other entities with such a list display other thatn just for  tasks. however, make sure the options are designed for every entity individually (e.g. a "Done" action wouldnt make sense for notes). and rework the look of them. they dont really feel native currently. maybe there is a public package to make it easier/look more native. also, the option "Done" on tasks isnt so useful. find another one. important rule: swipe from right to left is always the trash option (that one is already correct for tasks) (this is a rule for all entity types, however you are allowed to have two actions in that right to left gesture, the trash one just has to be the rightmost one so when you drag really far, it is the active one)
- [ ] the "New" dialog after clicking the + in the bottom left of the nav sidebar needs correct padding. the two items dont align with the x button and the "New" title. this seems to be a problem with a lot of other dialogs.

## Desktop

- [ ] 


## Both 

- [ ] 