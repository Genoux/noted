// The tab strip: renders tabs and reports clicks. Owns no note data.

export interface TabView {
  id: string;
  title: string;
}

export interface TabStripHandlers {
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onCreate: () => void;
}

export function renderTabs(
  strip: HTMLElement,
  tabs: TabView[],
  activeId: string,
  handlers: TabStripHandlers,
): void {
  strip.replaceChildren(
    ...tabs.map((tab, i) => {
      const el = document.createElement("div");
      el.className = "tab";
      el.setAttribute("role", "tab");
      el.setAttribute("aria-selected", String(tab.id === activeId));
      el.title = i < 9 ? `${tab.title}  (⌘${i + 1})` : tab.title;
      el.addEventListener("mousedown", (e) => {
        if (e.button === 1) handlers.onClose(tab.id);
        else if (e.button === 0) handlers.onSelect(tab.id);
      });

      const label = document.createElement("span");
      label.className = "tab-label";
      label.textContent = tab.title;

      const close = document.createElement("button");
      close.className = "tab-close";
      close.type = "button";
      close.append(icon("M4 4l8 8M12 4l-8 8", 10));
      close.setAttribute("aria-label", `Close ${tab.title}`);
      close.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        handlers.onClose(tab.id);
      });

      el.append(label, close);
      return el;
    }),
    newTabButton(handlers.onCreate),
  );
}

function newTabButton(onCreate: () => void): HTMLButtonElement {
  const add = document.createElement("button");
  add.className = "tab-new";
  add.type = "button";
  add.append(icon("M8 3v10M3 8h10", 12));
  add.title = "New tab  (⌘T)";
  add.setAttribute("aria-label", "New tab");
  add.addEventListener("mousedown", (e) => {
    e.preventDefault();
    onCreate();
  });
  return add;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** A stroked 16×16 icon drawn at `size` px, so it centres exactly (a "×" glyph sits on the font's baseline). */
function icon(path: string, size: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  const line = document.createElementNS(SVG_NS, "path");
  line.setAttribute("d", path);
  line.setAttribute("stroke", "currentColor");
  line.setAttribute("stroke-width", "1.6");
  line.setAttribute("stroke-linecap", "round");
  line.setAttribute("fill", "none");
  svg.append(line);
  return svg;
}
