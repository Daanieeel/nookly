# Module: Decks

A standalone module in the sidebar. Its page lays every deck out as a pile, decks with cards to study first.

## Deck (native entity)

Flashcards grouped into decks. The front and back of a card are small block editors, the one notes use, so a face can hold text, formulas, pictures and every other block. Cards are scheduled with FSRS, the algorithm Anki uses, and rated Again, Hard, Good or Easy.

Cards are records owned by the deck, not entities. They reach the CLI as the deck's `cards` child collection.

- **Writing:** one index card on the page. Write the front, Tab flips it, write the back, Cmd+Enter drops it onto the deck and a blank card slides in. Enter starts a new line.
- **Studying:** Space turns the card over, 1 to 4 rate it, Z undoes the last rating. Each rating button shows when the card comes back. A click on a picture opens it larger.

**Blocks:** a face is stored as a list of blocks next to the old `front` and `back` text, which also holds the markdown of the blocks. A card without blocks shows its text and gets blocks the first time it is edited. An image is a regular File used by the `/image` block, as in a note. The deck holds no relationship to its Files, and a deleted File shows the usual missing image state. The `cards` child collection takes `frontBlocks` and `backBlocks`; setting `front` or `back` as text replaces the blocks of that side.

**Relationship:** a Deck can be filed under at most one Exam (`deck-exam`), and then also shows on that Exam's Decks tab. It needs none.

## Export and Import

A Deck exports as a `nookly-deck` file (version 2): title and its cards, as text or as blocks. The pictures of the cards are embedded as base64, once per File. A picture whose File is missing, unreadable or only a path on this computer becomes a paragraph with its name. Scheduling and review history stay behind, so imported cards start as new. Import creates a new Deck, and the pictures as new Files in the chosen Space, whole or not at all. Version 1 files still import. A deck file can be up to 100 MB, other files 20 MB.
