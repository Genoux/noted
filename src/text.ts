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
