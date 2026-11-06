import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createEditor } from "./editor/setup";
import { countWords } from "./text";

const SAVE_DELAY_MS = 300;

function requireEl<T extends HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`${selector} missing`);
  return el;
}

const words = requireEl<HTMLSpanElement>("#words");
const panel = getCurrentWindow();
let pending: string | undefined;
let timer: number | undefined;

function flush(): void {
  window.clearTimeout(timer);
  timer = undefined;
  if (pending === undefined) return;
  const text = pending;
  pending = undefined;
  invoke("save_note", { text }).catch((e) => console.error("save failed:", e));
}

function showWordCount(text: string): void {
  const n = countWords(text);
  words.textContent = `${n} ${n === 1 ? "word" : "words"}`;
}

const initial = await invoke<string>("load_note");
const editor = createEditor({
  parent: requireEl("#editor"),
  doc: initial,
  onChange: (text) => {
    showWordCount(text);
    pending = text;
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, SAVE_DELAY_MS);
  },
  onEscape: () => {
    flush();
    panel.hide();
  },
});

showWordCount(initial);
// Flush a pending save whenever the panel loses focus or hides.
window.addEventListener("blur", flush);
window.addEventListener("focus", () => editor.focus());
editor.focus();
