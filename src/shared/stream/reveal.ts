// src/shared/stream/reveal.ts
//
// use:reveal={post.uuid} — slides a stream card up into place the first time
// it scrolls into view. Mount-time CSS alone isn't enough: infinite scroll
// appends below the fold, so the animation would finish before anyone saw it.
//
// Once per uuid per session (`shown`): switching views, a column-count change
// or masonry's column reshuffle on prepend all remount cards, and none of
// those should replay the entrance. Also tracks which uuids are on screen
// (`visibleUuids`) so the stream's live-count poll asks only about those.
import { onCleanup, createSignal } from "solid-js";

// ponytail: grows by one short string per post seen, never trimmed — a few
// KB over a long session; cap it if sessions ever run to tens of thousands.
const shown = new Set<string>();

// A reloaded stream (new sort/filter) is a new list: let every card enter
// again. Ranked sorts mostly reshuffle posts already seen under "Latest", so
// keeping the set across reloads made them all skip the entrance.
export function resetReveal() {
  shown.clear();
}
export const visibleUuids = new Set<string>();

const STAGGER_MS = 50;
const STAGGER_MAX = 8;
const IMG_WAIT_MAX_MS = 1500;

const uuidOf = new WeakMap<Element, string>();

let observer: IntersectionObserver | undefined;
function getObserver() {
  return (observer ??= new IntersectionObserver((entries) => {
    let batch = 0;
    for (const e of entries) {
      const uuid = uuidOf.get(e.target);
      if (uuid === undefined) continue; // "" is a real (if broken) key
      if (!e.isIntersecting) {
        visibleUuids.delete(uuid);
        continue;
      }
      visibleUuids.add(uuid);
      const el = e.target as HTMLElement;
      if (!el.hasAttribute("data-hz-reveal")) continue;
      shown.add(uuid);
      const play = () => {
        // Image tiles can call this twice (load + timeout cap); the second
        // must not re-add the class after animationend removed it.
        if (!el.hasAttribute("data-hz-reveal")) return;
        el.removeAttribute("data-hz-reveal");
        el.classList.add("animate-hz-reveal");
        // Drop the class once played: a CSS animation restarts whenever its
        // element is re-inserted (Suspense swapping children out on a focus
        // refetch), which replayed the entrance on returning to the tab.
        const done = (e: AnimationEvent) => {
          if (e.target !== el) return; // a child's animation bubbling up
          el.classList.remove("animate-hz-reveal");
          el.removeEventListener("animationend", done);
        };
        el.addEventListener("animationend", done);
      };
      // data-reveal-wait (CardShell waitForImage): photo tiles are blank boxes
      // until their lazy image lands, so sliding them in early shows nothing.
      // Hold until it loads, capped so a slow/broken image can't hide a tile.
      const img = el.dataset.revealWait !== undefined ? el.querySelector("img") : null;
      if (img && !img.complete) {
        img.addEventListener("load", play, { once: true });
        img.addEventListener("error", play, { once: true });
        setTimeout(play, IMG_WAIT_MAX_MS);
        continue;
      }
      el.style.animationDelay = `${Math.min(batch++, STAGGER_MAX) * STAGGER_MS}ms`;
      play();
    }
  }));
}

const els = new Map<string, HTMLElement>();
// view-transition-name per uuid while a prepend transition is running.
const transitionNames = new Map<string, string>();

function nameCard(el: HTMLElement, name: string) {
  el.style.setProperty("view-transition-name", name);
  el.style.setProperty("view-transition-class", "hz-card");
}

export function reveal(el: HTMLElement, uuid: () => string) {
  const id = uuid();
  uuidOf.set(el, id);
  els.set(id, el);
  // Hidden synchronously: the observer's first callback is async, so adding
  // it there would paint the card once before hiding it. An attribute, not a
  // class: a ref runs before Solid's spread assigns props, so CardShell's
  // `class` prop would overwrite className and silently drop a class here.
  if (!shown.has(id)) el.setAttribute("data-hz-reveal", "");
  // Masonry/Scrapbook re-deal columns on a prepend, remounting a moved card
  // as a new element; it inherits the name so the transition still pairs it
  // with its old position instead of cross-fading.
  const name = transitionNames.get(id);
  if (name) nameCard(el, name);
  getObserver().observe(el);
  onCleanup(() => {
    observer?.unobserve(el);
    visibleUuids.delete(id);
    if (els.get(id) === el) els.delete(id);
  });
}

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Inserts posts above the current top one. With the top of the stream on
// screen, a view transition slides the visible cards down (or across
// columns) to make room while the new ones reveal into the gap. Scrolled
// away, the insert happens off-screen and we scroll up to the first new card
// — the "↑ N new posts" pill promises that — which reveals as it arrives.
export function prependWithMotion(update: () => void, oldTop: string | undefined, newTop: string) {
  if (oldTop && !visibleUuids.has(oldTop)) {
    update();
    els.get(newTop)?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
    return;
  }
  if (!("startViewTransition" in document) || reducedMotion() || transitionNames.size) return update();
  // Only on-screen cards get names: every named element is snapshotted, and
  // a long scrolled stream would mean hundreds of them.
  [...visibleUuids].forEach((u, i) => transitionNames.set(u, `hz-card-${i}`));
  transitionNames.forEach((name, u) => { const el = els.get(u); if (el) nameCard(el, name); });
  document.startViewTransition(() => {
    update();
    // Scroll anchoring would otherwise hold the old top card still and park
    // the new posts just above the viewport when the page is scrolled a bit.
    // Done inside the update, so it's part of the animated-to state.
    els.get(newTop)?.scrollIntoView({ block: "nearest" });
  }).finished.finally(() => {
    transitionNames.forEach((_, u) => {
      els.get(u)?.style.removeProperty("view-transition-name");
      els.get(u)?.style.removeProperty("view-transition-class");
    });
    transitionNames.clear();
  });
}

// ── exit ─────────────────────────────────────────────────────────────────────

export const EXIT_MS = 280;
const [exiting, setExiting] = createSignal<ReadonlySet<string>>(new Set());
export const isExiting = (uuid: string) => exiting().has(uuid);

// Animates a card out (CardShell's <Presence> exit), then runs `remove` to
// drop it from the store. Two steps because <For> disposing an item disposes
// its <Presence> too — the exit only plays if the card's <Show> flips first
// while its Presence is still mounted. Off-screen cards just go.
export function exitCard(uuid: string, remove: () => void) {
  const el = els.get(uuid);
  if (!el || !visibleUuids.has(uuid) || reducedMotion()) return remove();
  // Contains the card's own bottom margin while the height collapses; set
  // here because the <Show> flipping disposes any reactive class binding.
  el.style.overflow = "hidden";
  setExiting((s) => new Set(s).add(uuid));
  setTimeout(() => {
    remove();
    setExiting((s) => {
      const next = new Set(s);
      next.delete(uuid);
      return next;
    });
  }, EXIT_MS + 50);
}
