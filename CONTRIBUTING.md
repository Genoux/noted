# Contributing

## Workflow

1. Branch from `main`: `feat/tabs`, `fix/save-race`, `chore/deps`.
2. Open a PR. `main` is protected: no direct pushes, CI must pass, history stays linear.
3. PRs are **squash-merged**. The PR title becomes the commit on `main`.

## Commits and PR titles

[Conventional Commits](https://www.conventionalcommits.org), kept short:

```
<type>(<optional scope>): <lowercase subject, ≤ 60 chars>
```

Types: `feat` `fix` `perf` `refactor` `docs` `test` `build` `ci` `chore`.
Breaking change: add `!` (`feat!: ...`).

- One line is the norm. Add a body only when the _why_ isn't obvious.
- No trailing period, imperative mood: `fix: keep caret on reload`, not `Fixed caret.`

CI rejects PR titles that don't match.

## Before pushing

```sh
pnpm lint && pnpm build
cargo fmt --all && cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

## Code rules

- Logic that doesn't need the OS or UI goes in `crates/core`, with tests.
- No `unwrap()` outside tests; no `unsafe`. Errors reach the UI as messages, never panics.
- Writes to user notes are atomic. Never risk data loss.
- New dependencies need a reason in the PR description.

## Releases

Fully automated with [release-please](https://github.com/googleapis/release-please):

1. Merging to `main` keeps a **release PR** open with the next version and `CHANGELOG.md`.
2. Version follows SemVer from commit types: `fix` → patch, `feat` → minor (pre-1.0), `!` → major.
3. Merging the release PR tags `vX.Y.Z`, creates the GitHub Release and attaches
   macOS (`.dmg`, universal) and Linux (`.AppImage`, `.deb`, `.rpm`) builds.

Never create tags or bump versions by hand.
