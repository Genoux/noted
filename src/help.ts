// The "?" sheet: every shortcut and format, in two columns.

import { version } from "../package.json";

type Row = [label: string, keys: string[], kind?: "keys" | "syntax"];
type Section = [title: string, rows: Row[]];

const SECTIONS: Section[] = [
  [
    "Panel",
    [
      ["Show or hide Noted", ["⌥Space"]],
      ["Close", ["Esc"]],
      ["Find", ["⌘F"]],
      ["Next or previous match", ["↵", "⇧↵"]],
      ["Shortcuts", ["⌘/"]],
      ["Quit", ["⌘Q"]],
    ],
  ],
  [
    "Tabs",
    [
      ["New tab", ["⌘T"]],
      ["Close tab", ["⌘W"]],
      ["Jump to tab", ["⌘1–9"]],
      ["Next or previous tab", ["⌃Tab", "⌃⇧Tab"]],
    ],
  ],
  [
    "Editing",
    [
      ["Bold, italic", ["⌘B", "⌘I"]],
      ["Make a task, or tick it off", ["⌘L"]],
      ["Move the line up or down", ["⌥↑", "⌥↓"]],
      ["Open a link", ["⌘-click"]],
      ["Text size", ["⌘-", "⌘=", "⌘0"]],
      ["Insert today's date", ["⇧⌘D"]],
    ],
  ],
  [
    "Calculate: end a line with =",
    [
      ["Sums", ["12 × 3 + 4 ="], "syntax"],
      ["Units", ["5 km in mi ="], "syntax"],
      ["Percentages", ["20% of 150 ="], "syntax"],
      ["Money, symbol kept", ["$12 × 3 ="], "syntax"],
      ["Type the answer in", ["Tab"]],
    ],
  ],
  [
    "Markdown",
    [
      ["Heading", ["#", "##", "###"], "syntax"],
      ["List, continues on Enter", ["-", "1."], "syntax"],
      ["Checklist, click a box to tick", ["- [ ]"], "syntax"],
      ["Bold, italic", ["**bold**", "*italic*"], "syntax"],
      ["Code, inline or fenced", ["`code`", "```"], "syntax"],
      ["Divider", ["---"], "syntax"],
    ],
  ],
  [
    "Reminders: start a line with Remind me",
    [
      ["In a while", ["Remind me in 10 minutes …"], "syntax"],
      ["On a day", ["Remind me Friday at 3pm …"], "syntax"],
    ],
  ],
];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderSection([title, rows]: Section): HTMLElement {
  const section = el("section", "help-section");
  section.append(el("h3", "help-section-title", title));
  for (const [label, keys, kind = "keys"] of rows) {
    const row = el("div", "help-row");
    const chips = el("span", "help-chips");
    chips.append(...keys.map((k) => el(kind === "keys" ? "kbd" : "code", `help-${kind}`, k)));
    row.append(el("span", "help-label", label), chips);
    section.append(row);
  }
  return section;
}

let overlay: HTMLElement | null = null;

export function isHelpOpen(): boolean {
  return overlay !== null;
}

export function closeHelp(): void {
  overlay?.remove();
  overlay = null;
}

export function toggleHelp(): void {
  if (overlay) {
    closeHelp();
    return;
  }
  overlay = el("div", "help");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "Shortcuts");
  overlay.addEventListener("mousedown", (e) => {
    e.preventDefault();
    closeHelp();
  });

  const content = el("div", "help-content");
  const header = el("header", "help-header");
  const heading = el("div", "help-heading");
  heading.append(el("h2", "help-title", "Shortcuts"), el("span", "help-version", `v${version}`));
  header.append(heading, el("span", "help-hint", "Esc or click to close"));
  const columns = el("div", "help-columns");
  const left = el("div", "help-column");
  const right = el("div", "help-column");
  left.append(...SECTIONS.slice(0, 3).map(renderSection));
  right.append(...SECTIONS.slice(3).map(renderSection));
  columns.append(left, right);
  content.append(header, columns);
  overlay.append(content);
  document.body.append(overlay);
}
