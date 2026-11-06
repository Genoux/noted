// Inline status after "remind me" lines. Status comes from the Rust side,
// which owns scheduling; this only displays it.

import { type EditorState, type Range, RangeSet, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { REMINDER_RE } from "../text";

/** Label per reminder line text (trimmed), e.g. "⏰ 3:30 PM". */
export type ReminderLabels = ReadonlyMap<string, string>;

export const setReminderLabels = StateEffect.define<ReminderLabels>();

class StatusWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly pending: boolean,
  ) {
    super();
  }
  eq(other: StatusWidget) {
    return other.label === this.label && other.pending === this.pending;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = this.pending ? "cm-reminder cm-reminder-pending" : "cm-reminder";
    el.textContent = `   ${this.label}`;
    return el;
  }
}

function build(state: EditorState, labels: ReminderLabels): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n);
    if (!REMINDER_RE.test(line.text)) continue;
    const label = labels.get(line.text.trim());
    const widget = new StatusWidget(label ?? "no time found", label === undefined);
    ranges.push(Decoration.widget({ widget, side: 1 }).range(line.to));
  }
  return RangeSet.of(ranges);
}

const labelsField = StateField.define<ReminderLabels>({
  create: () => new Map(),
  update(labels, tr) {
    for (const e of tr.effects) if (e.is(setReminderLabels)) return e.value;
    return labels;
  },
});

const decorations = StateField.define<DecorationSet>({
  create: (state) => build(state, state.field(labelsField)),
  update(deco, tr) {
    const changed = tr.docChanged || tr.effects.some((e) => e.is(setReminderLabels));
    return changed ? build(tr.state, tr.state.field(labelsField)) : deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const reminders = [labelsField, decorations];
