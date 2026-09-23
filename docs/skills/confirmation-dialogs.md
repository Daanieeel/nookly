# How To: Confirmation Dialogs

## General Principle

Every confirmation dialog should let the user answer three questions at a glance:
**What is affected? What happens to it? Can it be undone?**

If the dialog text alone does not make all three obvious, the dialog has failed, no matter how its buttons are labeled or colored.

These rules apply to every category below:

- **Name the specific thing affected.** Never rely on the user remembering what they clicked.
- **Put a specific action verb on the button** ("Delete," "Send," "Overwrite"), never "OK," "Yes," or "Confirm."
- **Separate the risky action from the safe one visually** (color, spacing, or position), so a rushed click does not default to harm.
- **Never ask a generic yes or no question** the user can dismiss without reading, such as "Are you sure?"
- **State consequences in plain language, not system terms.** "This will email 400 people" beats "Submit form." Show consequences as stat boxes or exact figures rather than in paragraphs.
- **Make entity mentions stand out.** Show the entity in a code-style box or chip, ideally with its entity icon. It does not need to be clickable.

The rules combine. A deletion that would also delete 20 other entities, or disconnect the item from 15 others, needs everything a deletion dialog needs **and** a clear statement of those consequences.

---

## Destructive and Irreversible

*Examples: permanently delete, empty Trash.*

- State exactly what will be deleted, by name.
- Explain that removal is permanent and cannot be recovered.
- Use a clear label like "Delete," never "OK."
- Separate the destructive button from the safe ones.
- Never fall back on a vague "Are you sure?"

---

## Destructive but Reversible

*Examples: move to Trash, archive, deactivate.*

- Name the item and the action.
- Say explicitly that the action **can** be undone, and briefly how ("You can restore this from Trash").
- Avoid alarming language that implies permanence when there is none. Overstating the risk erodes trust and teaches users to hesitate for no reason.

In Nookly, regular deletes land here, because every delete is a soft delete and Trash is never purged automatically by default (see [soft delete](../02-entity-model.md#soft-delete-and-trash)).

---

## Costly or Hard-to-Reverse

*Examples: send, pay, submit, publish, share externally.*

The risk here is not data loss but real-world consequences.

- Confirm the **effect**, not the mechanics: "This will email 400 subscribers," not "Submit newsletter?"
- Show the details that change the impact (recipient count, amount, audience) directly in the dialog, so the user is not confirming blind.
- Name the consequence in the action label: "Send," "Publish," "Pay $42.00."

---

## Overwrite or Replace

*Examples: save over an existing file, replace a version, reset to defaults.*

- Name both sides: what is being replaced and what replaces it.
- Make clear that the old version will be lost (or say where to find it, if versioning exists).
- Let the label reflect the trade: "Overwrite" or "Replace," not "Save."

---

## Bulk or Scope-Expanding

*Examples: delete all, apply to every item, remove access for a group.*

The danger is scale, so surface the count and scope explicitly: "This will remove 6 people from this project."

- Where possible, let the user see or adjust the affected set before confirming, instead of trusting one blanket confirmation.
- Do not undersell the scope with vague phrases like "selected items." Say the number.

---

## Leaving or Discarding Work

*Examples: close with unsaved changes, cancel a flow, navigate away.*

- Confirm the loss of **work**, not of data structures.
- Describe what will be discarded in familiar terms: "Your unsaved changes will be lost," not "Unsaved state detected."
- Offer a safe way out when feasible ("Save and exit" next to "Discard") instead of forcing a choice between losing the work and staying.

---

## Quick Reference

| Category                   | What to name     | What to confirm           | Example button label  |
| -------------------------- | ---------------- | ------------------------- | --------------------- |
| Destructive, irreversible  | The item         | Permanent, no recovery    | Delete                |
| Destructive, reversible    | The item         | Reversible, and how       | Move to Trash         |
| Costly action              | The effect       | Real-world consequence    | Send, Publish, Pay    |
| Overwrite                  | Old and new      | What is lost              | Overwrite, Replace    |
| Bulk action                | The count, scope | Scale of impact           | Delete All (6 items)  |
| Discard work               | The work         | Loss of unsaved effort    | Discard, Save and Exit |
