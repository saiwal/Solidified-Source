/**
 * Word-processor list nesting for the WYSIWYG surface (Tab / Shift+Tab).
 *
 * Done by hand rather than execCommand("indent"): Chrome puts the new <ul>
 * directly inside the parent <ul>, as a sibling of the <li>s, and
 * htmlToSource's listItems() only walks direct <li> children — so the nested
 * items would vanish on the next keystroke. Here a nested list always lives
 * inside the <li> above it, the shape bbcode and markdown both spell.
 *
 * Returns false when nothing moved (first item can't indent, a top-level item
 * can't outdent), so the caller still swallows the Tab but skips the sync.
 */

const isList = (n: Node | null): n is HTMLElement =>
  !!n && (n.nodeName === "UL" || n.nodeName === "OL");

/** Tab: make `li` a child of the item above it — bullets stay bullets, ordered levels alternate. */
export function indentListItem(li: HTMLElement): boolean {
  const prev = li.previousElementSibling as HTMLElement | null;
  const list = li.parentElement;
  if (!prev || prev.nodeName !== "LI" || !isList(list)) return false;
  // Join the sub-list the item above already has, if it ends with one.
  let sub = prev.lastElementChild as HTMLElement | null;
  if (!isList(sub)) {
    sub = list.nodeName === "OL" ? nextOrdered(list) : (list.cloneNode(false) as HTMLElement);
    prev.appendChild(sub);
  }
  sub.appendChild(li);
  return true;
}

/**
 * A new ordered sub-level alternates numbering the way word processors do:
 * 1. → a. → 1. The markup is what bbcode.ts renders for [list=a] / [list=1],
 * which htmlToSource's listMarker() reads back.
 */
function nextOrdered(parent: HTMLElement): HTMLElement {
  const ol = parent.ownerDocument.createElement("ol");
  const alpha = /lower-alpha/.test(parent.getAttribute("style") ?? "") || parent.classList.contains("listloweralpha");
  ol.className = alpha ? "listdecimal" : "listloweralpha";
  ol.setAttribute("style", `list-style-type: ${alpha ? "decimal" : "lower-alpha"};`);
  return ol;
}

/**
 * Shift+Tab: lift `li` one level, right after the item that held it. Items
 * below it in the same sub-list become its children, so the visual order
 * never changes.
 */
export function outdentListItem(li: HTMLElement): boolean {
  const list = li.parentElement;
  const parentLi = list?.parentElement;
  if (!isList(list) || !parentLi || parentLi.nodeName !== "LI") return false;
  if (li.nextElementSibling) {
    let sub = li.lastElementChild as HTMLElement | null;
    if (!isList(sub)) {
      sub = list.cloneNode(false) as HTMLElement;
      li.appendChild(sub);
    }
    while (li.nextElementSibling) sub.appendChild(li.nextElementSibling);
  }
  parentLi.after(li);
  if (!list.firstElementChild) list.remove();
  return true;
}
