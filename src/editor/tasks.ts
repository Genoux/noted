// List markers drawn live: `- ` shows a bullet (a lone `-` stays a dash), `- [ ]` a clickable checkbox
// (⌘L toggles), and typing `[] ` starts a task. The markdown text is unchanged.

import { syntaxTree } from "@codemirror/language";
import { EditorSelection, type Range, RangeSet } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { taskShorthand, toggleTask } from "../text";

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked;
  }
  toDOM() {
    // A span, not an <input>: a focusable control inside the editable text
    // lets WebKit park the caret in or beside it.
    const box = document.createElement("span");
    box.className = "cm-task-box";
    box.setAttribute("role", "checkbox");
    box.setAttribute("aria-checked", String(this.checked));
    box.setAttribute("aria-label", this.checked ? "Mark not done" : "Mark done");
    return box;
  }
  ignoreEvent() {
    return false;
  }
}

// The "- " stays real text, restyled by CSS into a dot. A replacing widget
// here crashed WebKitGTK's web process as soon as "- " was typed.
const bullet = Decoration.mark({ class: "cm-bullet" });
const bulletLine = Decoration.line({ class: "cm-bullet-line" });
const doneLine = Decoration.line({ class: "cm-task-done" });

function taskDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        // A bullet list item's "-", "*" or "+" once a space follows it (Lezer
        // already parses a lone "-" as an item), unless the item is a task.
        if (
          node.name === "ListMark" &&
          node.node.parent?.parent?.name === "BulletList" &&
          node.node.nextSibling?.name !== "Task" &&
          view.state.sliceDoc(node.to, node.to + 1) === " "
        ) {
          ranges.push(bulletLine.range(view.state.doc.lineAt(node.from).from));
          ranges.push(bullet.range(node.from, node.to + 1));
          return;
        }
        if (node.name !== "TaskMarker") return;
        const checked = view.state.sliceDoc(node.from + 1, node.to - 1) !== " ";
        // Swallow the "- " bullet too, so the box stands in for it.
        const mark = node.node.parent?.prevSibling;
        const from = mark?.name === "ListMark" ? mark.from : node.from;
        ranges.push(
          Decoration.replace({ widget: new CheckboxWidget(checked) }).range(from, node.to),
        );
        if (checked) ranges.push(doneLine.range(view.state.doc.lineAt(node.from).from));
      },
    });
  }
  return RangeSet.of(ranges, true);
}

/** Toggles the task on every line touched by the selection. */
export function toggleTaskCommand(view: EditorView): boolean {
  const { state } = view;
  const seen = new Set<number>();
  const changes = [];
  for (const range of state.selection.ranges) {
    for (let pos = range.from; pos <= range.to; ) {
      const line = state.doc.lineAt(pos);
      if (!seen.has(line.number)) {
        seen.add(line.number);
        changes.push({ from: line.from, to: line.to, insert: toggleTask(line.text) });
      }
      pos = line.to + 1;
    }
  }
  view.dispatch({ changes, userEvent: "input.toggle-task" });
  return true;
}

function toggleAt(view: EditorView, pos: number): boolean {
  const line = view.state.doc.lineAt(pos);
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: toggleTask(line.text) },
    selection: EditorSelection.cursor(view.state.selection.main.head),
    userEvent: "input.toggle-task",
  });
  return true;
}

export const tasks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = taskDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
        this.decorations = taskDecorations(u.view);
      }
    }
  },
  {
    decorations: (p) => p.decorations,
    // The caret steps over a bullet or box in one move, never into its markup.
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => view.plugin(plugin)?.decorations ?? Decoration.none),
    eventHandlers: {
      mousedown: (e, view) => {
        const target = e.target as HTMLElement;
        if (!target.classList.contains("cm-task-box")) return false;
        e.preventDefault();
        return toggleAt(view, view.posAtDOM(target));
      },
    },
  },
);

/** Typing a space after `[]` or `[ ]` at the start of a line makes it a task. */
export const taskShorthandInput = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== " " || from !== to) return false;
  const line = view.state.doc.lineAt(from);
  const task = taskShorthand(view.state.sliceDoc(line.from, from));
  if (task === null) return false;
  view.dispatch({
    changes: { from: line.from, to, insert: task },
    selection: { anchor: line.from + task.length },
    userEvent: "input.type",
  });
  return true;
});
