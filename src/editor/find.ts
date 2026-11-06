// Compact find bar (⌘F): a pill in the top-right with a match count.

import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  SearchQuery,
  search,
  setSearchQuery,
} from "@codemirror/search";
import type { EditorState } from "@codemirror/state";
import type { EditorView, Panel, ViewUpdate } from "@codemirror/view";

const MAX_COUNT = 999;

/** "3/12", "none", or "" for an empty query. */
function countLabel(state: EditorState): string {
  const query = getSearchQuery(state);
  if (!query.search || !query.valid) return "";
  const { from } = state.selection.main;
  let total = 0;
  let current = 0;
  const cursor = query.getCursor(state);
  for (let m = cursor.next(); !m.done && total < MAX_COUNT; m = cursor.next()) {
    total++;
    if (m.value.from === from) current = total;
  }
  if (total === 0) return "none";
  return current ? `${current}/${total}` : String(total);
}

function iconButton(label: string, path: string, run: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "find-btn";
  b.title = label;
  b.setAttribute("aria-label", label);
  b.innerHTML = `<svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
  b.addEventListener("mousedown", (e) => {
    e.preventDefault();
    run();
  });
  return b;
}

function createFindPanel(view: EditorView): Panel {
  const dom = document.createElement("div");
  dom.className = "find-bar";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Find";
  input.setAttribute("main-field", "true"); // CodeMirror focuses this on ⌘F.
  input.setAttribute("aria-label", "Find");
  input.value = getSearchQuery(view.state).search;

  const count = document.createElement("span");
  count.className = "find-count";

  const commit = () => {
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: input.value })) });
  };
  input.addEventListener("input", () => {
    commit();
    findNext(view);
    input.focus();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.shiftKey ? findPrevious : findNext)(view);
      input.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeSearchPanel(view);
      view.focus();
    }
  });

  const divider = document.createElement("span");
  divider.className = "find-divider";

  dom.append(
    input,
    count,
    divider,
    iconButton("Previous match (⇧↵)", "M3 7.5 6 4.5l3 3", () => findPrevious(view)),
    iconButton("Next match (↵)", "M3 4.5 6 7.5l3-3", () => findNext(view)),
    iconButton("Close (Esc)", "M3.5 3.5l5 5M8.5 3.5l-5 5", () => {
      closeSearchPanel(view);
      view.focus();
    }),
  );

  return {
    dom,
    top: true,
    mount: () => {
      count.textContent = countLabel(view.state);
      input.select();
    },
    update: (u: ViewUpdate) => {
      const query = getSearchQuery(u.state);
      if (query.search !== input.value && document.activeElement !== input) {
        input.value = query.search;
      }
      count.textContent = countLabel(u.state);
    },
  };
}

export const find = search({ top: true, createPanel: createFindPanel });
