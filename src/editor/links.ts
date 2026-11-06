// ⌘-click (Ctrl-click on Linux) opens http(s) links in the browser.

import { syntaxTree } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { openUrl } from "@tauri-apps/plugin-opener";

function urlAt(view: EditorView, pos: number): string | null {
  let node = syntaxTree(view.state).resolveInner(pos, 1);
  for (let n: typeof node | null = node; n; n = n.parent) {
    if (n.name === "URL") return view.state.sliceDoc(n.from, n.to);
    if (n.name === "Link" || n.name === "Autolink") {
      const url = n.getChild("URL");
      if (url) return view.state.sliceDoc(url.from, url.to);
    }
    node = n;
  }
  return null;
}

export const links = EditorView.domEventHandlers({
  mousedown(e, view) {
    if (!(e.metaKey || e.ctrlKey) || e.button !== 0) return false;
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos === null) return false;
    const url = urlAt(view, pos);
    if (!url || !/^https?:\/\//i.test(url)) return false;
    e.preventDefault();
    openUrl(url).catch((err) => console.error("open link failed:", err));
    return true;
  },
});
