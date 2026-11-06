import type { EditorState } from "@codemirror/state";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cycleFontSize } from "./editor/commands";
import { setReminderLabels } from "./editor/reminders";
import { createEditor } from "./editor/setup";
import { closeHelp, isHelpOpen, toggleHelp } from "./help";
import { renderTabs } from "./tabs";
import { countWords, reminderLabel, tabTitle } from "./text";
import { applyTheme, cycleTheme } from "./theme";

const SAVE_DELAY_MS = 300;
const ACTIVE_KEY = "noted.activeTab";

function requireEl<T extends HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`${selector} missing`);
  return el;
}

const words = requireEl<HTMLSpanElement>("#words");
const strip = requireEl<HTMLElement>("#tabs");
const panel = getCurrentWindow();

/** Editor state per tab id, so switching keeps undo history and cursor. */
const states = new Map<string, EditorState>();
let order: string[] = [];
let activeId = "";

// --- saving ---------------------------------------------------------------

const pending = new Map<string, string>();
let timer: number | undefined;

function flush(): void {
  window.clearTimeout(timer);
  timer = undefined;
  for (const [id, text] of pending) {
    invoke("save_note", { id, text })
      .then(() => {
        if (id === activeId) void refreshReminders();
      })
      .catch((e) => console.error(`save ${id} failed:`, e));
  }
  pending.clear();
}

// --- reminders ------------------------------------------------------------

interface ReminderEntry {
  line: string;
  at: string;
  sent: boolean;
}

/** Pulls the active tab's reminder statuses from Rust into the editor. */
async function refreshReminders(): Promise<void> {
  const id = activeId;
  try {
    const entries = await invoke<ReminderEntry[]>("tab_reminders", { id });
    if (id !== activeId) return;
    const now = new Date();
    const labels = new Map(entries.map((e) => [e.line, reminderLabel(e.at, e.sent, now)]));
    editor.view.dispatch({ effects: setReminderLabels.of(labels) });
    states.set(id, editor.view.state);
  } catch (e) {
    console.error("reminders refresh failed:", e);
  }
}

function queueSave(id: string, text: string): void {
  pending.set(id, text);
  window.clearTimeout(timer);
  timer = window.setTimeout(flush, SAVE_DELAY_MS);
}

// --- rendering ------------------------------------------------------------

function textOf(id: string): string {
  return states.get(id)?.doc.toString() ?? "";
}

function render(): void {
  const tabs = order.map((id) => ({ id, title: tabTitle(textOf(id)) }));
  renderTabs(strip, tabs, activeId, { onSelect: select, onClose: close, onCreate: create });
  const n = countWords(textOf(activeId));
  words.textContent = n === 0 ? "" : `${n} ${n === 1 ? "word" : "words"}`;
}

// --- tab actions ----------------------------------------------------------

const editor = createEditor({
  parent: requireEl("#editor"),
  onChange: (text) => {
    queueSave(activeId, text);
    states.set(activeId, editor.view.state);
    render();
  },
  onEscape: () => {
    flush();
    panel.hide();
  },
});

function select(id: string): void {
  const state = states.get(id);
  if (!state) return;
  if (activeId) states.set(activeId, editor.view.state);
  activeId = id;
  editor.view.setState(state);
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // Not remembered across launches; harmless.
  }
  render();
  editor.view.focus();
  void refreshReminders();
}

async function create(): Promise<void> {
  try {
    const id = await invoke<string>("create_tab");
    states.set(id, editor.stateFor(""));
    order.push(id);
    select(id);
  } catch (e) {
    console.error("create tab failed:", e);
  }
}

async function close(id: string): Promise<void> {
  flush();
  try {
    await invoke("close_tab", { id });
  } catch (e) {
    console.error(`close ${id} failed:`, e);
    return;
  }
  const index = order.indexOf(id);
  order = order.filter((t) => t !== id);
  states.delete(id);
  if (order.length === 0) {
    await create();
  } else if (id === activeId) {
    activeId = "";
    select(order[Math.min(index, order.length - 1)]);
  } else {
    render();
  }
}

function cycle(step: number): void {
  const i = order.indexOf(activeId);
  select(order[(i + step + order.length) % order.length]);
}

document.addEventListener(
  "keydown",
  (e) => {
    const mod = e.metaKey || e.ctrlKey;
    let handled = true;
    if (e.key === "Escape" && isHelpOpen()) {
      e.stopPropagation(); // Esc closes the sheet before the panel.
      closeHelp();
    } else if (mod && e.key === "/") toggleHelp();
    else if (mod && !e.shiftKey && e.key === "t") void create();
    else if (mod && !e.shiftKey && e.key === "w") void close(activeId);
    else if (mod && /^[1-9]$/.test(e.key)) {
      const id = order[Number(e.key) - 1];
      if (id) select(id);
    } else if (e.ctrlKey && e.key === "Tab") cycle(e.shiftKey ? -1 : 1);
    else if (e.metaKey && e.shiftKey && (e.key === "]" || e.key === "}")) cycle(1);
    else if (e.metaKey && e.shiftKey && (e.key === "[" || e.key === "{")) cycle(-1);
    else handled = false;
    if (handled) e.preventDefault();
  },
  { capture: true },
);

// --- startup --------------------------------------------------------------

order = await invoke<string[]>("list_tabs");
const texts = await Promise.all(order.map((id) => invoke<string>("load_note", { id })));
order.forEach((id, i) => {
  states.set(id, editor.stateFor(texts[i]));
});

let remembered: string | null = null;
try {
  remembered = localStorage.getItem(ACTIVE_KEY);
} catch {
  // Fall back to the first tab.
}
select(remembered && states.has(remembered) ? remembered : order[0]);

// A reminder fired: its status changes to "sent".
void listen("reminders-changed", () => void refreshReminders());

// --- footer ---------------------------------------------------------------

/** Footer buttons act on mousedown and keep focus (and the caret) in the editor. */
function footerButton(selector: string, run: (button: HTMLButtonElement) => void): void {
  const button = requireEl<HTMLButtonElement>(selector);
  button.addEventListener("mousedown", (e) => {
    e.preventDefault();
    run(button);
  });
}

applyTheme(requireEl<HTMLButtonElement>("#theme"));
footerButton("#theme", cycleTheme);
footerButton("#text-size", () => cycleFontSize(editor.view));
footerButton("#help", toggleHelp);

// --- show / hide ----------------------------------------------------------

// Flush pending saves whenever the panel loses focus or hides.
window.addEventListener("blur", flush);
window.addEventListener("focus", () => editor.view.focus());
// Fade in each time the panel is summoned (not on every refocus).
void listen("panel-shown", () => {
  document.body.classList.remove("appear");
  void document.body.offsetWidth; // Restart the animation.
  document.body.classList.add("appear");
});
