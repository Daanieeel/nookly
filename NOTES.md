# Random Things to fix/implement

first step: make the apps most back background color not a full black, but a deep charcoal instead. for both mobile and desktop.

only after that continue:

## Mobile

- [ ]  add a full fetched file viewer to the mobile app (pdfs etc)
- [ ] in the nav sidebar, make the text and icons  bigger. and also bigger textr and icons for the popover that comes when the + next to the space icons is pressed.
- [ ] input fields currntly have their labels on the left like this: [label | input]. that is not really nice because they look like placeholders, but when you click them, nothing happens. put the labels in smaller font above the input fields. however, you are allowed to add icons like this: [ (icon) | input]. this way the input part still stays big enough.
- [ ] the sign in and sign up screens are really plain and ugly that way. also, hierarchy really doesnt exist (e.g. "Create an Account Instead" is the same hierarchy as "Forgot Password"; also seems like a clunky way to phrase account creation)
- [ ] time zone in the settings is a text input. why? this should be the same kind of select as on desktop. also, the date format and time format switchers need the same flag icons as on desktop.
- [ ] the theme and file viewer theme switchers in the settings also need appropriate icons like on desktop
- [ ] default code language in the editor settings is a text input as well. why did we also lose the popover here that we have on desktop?
- [ ] in general, the settings also have this [ label | input ] layout for some settings. we msut avoid that, especially because longer settings labels are cut off that way or sometimtes content is squished together awkwardly.
- [ ] why are we not displaying the setting keys above the settings labels like on desktop? add it
- [ ] For the "Day starts at" setting, why didnt you port over the number-input component that we use on desktop? make sure we use it in mobile as well.
- [ ] i dont like the Sidebar settings where you can choose the order of sidebar items. its correct to have a separate settings page for that because doing it inline in the sidebar is awkward on mobile. however, moving it using icons is not sufficient. make sure they can be dragged here. the switches are  nice though.
- [ ] latex macro adding is awkward. no preview, strange looiking inputs. make sure that in the LaTeX settings, we make it feel like on desktop, just cut in a way that fits mobile handling nicely.
- [ ] empty trash button in the trash should stretch across the whole width of the page
- [ ] holding on entities to bring up the bottom sheet with options is nice, however the items in popovers generally are too small for mobile. need larger font and larger icons
- [ ] clicking the status icon on assignments or tasks in their list pages, should not mark them as done. it should bring up the regular bottom sheet to select a status instead.
- [ ] board view for tasks and assignments feels clunky. the column background colors for separation are still there but the individual icons didnt get the same card look as on desktop making it hard to distinguish between items. make the board look like desktop. and make sure that we can drag items like on desktop. we could introduce an ios-like behavior so that you have to press down on an icon longer, then they all begin to wobble (individually with a time offset to look like ios apps wobbling) and then you can drag them. keep the column wiudth though, thats nice!
- [ ] it seems like we have lost grouping and ordering options in the display options bottom sheet. also make sure the list/board boxes get bigger too (as a result of the earlier mentioned size increase for popover items)
- [ ] big issue: the markdown editor.
  - [ ] code blocks get no syntax highlighting, fix that
  - [ ] code blocks dont show the file title and language select in its header (there is in fact no header) and there is no copy button to copy the code like on desktop
  - [ ] the slash-menu shows the items (but only the top 5 results, not scrollable like on desktop) but they dont look like on desktop (there they have grouping, and icon in a box, a description)
  - [ ] the toolbar for markdown actions is probably hidden below the keyboard
  - [ ] as a result of this, leaving the keyboard is challenging (no button for that available)
  - [ ] i think i remember how the toolbar looked roughly and i believe the buttons were to small for mobile touch devices
