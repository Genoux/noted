// Pure text helpers. No DOM, no CodeMirror: easy to unit test.

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Matches a task line: indent, bullet, box. Groups: [prefix, mark]. */
export const TASK_RE = /^(\s*[-*+]\s+\[)([ xX])\]/;

/**
 * Toggles the checkbox on a task line, or turns a plain line into an open task.
 * Returns the new line text.
 */
export function toggleTask(line: string): string {
  const m = TASK_RE.exec(line);
  if (m) {
    const done = m[2] !== " ";
    return `${m[1]}${done ? " " : "x"}]${line.slice(m[0].length)}`;
  }
  const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line);
  if (bullet) return `${bullet[1]}- [ ] ${bullet[2]}`;
  const indent = /^\s*/.exec(line)?.[0] ?? "";
  return `${indent}- [ ] ${line.slice(indent.length)}`;
}

/** Wraps `text` in `mark`, or unwraps it if already wrapped. */
export function toggleWrap(text: string, mark: string): string {
  const wrapped = text.length >= mark.length * 2 && text.startsWith(mark) && text.endsWith(mark);
  return wrapped ? text.slice(mark.length, -mark.length) : `${mark}${text}${mark}`;
}

/** Today's date as `YYYY-MM-DD` in local time. */
export function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const TITLE_MAX = 24;

/** A tab title from the note's first non-empty line, minus markdown markers. */
export function tabTitle(text: string): string {
  for (const raw of text.split("\n")) {
    const line = raw
      .replace(/^\s*(#{1,6}\s+|>\s*|[-*+]\s+(\[[ xX]\]\s*)?|\d+[.)]\s+)/, "")
      .replace(/[*_`~]/g, "")
      .trim();
    if (line && !/^-{3,}$/.test(line)) {
      return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…` : line;
    }
  }
  return "Untitled";
}

/** Same trigger the Rust parser uses: a line starting with "remind me" or "reminder". */
export const REMINDER_RE = /^\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?)?(?:remind me|reminder)(?=$|[\s:,])/i;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Inline status for a scheduled reminder: "⏰ 3:30 PM", "⏰ Fri 9:00 AM", "✓ sent". */
export function reminderLabel(atIso: string, sent: boolean, now: Date): string {
  if (sent) return "✓ sent";
  const at = new Date(atIso); // No offset in the string, so read as local time.
  const h = at.getHours();
  const time = `${h % 12 || 12}:${String(at.getMinutes()).padStart(2, "0")}${
    at.getSeconds() ? `:${String(at.getSeconds()).padStart(2, "0")}` : ""
  } ${h < 12 ? "AM" : "PM"}`;
  const sameDay = at.toDateString() === now.toDateString();
  const days = (at.getTime() - now.getTime()) / 86_400_000;
  const day = sameDay
    ? ""
    : days < 6
      ? `${WEEKDAYS[at.getDay()]} `
      : `${at.toLocaleString("en", { month: "short" })} ${at.getDate()} `;
  return `⏰ ${day}${time}`;
}

/** Text sizes the Aa button steps through: small, medium, large, extra large. */
export const TEXT_SIZES = [18, 22, 26, 32] as const;

/** The next preset above `current`, wrapping back to the smallest. */
export function nextTextSize(current: number): number {
  return TEXT_SIZES.find((s) => s > current) ?? TEXT_SIZES[0];
}
