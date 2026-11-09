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

/** Length of the bullet or task box a line starts with, indent included; 0 if none. */
export function listMarkerLength(line: string): number {
  return /^\s*[-*+] (?:\[[ xX]\](?: |$))?/.exec(line)?.[0].length ?? 0;
}

/**
 * `[]` or `[ ]` typed at the start of a line (after any indent or bullet),
 * about to get a space: the task line it should become, else null.
 */
export function taskShorthand(beforeCursor: string): string | null {
  const m = /^(\s*)(?:[-*+]\s+)?\[ ?\]$/.exec(beforeCursor);
  return m ? `${m[1]}- [ ] ` : null;
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
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "2:42 PM" today, "Tomorrow 9:00 AM", "Fri 9:00 AM" this week, else "14 Oct 10:00 AM". */
export function reminderTime(at: Date, now: Date): string {
  const h = at.getHours();
  const time = `${h % 12 || 12}:${String(at.getMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  const days = Math.round((dayStart(at) - dayStart(now)) / 86_400_000);
  if (days === 0) return time;
  if (days === 1) return `Tomorrow ${time}`;
  if (days > 1 && days < 7) return `${WEEKDAYS[at.getDay()]} ${time}`;
  return `${at.getDate()} ${MONTHS[at.getMonth()]} ${time}`;
}

/** Inline status after a scheduled reminder line. */
export function reminderLabel(atIso: string, sent: boolean, now: Date): string {
  // No offset in the string, so it is read as local time.
  return sent ? "✓ sent" : `→ ${reminderTime(new Date(atIso), now)}`;
}

/** Text sizes: small, default, large, largest. */
export const TEXT_SIZES = [17, 20, 24, 28] as const;
export const DEFAULT_TEXT_SIZE = 20;

/** Index of the preset nearest to `size`. */
export function textSizeIndex(size: number): number {
  let best = 0;
  TEXT_SIZES.forEach((s, i) => {
    if (Math.abs(s - size) < Math.abs(TEXT_SIZES[best] - size)) best = i;
  });
  return best;
}

/** The Aa button: next preset, wrapping back to the smallest. */
export function nextTextSize(current: number): number {
  return TEXT_SIZES[(textSizeIndex(current) + 1) % TEXT_SIZES.length];
}

/** ⌘= / ⌘-: one preset up or down, stopping at the ends. */
export function stepTextSize(current: number, step: 1 | -1): number {
  const i = Math.min(TEXT_SIZES.length - 1, Math.max(0, textSizeIndex(current) + step));
  return TEXT_SIZES[i];
}
