// LCARS has one palette, so colour schemes don't apply in this theme. Every
// path that applies one (a saved pref at boot, a visited channel's scheme,
// the channel-create wizard, a cross-fade switch) ends in useTheme writing
// <html data-theme> and .dark — and scheme-specific CSS keys off data-theme
// (Sketchy's fonts and corners, the custom scheme's injected block). Pinning
// the attribute here keeps all of that from matching, now and for any
// scheme added later, without solidified knowing about LCARS. The observer
// writes only on a difference, so its own write doesn't loop.
const root = document.documentElement;

function pin(): void {
  if (root.getAttribute("data-theme") !== "lcars") root.setAttribute("data-theme", "lcars");
  if (!root.classList.contains("dark")) root.classList.add("dark");
}

pin();
new MutationObserver(pin).observe(root, { attributes: true, attributeFilter: ["data-theme", "class"] });
