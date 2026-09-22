# How To: Confirmation Dialogs

## General Principle

Every confirmation dialog should let the user answer, at a glance:
**what is affected, what happens to it, and can it be undone.**

If any of those three isn't obvious from the dialog text alone, the dialog
has failed — no matter how the buttons are labeled or colored.

A few rules apply across every category below:

- Name the specific thing affected. Never rely on the user remembering
  what they clicked.
- Use a specific action verb on the button ("Delete," "Send," "Overwrite"),
  never "OK," "Yes," or "Confirm."
- Separate the risky action from the safe one visually — color, spacing,
  or position — so a rushed click doesn't default to harm.
- Never ask a generic yes/no question the user can dismiss without
  reading, like "Are you sure?"
- State consequences in plain language, not system terms. "This will
  email 400 people" beats "Submit form." States consequences must almost always come in
  stat boxes or exact mentions instead of paragraphs.
- When mentioning a resource/entity, use code blocks or boxes (possibly containing its entity icon)
  to make the mention more obvious. It does not have to be clickable/a link

All of these rules can be combined. E.g.: a deletion that would delete 20 other entities
or disconnect it from 15 others needs the deletion traits as well as it needs its
consequences stated.

---

## Destructive – Irreversible

*(delete, permanently remove, empty trash)*

States exactly what will be deleted, by name. Explains that removal is
permanent — not recoverable. Uses a clear label like "Delete," never
"OK." Separates the destructive button from safe ones. Never uses a
vague "Are you sure?"

---

## Destructive – Reversible

*(archive, move to trash, unpublish, deactivate)*

Names the item and the action. Explicitly says the action **can** be
undone, and briefly says how ("You can restore this from Trash within
30 days"). Avoids alarming language that implies permanence when it
isn't — that erodes trust and trains users to over-hesitate later.

---

## Costly or Hard-to-Reverse Actions

*(send, pay, submit, publish, share externally)*

The risk here isn't data loss — it's real-world consequence. Confirm
the *effect*, not the mechanics: "This will email 400 subscribers,"
not "Submit newsletter?" Show key details that change the impact
(recipient count, amount, audience) directly in the dialog so the user
isn't confirming blind. Action label should name the consequence:
"Send," "Publish," "Pay $42.00."

---

## Overwrite or Replace

*(save over an existing file, replace a version, reset to default)*

Names both sides: what's being replaced and what it's being replaced
with. Makes clear the old version will be lost (or where to find it,
if versioning exists). Action label reflects the trade: "Overwrite,"
"Replace," not "Save."

---

## Bulk or Scope-Expanding Actions

*(delete all, apply to every item, remove access for a group)*

The danger is scale, so the dialog must surface the count and scope
explicitly: "This will remove 6 people from this project." Where
possible, let the user see or adjust the affected set before
confirming, rather than trusting a single blanket confirmation. Avoid
under-selling scope with vague phrasing like "selected items" — say
the number.

---

## Leaving or Discarding State

*(close with unsaved changes, cancel a flow, navigate away)*

Confirms loss of **work**, not loss of data structures. Say what will
be discarded in familiar terms: "Your unsaved changes will be lost,"
not "Unsaved state detected." Offer a safe exit when feasible ("Save
and exit" alongside "Discard") rather than forcing a binary
lose-it-or-stay choice.

---

## Quick Reference

| Category | What to name | What to confirm | Button label example |
|---|---|---|---|
| Destructive – irreversible | The item | Permanent, no recovery | Delete |
| Destructive – reversible | The item | Reversible + how | Archive |
| Costly action | The effect | Real-world consequence | Send, Publish, Pay |
| Overwrite | Old vs. new | What's lost | Overwrite, Replace |
| Bulk action | The count/scope | Scale of impact | Delete All (6 items) |
| Discard state | The work | Loss of unsaved effort | Discard, Save & Exit |