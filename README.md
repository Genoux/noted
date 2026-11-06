# Noted

A quick scratchpad that lives one keypress away. Summon it, jot the thought,
dismiss it. Notes are plain markdown files on disk.

> Working name. Built with Rust + Tauri for macOS and Linux (Wayland first).
> Inspired by [Wisp](https://github.com/sulemaanhamza/wisp).

## Status

Early development. See the [roadmap](#roadmap).

## Develop

Requires Rust (pinned in `rust-toolchain.toml`), Node 22+ and pnpm.
On Linux, also install `libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev`.

```sh
pnpm install
pnpm tauri dev      # run the app
cargo test --workspace
pnpm lint
```

## Layout

| Path          | What lives there                                      |
| ------------- | ----------------------------------------------------- |
| `crates/core` | Platform-independent logic (storage, parsing). No UI. |
| `src-tauri`   | App shell: window, hotkey, tray, IPC commands.        |
| `src`         | Editor frontend (TypeScript).                         |

## Roadmap

1. **MVP (macOS)**: global hotkey, floating panel, tabs, live markdown, checklists, find, tray
2. **Daily driver**: version history, inbox archive, sync folder, themes, fonts
3. **Smart**: reminders, inline maths, emoji shortcodes, auto-update
4. **Linux/Wayland**: `noted toggle` / `noted add`, GlobalShortcuts portal, packaging

## License

MIT. See [LICENSE](LICENSE).
