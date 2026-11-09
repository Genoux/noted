// List markers drawn live: `- ` shows a bullet (a lone `-` stays a dash), `- [ ]` a clickable checkbox
// (⌘L toggles), and typing `[] ` starts a task. The markdown text is unchanged.

import { syntaxTree } from "@codemirror/language";
import { EditorSelection, Prec, type Range, RangeSet } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { listMarkerLength, taskShorthand, toggleTask } from "../text";

// List markers stay real text, restyled by CSS: "- " into a dot, "- [ ]" into
// a box. Replacing widgets here crashed WebKitGTK's web process: the bullet as
// soon as "- " was typed, the box when a selection across it was deleted.
const bullet = Decoration.mark({ class: "cm-bullet" });
const bulletLine = Decoration.line({ class: "cm-bullet-line" });
const doneLine = Decoration.line({ class: "cm-task-done" });
const doneText = Decoration.mark({ class: "cm-task-done-text" });
const taskBox = (checked: boolean) =>
  Decoration.mark({
    class: "cm-task-box",
    attributes: {
      role: "checkbox",
      "aria-checked": String(checked),
      "aria-label": checked ? "Mark not done" : "Mark done",
    },
  });

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
        // Cover the "- " bullet too, so the box stands in for it.
        const mark = node.node.parent?.prevSibling;
        const from = mark?.name === "ListMark" ? mark.from : node.from;
        ranges.push(taskBox(checked).range(from, node.to));
        if (!checked) return;
        const line = view.state.doc.lineAt(node.from);
        ranges.push(doneLine.range(line.from));
        // Strike the words only, not the indent or the box before them.
        const textFrom = Math.min(node.to + 1, line.to);
        if (textFrom < line.to) ranges.push(doneText.range(textFrom, line.to));
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
        const target = (e.target as HTMLElement).closest(".cm-task-box");
        if (!target) return false;
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

/**
 * Backspace with the caret on a bullet or box (just after it, or at the line
 * start before it) deletes it, indent included, so the next Backspace joins
 * the line above. lang-markdown's own Backspace turns the marker into spaces,
 * and from the line start the raw markup was joined onto the line above.
 */
function deleteListMarker(view: EditorView): boolean {
  const { main } = view.state.selection;
  if (!main.empty) return false;
  const line = view.state.doc.lineAt(main.head);
  const markerEnd = line.from + listMarkerLength(line.text);
  if (markerEnd === line.from || main.head > markerEnd) return false;
  view.dispatch({
    changes: { from: line.from, to: markerEnd },
    selection: { anchor: line.from },
    userEvent: "delete.backward",
  });
  return true;
}

// Above lang-markdown's keymap, which is Prec.high.
export const listMarkerBackspace = Prec.highest(
  keymap.of([{ key: "Backspace", run: deleteListMarker }]),
);
