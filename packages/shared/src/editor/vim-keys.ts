/// What Vim mode shows: the name of each mode and the key list `?` opens.

export const VIM_MODE_LABELS = {
  normal: "NORMAL",
  insert: "INSERT",
  visual: "VISUAL",
  "visual-line": "VISUAL LINE",
} as const;

/// The keys Vim mode understands, for the `?` list on the desktop and the phone.
export const VIM_KEY_GROUPS = [
  {
    title: "Modes",
    keys: [
      ["Esc", "Back to normal mode"],
      ["i  a  I  A", "Insert before or after the cursor, at the line start or end"],
      ["o  O", "Open a new line below or above"],
      ["v  V", "Select characters or whole lines"],
    ],
  },
  {
    title: "Move",
    keys: [
      ["h  j  k  l", "Left, down, up, right"],
      ["w  b  e", "Next word, previous word, end of word"],
      ["0  ^  $", "Line start, first word, line end"],
      ["gg  G", "First line, last line"],
      ["{  }", "Previous or next block"],
      ["3w  2j", "A count repeats a motion"],
    ],
  },
  {
    title: "Edit",
    keys: [
      ["x  X", "Delete the character under or before the cursor"],
      ["dw", "Delete a word (d with any motion)"],
      ["dd  D", "Delete the line, or to its end"],
      ["cw  cc  C", "Change a word, the line, or to its end"],
      ["diw  daw", "Delete the word under the cursor, with or without its space"],
      ["yy  yw", "Copy a line or a word"],
      ["p  P", "Paste after or before the cursor"],
      ["r", "Replace one character"],
      ["u  Ctrl+R", "Undo and redo"],
    ],
  },
] as const;
