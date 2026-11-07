// Formatting and utility shortcuts.

import { EditorSelection } from "@codemirror/state";
import { EditorView, type KeyBinding } from "@codemirror/view";
import {
  DEFAULT_TEXT_SIZE,
  isoDate,
  nextTextSize,
  stepTextSize,
  TEXT_SIZES,
  textSizeIndex,
  toggleWrap,
} from "../text";
import { toggleTaskCommand } from "./tasks";

function wrapWith(mark: string) {
  return (view: EditorView): boolean => {
    view.dispatch(
      view.state.changeByRange((range) => {
        const text = view.state.sliceDoc(range.from, range.to);
        const next = toggleWrap(text, mark);
        const cursor = range.empty
          ? EditorSelection.cursor(range.from + mark.length)
          : EditorSelection.range(range.from, range.from + next.length);
        return { changes: { from: range.from, to: range.to, insert: next }, range: cursor };
      }),
      { userEvent: "input.format" },
    );
    return true;
  };
}

function insertDate(view: EditorView): boolean {
  view.dispatch(view.state.replaceSelection(isoDate(new Date())), { userEvent: "input" });
  return true;
}

const FONT_KEY = "noted.fontSize";

/** Applies the saved (or given) text size to the page. */
export function applyFontSize(size: number = readFontSize()): void {
  const root = document.documentElement;
  root.style.setProperty("--font-size", `${size}px`);
  root.dataset.textSize = String(textSizeIndex(size));
}

function readFontSize(): number {
  try {
    const saved = Number(localStorage.getItem(FONT_KEY));
    return (TEXT_SIZES as readonly number[]).includes(saved) ? saved : DEFAULT_TEXT_SIZE;
  } catch {
    return DEFAULT_TEXT_SIZE;
  }
}

function setFontSize(view: EditorView, size: number): boolean {
  try {
    localStorage.setItem(FONT_KEY, String(size));
  } catch {
    // Not persisted; still applied for this session.
  }
  applyFontSize(size);
  // The size is a CSS variable, which CodeMirror can't observe: measure again
  // so the caret and selection are redrawn at the new line height.
  view.requestMeasure();
  // Lines reflow at the new size; keep the caret on screen.
  view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head) });
  return true;
}

/** The footer's Aa button: next size, wrapping around. */
export function cycleFontSize(view: EditorView): void {
  setFontSize(view, nextTextSize(readFontSize()));
}

export const commandKeymap: KeyBinding[] = [
  { key: "Mod-b", run: wrapWith("**") },
  { key: "Mod-i", run: wrapWith("*") },
  { key: "Mod-l", run: toggleTaskCommand },
  { key: "Shift-Mod-d", run: insertDate },
  { key: "Mod-=", run: (view) => setFontSize(view, stepTextSize(readFontSize(), 1)) },
  { key: "Mod-+", run: (view) => setFontSize(view, stepTextSize(readFontSize(), 1)) },
  { key: "Mod--", run: (view) => setFontSize(view, stepTextSize(readFontSize(), -1)) },
  { key: "Mod-0", run: (view) => setFontSize(view, DEFAULT_TEXT_SIZE) },
];
