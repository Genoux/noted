// Assembles the CodeMirror editor.

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { EditorState, Prec } from "@codemirror/state";
import { drawSelection, EditorView, keymap, placeholder } from "@codemirror/view";
import { applyFontSize, commandKeymap } from "./commands";
import { links } from "./links";
import { markdownStyling, noteMarkdown } from "./markdown";
import { tasks } from "./tasks";

// Overrides of CodeMirror's base theme (scoped, so no !important needed).
const theme = EditorView.theme({
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground":
    { background: "var(--selection)" },
  "&": { fontSize: "var(--font-size, 22px)" },
  ".cm-scroller": {
    fontFamily: 'Charter, "Iowan Old Style", Georgia, serif',
    lineHeight: "1.6",
    padding: "8px 72px 24px",
  },
  ".cm-cursor, .cm-dropCursor": { borderLeft: "2px solid var(--fg)" },
  ".cm-panels": { background: "transparent", color: "inherit" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--border)" },
  ".cm-line.cm-quote": { paddingLeft: "14px" },
});

export interface EditorOptions {
  parent: HTMLElement;
  doc: string;
  onChange: (text: string) => void;
  /** Esc when nothing else (like the find panel) wants it. */
  onEscape: () => void;
}

export function createEditor({ parent, doc, onChange, onEscape }: EditorOptions): EditorView {
  applyFontSize();
  const dismiss = (): boolean => {
    onEscape();
    return true;
  };
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({
          spellcheck: "false",
          autocorrect: "off",
          autocapitalize: "off",
          "aria-label": "Note",
        }),
        placeholder("Jot it down…"),
        noteMarkdown,
        theme,
        markdownStyling,
        tasks,
        links,
        search({ top: false }),
        highlightSelectionMatches(),
        keymap.of([
          ...commandKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...defaultKeymap,
          indentWithTab,
        ]),
        Prec.lowest(keymap.of([{ key: "Escape", run: dismiss }])),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChange(u.state.doc.toString());
        }),
      ],
    }),
  });
}
