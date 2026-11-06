// Light / dark / system appearance, cycled from the footer like Wisp.

import { getCurrentWindow } from "@tauri-apps/api/window";

export type ThemeMode = "light" | "dark" | "system";

const KEY = "noted.theme";
const CYCLE: Record<ThemeMode, ThemeMode> = { light: "dark", dark: "system", system: "light" };

// Tiny inline icons: sun, moon, half-filled circle.
const ICONS: Record<ThemeMode, string> = {
  light:
    '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1"/>',
  dark: '<path d="M13 9.6A5.5 5.5 0 0 1 6.4 3a5.5 5.5 0 1 0 6.6 6.6Z"/>',
  system:
    '<circle cx="8" cy="8" r="5.5"/><path d="M8 2.5v11a5.5 5.5 0 0 0 0-11Z" fill="currentColor"/>',
};

const LABEL: Record<ThemeMode, string> = { light: "Light", dark: "Dark", system: "System" };

function read(): ThemeMode {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

/** Applies a mode to the page, the native window material, and the button. */
export function applyTheme(button: HTMLButtonElement, mode: ThemeMode = read()): void {
  const root = document.documentElement;
  if (mode === "system") delete root.dataset.theme;
  else root.dataset.theme = mode;
  getCurrentWindow()
    .setTheme(mode === "system" ? null : mode)
    .catch((e) => console.error("set theme failed:", e));

  const next = CYCLE[mode];
  button.innerHTML = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true">${ICONS[mode]}</svg>`;
  button.title = `${LABEL[mode]} appearance. Click for ${LABEL[next].toLowerCase()}`;
  button.setAttribute("aria-label", button.title);
}

export function cycleTheme(button: HTMLButtonElement): void {
  const next = CYCLE[read()];
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Applied for this session only.
  }
  applyTheme(button, next);
}
