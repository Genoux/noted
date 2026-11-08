import { highlightTree } from "@lezer/highlight";
import { describe, expect, it } from "vitest";
import { highlightStyle, noteMarkdown } from "./markdown";

function classAt(doc: string, pos: number): string {
  let found = "";
  highlightTree(noteMarkdown.language.parser.parse(doc), highlightStyle, (from, to, classes) => {
    if (from <= pos && pos < to) found = classes;
  });
  return found;
}

function nodeNames(doc: string): string[] {
  const names: string[] = [];
  noteMarkdown.language.parser.parse(doc).iterate({ enter: (n) => void names.push(n.name) });
  return names;
}

describe("noteMarkdown", () => {
  it("treats --- under a line as a divider, not a heading", () => {
    const names = nodeNames("reminder 10pm\n---\n");
    expect(names).toContain("HorizontalRule");
    expect(names).not.toContain("SetextHeading2");
  });
  it("parses task markers", () => {
    expect(nodeNames("- [ ] call the dentist\n")).toContain("TaskMarker");
  });
  it("draws list markers like body text, other marks muted", () => {
    expect(classAt("-\n", 0)).toBe("");
    expect(classAt("- milk\n", 0)).toBe("");
    expect(classAt("1. milk\n", 0)).toBe("");
    expect(classAt("# title\n", 0)).toContain("cm-mark");
  });
});
