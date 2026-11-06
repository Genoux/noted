import { describe, expect, it } from "vitest";
import { noteMarkdown } from "./markdown";

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
});
