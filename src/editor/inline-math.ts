// Shows the answer after lines ending in "=", dimmed. Tab types it in.

import { type Range, RangeSet } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  type KeyBinding,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { evaluate } from "../math";

class AnswerWidget extends WidgetType {
  constructor(readonly answer: string) {
    super();
  }
  eq(other: AnswerWidget) {
    return other.answer === this.answer;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-math-answer";
    el.textContent = ` ${this.answer}`;
    el.setAttribute("aria-label", `equals ${this.answer}`);
    return el;
  }
}

function answers(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const { doc } = view.state;
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = doc.lineAt(pos);
      const answer = line.text.includes("=") ? evaluate(line.text) : null;
      if (answer) {
        ranges.push(
          Decoration.widget({ widget: new AnswerWidget(answer), side: 1 }).range(line.to),
        );
      }
      pos = line.to + 1;
    }
  }
  return RangeSet.of(ranges);
}

export const inlineMath = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = answers(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = answers(u.view);
    }
  },
  { decorations: (p) => p.decorations },
);

/** Tab at the end of a maths line types the answer in. */
function acceptAnswer(view: EditorView): boolean {
  const { main } = view.state.selection;
  if (!main.empty) return false;
  const line = view.state.doc.lineAt(main.head);
  if (main.head !== line.to) return false;
  const answer = evaluate(line.text);
  if (!answer) return false;
  const insert = line.text.endsWith(" ") ? answer : ` ${answer}`;
  view.dispatch({
    changes: { from: line.to, insert },
    selection: { anchor: line.to + insert.length },
    userEvent: "input.complete",
  });
  return true;
}

export const mathKeymap: KeyBinding[] = [{ key: "Tab", run: acceptAnswer }];
