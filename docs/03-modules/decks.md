# Module: Decks

A standalone module in the sidebar. Its page lays every deck out as a pile, decks with cards to study first.

## Deck (native entity)

Flashcards with inline markdown (bold, italic, code, math) on the front and back, grouped into decks. Cards are scheduled with FSRS, the algorithm Anki uses, and rated Again, Hard, Good or Easy.

Cards are records owned by the deck, not entities. They reach the CLI as the deck's `cards` child collection.

- **Writing:** one index card on the page. Type the front, Tab flips it, type the back, Enter drops it onto the deck and a blank card slides in.
- **Studying:** Space turns the card over, 1 to 4 rate it, Z undoes the last rating. Each rating button shows when the card comes back.

**Relationship:** a Deck can be filed under at most one Exam (`deck-exam`), and then also shows on that Exam's Decks tab. It needs none.
