import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

const SAVE_DELAY_MS = 300;

function requireEl<T extends HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`${selector} missing`);
  return el;
}

const editor = requireEl<HTMLTextAreaElement>("#editor");
const words = requireEl<HTMLSpanElement>("#words");
const panel = getCurrentWindow();
let timer: number | undefined;

function save(): void {
  window.clearTimeout(timer);
  timer = undefined;
  invoke("save_note", { text: editor.value }).catch((e) => console.error("save failed:", e));
}

function updateWordCount(): void {
  const n = editor.value.split(/\s+/).filter(Boolean).length;
  words.textContent = `${n} ${n === 1 ? "word" : "words"}`;
}

editor.addEventListener("input", () => {
  updateWordCount();
  window.clearTimeout(timer);
  timer = window.setTimeout(save, SAVE_DELAY_MS);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    panel.hide();
  }
});

// Flush a pending save whenever the panel loses focus or hides.
window.addEventListener("blur", () => {
  if (timer !== undefined) save();
});
window.addEventListener("focus", () => editor.focus());

editor.value = await invoke<string>("load_note");
updateWordCount();
editor.focus();
