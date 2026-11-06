import { describe, expect, it } from "vitest";
import { countWords, isoDate, toggleTask, toggleWrap } from "./text";

describe("countWords", () => {
  it("counts whitespace-separated words", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("  one\n two\tthree ")).toBe(3);
  });
});

describe("toggleTask", () => {
  it("checks and unchecks a task", () => {
    expect(toggleTask("- [ ] buy milk")).toBe("- [x] buy milk");
    expect(toggleTask("- [x] buy milk")).toBe("- [ ] buy milk");
    expect(toggleTask("  * [X] nested")).toBe("  * [ ] nested");
  });
  it("turns bullets and plain lines into tasks", () => {
    expect(toggleTask("- idea")).toBe("- [ ] idea");
    expect(toggleTask("  idea")).toBe("  - [ ] idea");
    expect(toggleTask("")).toBe("- [ ] ");
  });
});

describe("toggleWrap", () => {
  it("wraps and unwraps", () => {
    expect(toggleWrap("hi", "**")).toBe("**hi**");
    expect(toggleWrap("**hi**", "**")).toBe("hi");
    expect(toggleWrap("", "*")).toBe("**");
    expect(toggleWrap("*", "*")).toBe("***");
  });
});

describe("isoDate", () => {
  it("pads month and day", () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
