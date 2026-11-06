// Formatting and utility shortcuts.

import { EditorSelection } from "@codemirror/state";
import type { EditorView, KeyBinding } from "@codemirror/view";
import { isoDate, toggleWrap } from "../text";
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
const FONT_DEFAULT = 22;
const FONT_MIN = 12;
const FONT_MAX = 40;

export function applyFontSize(size: number = readFontSize()): void {
  document.documentElement.style.setProperty("--font-size", `${size}px`);
}

function readFontSize(): number {
  try {
    const saved = Number(localStorage.getItem(FONT_KEY));
    return saved >= FONT_MIN && saved <= FONT_MAX ? saved : FONT_DEFAULT;
  } catch {
    return FONT_DEFAULT;
  }
}

function setFontSize(size: number): boolean {
  const clamped = Math.min(FONT_MAX, Math.max(FONT_MIN, size));
  try {
    localStorage.setItem(FONT_KEY, String(clamped));
  } catch {
    // Not persisted; still applied for this session.
  }
  applyFontSize(clamped);
  return true;
}

export const commandKeymap: KeyBinding[] = [
  { key: "Mod-b", run: wrapWith("**") },
  { key: "Mod-i", run: wrapWith("*") },
  { key: "Mod-l", run: toggleTaskCommand },
  { key: "Shift-Mod-d", run: insertDate },
  { key: "Mod-=", run: () => setFontSize(readFontSize() + 2) },
  { key: "Mod-+", run: () => setFontSize(readFontSize() + 2) },
  { key: "Mod--", run: () => setFontSize(readFontSize() - 2) },
  { key: "Mod-0", run: () => setFontSize(FONT_DEFAULT) },
];
