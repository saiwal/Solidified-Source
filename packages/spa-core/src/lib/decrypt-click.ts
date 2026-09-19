// shared/lib/decrypt-click.ts
// Shared click-delegation logic for the "🔒 Encrypted content" button
// bbcodeDisplay() produces for a [crypt]...[/crypt] payload (see bbcode.ts).
// Every component that renders post/page/block body via innerHTML must wire
// this into its click handler, or the button renders inert — mirrors nsfw.ts's
// handleNsfwToggleClick, which has the same contract for the NSFW reveal toggle.
// Returns true if the click was a decrypt-button click (callers should
// stopPropagation()/return early in that case).

import DOMPurify from "dompurify";
import { decryptPayload, getPayloadHint } from "./postCrypto";
import { bbcodeDisplay } from "./renderBody";

export function handleDecryptClick(e: MouseEvent): boolean {
  const btn = (e.target as HTMLElement).closest<HTMLElement>(
    "[data-crypt-payload]",
  );
  if (!btn) return false;
  e.stopPropagation();

  const payload = btn.dataset.cryptPayload ?? "";
  const hint = getPayloadHint(payload);

  const form = document.createElement("form");
  form.className = "hz-decrypt-form flex flex-col gap-2 my-1";

  const hintHtml = DOMPurify.sanitize(hint || "Enter passphrase");
  form.innerHTML = `
    <span class="text-muted text-xs">🔒 ${hintHtml}</span>
    <div class="flex items-center gap-2">
      <input type="password" placeholder="Passphrase" autofocus
        class="hz-decrypt-input flex-1 bg-surface border border-rim rounded px-2 py-1 text-sm text-txt outline-none focus:border-rim-strong" />
      <button type="submit"
        class="px-3 py-1 rounded bg-accent text-accent-fg text-xs font-semibold hover:opacity-90 whitespace-nowrap">
        Decrypt
      </button>
      <button type="button" class="hz-decrypt-cancel px-2 py-1 rounded text-muted hover:text-txt text-xs">
        Cancel
      </button>
    </div>
    <span class="hz-decrypt-error text-xs text-red-400 hidden"></span>
  `;

  btn.replaceWith(form);
  form.querySelector<HTMLInputElement>(".hz-decrypt-input")?.focus();

  form.querySelector(".hz-decrypt-cancel")?.addEventListener("click", () => {
    form.replaceWith(btn);
  });

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const password =
      form.querySelector<HTMLInputElement>(".hz-decrypt-input")?.value ?? "";
    const submitBtn = form.querySelector<HTMLButtonElement>(
      "button[type=submit]",
    );
    const errorEl = form.querySelector<HTMLElement>(".hz-decrypt-error");
    if (!password) return;
    if (submitBtn) {
      submitBtn.textContent = "Decrypting…";
      submitBtn.disabled = true;
    }

    try {
      const plain = await decryptPayload(payload, password);
      const html = DOMPurify.sanitize(bbcodeDisplay(plain));
      const div = document.createElement("div");
      div.innerHTML = html;
      form.replaceWith(div);
    } catch (err) {
      if (errorEl) {
        errorEl.textContent =
          err instanceof Error ? err.message : "Decryption failed";
        errorEl.classList.remove("hidden");
      }
      if (submitBtn) {
        submitBtn.textContent = "Decrypt";
        submitBtn.disabled = false;
      }
    }
  });

  return true;
}
