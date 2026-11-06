import { describe, expect, it } from "vitest";
import {
  countWords,
  isoDate,
  REMINDER_RE,
  reminderLabel,
  tabTitle,
  toggleTask,
  toggleWrap,
} from "./text";

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

describe("tabTitle", () => {
  it("uses the first non-empty line without markdown", () => {
    expect(tabTitle("\n\n# Groceries & ideas\nmore")).toBe("Groceries & ideas");
    expect(tabTitle("- [ ] call the **dentist**")).toBe("call the dentist");
    expect(tabTitle("> quoted")).toBe("quoted");
    expect(tabTitle("---\nafter divider")).toBe("after divider");
  });
  it("falls back and truncates", () => {
    expect(tabTitle("  \n")).toBe("Untitled");
    expect(tabTitle("a".repeat(40))).toBe(`${"a".repeat(23)}…`);
  });
});

describe("reminders", () => {
  const now = new Date(2026, 10, 6, 13, 0, 0); // Fri 6 Nov 2026, 1:00 PM

  it("detects reminder lines like the Rust parser", () => {
    expect(REMINDER_RE.test("Remind me in 10 min to stretch")).toBe(true);
    expect(REMINDER_RE.test("- [ ] reminder 10pm to call Lena")).toBe(true);
    expect(REMINDER_RE.test("reminders list")).toBe(false);
    expect(REMINDER_RE.test("please remind me")).toBe(false);
  });

  it("labels by distance", () => {
    expect(reminderLabel("2026-11-06T15:30:00", false, now)).toBe("⏰ 3:30 PM");
    expect(reminderLabel("2026-11-06T13:00:10", false, now)).toBe("⏰ 1:00:10 PM");
    expect(reminderLabel("2026-11-07T09:00:00", false, now)).toBe("⏰ Sat 9:00 AM");
    expect(reminderLabel("2026-11-20T00:05:00", false, now)).toBe("⏰ Nov 20 12:05 AM");
    expect(reminderLabel("2026-11-06T12:00:00", true, now)).toBe("✓ sent");
  });
});
