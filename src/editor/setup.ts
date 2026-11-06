// Assembles the CodeMirror editor.

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { EditorState, Prec } from "@codemirror/state";
import { drawSelection, EditorView, keymap, placeholder } from "@codemirror/view";
import { applyFontSize, commandKeymap } from "./commands";
import { find } from "./find";
import { inlineMath, mathKeymap } from "./inline-math";
import { links } from "./links";
import { markdownStyling, noteMarkdown } from "./markdown";
import { reminders } from "./reminders";
import { tasks } from "./tasks";

// Overrides of CodeMirror's base theme (scoped, so no !important needed).
const theme = EditorView.theme({
  "&": { fontSize: "var(--font-size, 20px)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--body-font)",
    lineHeight: "1.35",
    // 22px sides: the text lines up with the tab labels at every size.
    padding: "4px 22px 8px",
  },
  // Full width at the default panel size. Only a much wider panel centres
  // the column, capped at 760px or 34 × the font size, whichever is wider.
  ".cm-content": {
    boxSizing: "border-box",
    width: "100%",
    maxWidth: "max(760px, calc(var(--font-size, 20px) * 34))",
    margin: "0 auto",
    padding: "0",
    caretColor: "var(--caret)",
  },
  ".cm-line": { padding: "0" },
  ".cm-cursor, .cm-dropCursor": { borderLeft: "2px solid var(--caret)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground":
    { background: "var(--selection)" },
  ".cm-line.cm-quote": { paddingLeft: "14px", borderLeft: "2px solid var(--rule)" },
});

const PLACEHOLDERS = [
  "What's on your mind?",
  "Type your first thought…",
  "Write it down before it's gone.",
  "Capture it before you forget.",
  "Anything to remember?",
];

export interface EditorOptions {
  parent: HTMLElement;
  onChange: (text: string) => void;
  /** Esc when nothing else (like the find panel) wants it. */
  onEscape: () => void;
}

export interface Editor {
  view: EditorView;
  /** A fresh state (own undo history) for a document, e.g. one per tab. */
  stateFor: (doc: string) => EditorState;
}

export function createEditor({ parent, onChange, onEscape }: EditorOptions): Editor {
  applyFontSize();
  const dismiss = (): boolean => {
    onEscape();
    return true;
  };
  const extensions = [
    history(),
    drawSelection(),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({
      spellcheck: "false",
      autocorrect: "off",
      autocapitalize: "off",
      "aria-label": "Note",
    }),
    placeholder(PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]),
    noteMarkdown,
    theme,
    markdownStyling,
    tasks,
    links,
    inlineMath,
    reminders,
    find,
    keymap.of([
      ...mathKeymap,
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
  ];
  const stateFor = (doc: string) => EditorState.create({ doc, extensions });
  return { view: new EditorView({ parent, state: stateFor("") }), stateFor };
}
