// Live markdown styling: inline marks via highlight tags, block lines via decorations.

import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { type Range, RangeSet } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

/** GFM markdown, where `---` under a line is always a divider, never a "setext" heading. */
export const noteMarkdown = markdown({
  base: markdownLanguage,
  extensions: [{ remove: ["SetextHeading"] }],
});

const style = HighlightStyle.define([
  { tag: t.heading1, fontSize: "1.4em", fontWeight: "700" },
  { tag: t.heading2, fontSize: "1.2em", fontWeight: "700" },
  { tag: t.heading3, fontSize: "1.05em", fontWeight: "700" },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: "700" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.monospace, class: "cm-mono" },
  { tag: [t.link, t.url], class: "cm-link" },
  { tag: [t.processingInstruction, t.contentSeparator, t.quote], class: "cm-mark" },
]);

const lineDeco = {
  hr: Decoration.line({ class: "cm-hr" }),
  code: Decoration.line({ class: "cm-codeblock" }),
  quote: Decoration.line({ class: "cm-quote" }),
  heading: Decoration.line({ class: "cm-heading" }),
};

function blockLines(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const { doc } = view.state;
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const deco =
          node.name === "HorizontalRule"
            ? lineDeco.hr
            : node.name === "FencedCode"
              ? lineDeco.code
              : node.name === "Blockquote"
                ? lineDeco.quote
                : node.name.startsWith("ATXHeading")
                  ? lineDeco.heading
                  : null;
        if (!deco) return;
        for (let pos = node.from; pos <= node.to; ) {
          const line = doc.lineAt(pos);
          ranges.push(deco.range(line.from));
          pos = line.to + 1;
        }
        return false;
      },
    });
  }
  return RangeSet.of(ranges, true);
}

const blockPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = blockLines(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
        this.decorations = blockLines(u.view);
      }
    }
  },
  { decorations: (p) => p.decorations },
);

export const markdownStyling = [syntaxHighlighting(style), blockPlugin];