- [ ] bookmark previews dont work, says "Couldn't reach it" although wifi is connected. this is probably an in-app browser issue.
- [ ] space-switching is still broken sometimes. sometimes clicking the icons does nothing.
- [ ] space settings:
  - [ ] the space settings dont need a "Position" setting anymore as we are not displaying multiple spaces in the sidebar. instead, make sure the icons at the bottom are draggable to change positions
  - [ ] we need the same reordering of items using dragging here as i want for the top part of the sidebar in the sidebar settings page
  - [ ] add module button below the modules must be moved above them and must receive full width.
  - [ ] the icon selector isnt really recognizable as such. remove it entirely and show all our provided icons instead, then display a button below (ghost) reading "Choose Emoji" that opens the current bottom sheet, just with emojis (so the tab switcher at the top must go). make sure to introduce a new component for this though, because the universal "Choose an Icon" popover should stay the way it is for other entities.
- [ ] when selecting a time for an exam, you already correctly edited the poipover to only show AM/PM selection if the timezone is american. however, the chip/badge you have to click to get to the popover still shows AM/PM no matter what.
- [ ] also make the input field for the hour and minute way way bigger, if you think they are big enough, make it even bigger. should feel like a real analogue clock (but with inter font of course), remove the background color from it and give them just two underlines below the hour and the minute. this way it feels more premium and as if the user is typing into the popover itself. Clear time must become a destructive button. done should be primary
- [ ] remove study blocks from the mobile app. they have been removed from the app entirely and are not a feature anymore.
- [ ] in the course detail page, the semester select popover doesnt render semesters smartly showing their metadata like on dekstop (icon, etc). its just a boring list of semesters
- [ ] in the due date selector for assignments, why isnt "specific session" available on mobile. make sure we add that in the same way the desktop app does.
- [ ] also, make the options boxes in the due date selector popover a little bigger.
- [ ] also, the "clear cude date" button is a bit small in height and its "x" icon is just full black (bug)
- [ ] in the sidebar, when clicking on the three dot button to show all spaces that are hidden away due to lack of horizontal space, they dont show the icons or colors. add them.
- [ ] the calendar needs the functionality to create entries when holding somewhere just like in real calendars.
- [ ] add a "move to trash" button at the bottom of a calendar entry detail page (after clicking on an entry)
- [ ] in the sidebar, spaces with emojis as icons dont center the emoji correctly. it is move slightly to the top and thus cut off a little at the top.
- [ ] in the sidebar, the top box containing the blobatar and the date and cycling information items. make the date font size a little bigger and make the cycling information font size a little thicker
- [ ] in the sidebar, show a "Nookly" title (in Inter_tigh and really thick) at the top as a kind of always visible header. then next to it, but space-between, put a native icon button with a magnifying glass. this replaces the "Search" option in the sidebar, so remove it. to make the title and search icon look good, apply a blur gradient behind it so it feels like a proper header
- [ ] in the sidebar, give the icons a little more opacity than currently. probably 85%-90% is better so they dont look overly irrelevant.
- [ ] Introduce "/Users/daniel/Downloads/splash.png" as our first splash screen.
- [ ] on the files page, next to the + button in the top right, introduce another icon button to scan a document and upload it to nookly. for this use package [expo-document-scanner](https://github.com/DineshKachhot/expo-document-scanner) to integrate it nicely with the operating system. make sure that the user can select labels, a title, relationships etc in a bottom sheet after scanning it. however, the document should be uploaded to nookly in the background while this bottom sheet is open. the bottom sheet only applies edits made by the user after the fact. pre-fill the bottom sheet inputs/options with sensible defaults (like filename etc.)

## Desktop

- [ ] The sign in/sign up dialog is a little ugly at the moment (on desktop). As we want to transition towards a free closed beta for the connected platform, we need to get the app towards a state that can actually be sold to real customers. The current dialog is ugly and chaotic and doesnt really invite account-creation. We will be transitioning to OAuth logins using Google, Apple, GitHub, Notion in a month or so (currently only username/email and password login) but prepare the buttons for these providers with their logos (only their logos and a simple "or sign in using") already and disable these buttons with a tooltip explaining how it is coming soon
  
## Probably both

- [ ] Live sync and synced cursor movements work great between devices. However, when one devices types anywhere that moves the current word the second device's cursor is in, we have to make sure to move the second device's cursor as well. The other cursor must move with the word to make it seem like doesnt move at all. And the indicator showing "xyz on iPhone" disappears at the top if the other device is in the first line of a note (bug).
