// Clickable checkboxes for `- [ ]` task lines, plus ⌘L to toggle.

import { syntaxTree } from "@codemirror/language";
import { EditorSelection, type Range, RangeSet } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { toggleTask } from "../text";

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked;
  }
  toDOM() {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "cm-task-box";
    box.checked = this.checked;
    box.setAttribute("aria-label", this.checked ? "Mark not done" : "Mark done");
    return box;
  }
  ignoreEvent() {
    return false;
  }
}

const doneLine = Decoration.line({ class: "cm-task-done" });

function taskDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
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
