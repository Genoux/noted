import { describe, expect, it } from "vitest";
import { evaluate } from "./math";

describe("evaluate", () => {
  it.each([
    ["12 × 4.5 + 20 =", "74"],
    ["10-10=", "0"],
    ["(2 + 3)^2 / 5 =", "5"],
    ["2 * 3 + 4 * 5 =", "26"],
    ["1,000 / 8 =", "125"],
    ["7 / 2 =", "3.5"],
    ["1 / 3 =", "0.3333333333"],
    ["-4 + 10 =", "6"],
    ["20% of 150 =", "30"],
    ["100 + 10% =", "110"],
    ["80 - 25% =", "60"],
    ["$12 × 3 =", "$36"],
    ["€19.99 * 2 =", "€39.98"],
    ["5 km in mi =", "3.106855961 mi"],
    ["100 c to f =", "212 f"],
    ["2 hr in min =", "120 min"],
    ["- 3 x 4 =", "12"],
    ["- [ ] 6 / 3 =", "2"],
  ])("%s → %s", (input, expected) => {
    expect(evaluate(input)).toBe(expected);
  });

  it.each([
    "hello =",
    "a = b",
    "2026 =",
    "no equals 2 + 2",
    "5 km in kg =",
    "2 + =",
    "(2 + 3 =",
    "1 / 0 =",
    "x = 5",
  ])("ignores %s", (input) => {
    expect(evaluate(input)).toBeNull();
  });
});
