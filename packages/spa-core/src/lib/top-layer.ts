// Portal target for popups: the topmost open *modal* <dialog>, else <body>.
//
// showModal() puts the dialog in the top layer and makes everything outside
// it inert — so a dropdown portaled to document.body from inside a modal is
// both painted under the backdrop and deaf to clicks ("the dropdown doesn't
// open"). Portaling into the dialog itself keeps it in the top layer while
// still escaping the panel's own overflow/stacking context, which is the
// whole reason these popups portal in the first place.
//
// Non-modal dialogs (the docked composer) are not in the top layer and don't
// inert anything, so <body> stays correct for them.
//
// Read once, when the popup mounts — which is when it opens, so it always
// resolves against the dialog stack as it is at that moment.
export function topLayer(): Element {
  const dialogs = document.querySelectorAll<HTMLDialogElement>("dialog[open]");
  for (let i = dialogs.length - 1; i >= 0; i--) {
    if (dialogs[i].matches(":modal")) return dialogs[i];
  }
  return document.body;
}

// ponytail: "topmost" is approximated by DOM order, not real top-layer
// (showModal call) order — a nested modal is a descendant of its opener here,
// so the two agree. Track the stack in Modal.tsx if that ever stops holding.
