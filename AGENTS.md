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

- 2026-11-08: inline decorations are drawn by CSS (marks, line classes,
  `::after` from a line attribute), never by `Decoration.widget`/`replace`
  next to editable text. Measured: WebKitGTK 2.54 aborted the web process
  (SIGABRT) when typing on the line below the inline-math answer widget, and
  earlier when `- ` became a replacing bullet widget; reproduced and verified
  by driving the editor in a real WebKitGTK view (python `gi` WebKit2 4.1,
  `document.execCommand('insertText')`, `web-process-terminated` signal).
  Chrome never crashed. Guards against: shipping widget code that only
  breaks on Linux. The task checkbox followed (2026-11-08): deleting a
  selection across a `- [ ]` replace widget aborted the web process (4 of 400
  random deletes over a real note; 0 after drawing it from a mark). The
  reminder status after a line is the one remaining widget.
- 2026-11-08: Linux ships the bare `noted` binary (tar.gz) in the same
  release as macOS; no .deb, AppImage or .rpm. Only macOS and Linux/Wayland
  are supported. Guards against: rpm rejecting pre-release versions, which
  left alpha.1 and alpha.2 without a Linux build.

- 2026-11-08: brand is a typographic n from Newsreader (SIL OFL), kept as
  vector outlines in `src-tauri/icons/source/` and rendered by
  `scripts/icons`. Notes are set in Newsreader too, shipped in `src/fonts/`:
  Charter is not installed on Linux, so notes fell back to whatever serif
  was there. Look: graphite, no accent, near-white text; the active tab is
  one shape with the page. Chosen by the owner from local mockups of four
  directions, then eight icons, then six serifs.
- 2026-11-08: on Linux the tray uses tray-icon's ksni backend
  (StatusNotifierItem over D-Bus), not Tauri's default libappindicator:
  libappindicator never reports a left click, so clicking the icon did
  nothing. Checked by calling `Activate` on the item with busctl: the panel
  opened and took focus. ksni also sends the icon as pixels, so Quickshell no
  longer caches a stale icon file by tray id. macOS uses a template image so
  the menu bar tints it; Linux gets a white n for a dark bar.
- 2026-11-10: on Linux the binary writes its own launcher icon at startup
  (`$XDG_DATA_HOME/icons/hicolor/{128x128,256x256}/apps/noted.png`, only
  when the bytes differ). The release ships only the binary, so the icon
  copied there by hand on 11-07 was still the Tauri scaffold icon after the
  rebrand. Guards against: an icon change that never reaches the launcher.
- 2026-11-12: the Linux launcher sizes (`32x32`, `128x128`, `128x128@2x`)
  are rendered with the tile at 896/1024 of the canvas, not the source's
  824/1024. Measured on the owner's machine: the icon theme draws Slack,
  Chrome and Zen at 896/1024, so Noted at Apple's 824 sat smaller beside
  them. `icon.png` and `icon.icns` keep 824, which is what macOS expects.
  `scripts/icons` does the scaling from the one source SVG.
- 2026-11-12: the Linux tray n is scaled to 0.925 of its first size, 24.5%
  ink, so it weighs the same as the owner's other tray icons (jb-toolkit
  R10: 22%, up to 25% for a compact mark). At 28.7% it looked oversized
  in the tray and at 22% a little small, both checked by eye. The macOS
  template image is unchanged.
- 2026-11-10: release-please uses `"versioning": "prerelease"`. With the
  default strategy, two fixes on `0.1.0-alpha.4` became `0.1.1-alpha.4`
  (patch bumped, prerelease suffix kept). Forcing the version with an empty
  `Release-As:` commit did not work either: the rebase merge dropped the
  empty commit, so release-please never saw it. Guards against: a release
  PR that skips the next alpha.

## Project rules

- Releases use release-please, not `jb bump` / `jb tag` (exception to R4.3):
  it already bumps `Cargo.toml`, `Cargo.lock` and `package.json` together,
  writes `CHANGELOG.md` and tags on merge. `release.yml` still refuses a tag
  that disagrees with `.toolkit/version`.
- Pull requests are rebase-merged (R3.5), one commit each, so the commit
  release-please reads matches the PR title CI validates. GitHub refuses
  squash merges here since 2026-11-10.
- Release PRs (opened by release-please) get no CI run, because GitHub does
  not trigger workflows for PRs the Actions token opens: close and reopen the
  PR to run CI, never `--admin`. Merge with `gh pr merge --rebase`: the old
  squash merges wrote `Co-authored-by:` trailers into the commit (R3.4). Two
  such trailers already sit in `main`'s history (alpha.1, alpha.2 release
  commits) and are left there, since rewriting tagged history costs more;
  `jb check` reports them.
- To rebuild one platform for an existing release, run the Release workflow
  by hand with the tag and platform.

Every agent follows the shared rules in `.toolkit/RULES.md` (managed by jb-toolkit); deliberate exceptions are in `.jb-exceptions`.
