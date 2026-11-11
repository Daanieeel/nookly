import { Extension } from "@tiptap/core";
import { vimPlugin } from "@nookly/shared/vim";
import { settings } from "#/lib/settings/settings.ts";

export { closeVimHelp, vimState } from "@nookly/shared/vim";

/// Optional Vim keys in the page editor, behind the `notes.vimMode` setting. The keys
/// themselves live in `@nookly/shared/vim`, which the phone's editor runs too.
export const VimMode = Extension.create({
  name: "vimMode",
  priority: 10_000,

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      vimPlugin({
        enabled: () => settings.get("notes.vimMode"),
        undo: () => editor.commands.undo(),
        redo: () => editor.commands.redo(),
      }),
    ];
  },
});
