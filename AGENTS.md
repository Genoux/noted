# AGENTS.md

Notes on why noted is built the way it is. Record what was measured or
debugged, and the mistake each decision guards against. The shared rules
(git, commits, releases, local-only demos) are in jb-toolkit's `RULES.md` and
are not repeated here; anything below that departs from them says why.

Read `PRODUCT.md` first.

## Stack

- Rust + Tauri 2 — why: a small native binary for macOS and Linux (Wayland
  first) with a global hotkey and tray, without shipping Chromium.
- TypeScript + Vite + CodeMirror 6 for the editor — why: live markdown
  decorations on a plain-text document, so notes stay plain files on disk.
- pnpm, Biome, Vitest on the web side; clippy, rustfmt, cargo-deny on the Rust side.

## Layout

- `crates/core` — logic that needs neither the OS nor the UI, with tests.
- `src-tauri/` — the Tauri shell: window, hotkey, tray, file IO.
- `src/` — the web UI; `src/editor/` holds the CodeMirror extensions.
- `scripts/check` — format, lint, types, tests. CI runs exactly this.

## Decisions

<!-- - YYYY-MM-DD: decision. Measured: number, how. Guards against: mistake. -->

## Project rules

- Releases use release-please, not `jb bump` / `jb tag` (exception to R4.3):
  it already bumps `Cargo.toml`, `Cargo.lock` and `package.json` together,
  writes `CHANGELOG.md` and tags on merge. `release.yml` still refuses a tag
  that disagrees with `.toolkit/version`.
- Pull requests are squash-merged, not rebased (exception to R3.5): the PR
  title becomes the commit release-please reads, and CI validates that title.
