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
      close.textContent = "×";
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
  add.textContent = "+";
  add.title = "New tab  (⌘T)";
  add.setAttribute("aria-label", "New tab");
  add.addEventListener("mousedown", (e) => {
    e.preventDefault();
    onCreate();
  });
  return add;
}
