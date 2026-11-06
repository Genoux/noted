import { invoke } from "@tauri-apps/api/core";

const SAVE_DELAY_MS = 300;

function requireEditor(): HTMLTextAreaElement {
  const el = document.querySelector<HTMLTextAreaElement>("#editor");
  if (!el) throw new Error("#editor missing");
  return el;
}

const editor = requireEditor();
let timer: number | undefined;

function save(): void {
  window.clearTimeout(timer);
  timer = undefined;
  invoke("save_note", { text: editor.value }).catch((e) => console.error("save failed:", e));
}

editor.addEventListener("input", () => {
  window.clearTimeout(timer);
  timer = window.setTimeout(save, SAVE_DELAY_MS);
});

// Flush a pending save when the window loses focus or closes.
window.addEventListener("blur", () => {
  if (timer !== undefined) save();
});

editor.value = await invoke<string>("load_note");
editor.focus();
