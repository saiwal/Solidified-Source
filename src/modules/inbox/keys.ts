// Gmail-style keyboard handling for the inbox list.
//
// Bound to the scroll container (which carries tabindex="0"), not to window:
// the same MessageList renders inside HQ's widgets, where these keys would
// hijack typing elsewhere on the dashboard.
import type { MessageEntry } from "@utsukta/spa-core/lib/message-store";

export interface InboxKeyCtx {
  rows: () => MessageEntry[];
  cursor: () => number;
  setCursor: (i: number) => void;
  open: (e: MessageEntry) => void;
  star: (e: MessageEntry) => void;
  trash: (e: MessageEntry) => void;
  toggleRead: (e: MessageEntry) => void;
  toggleSelect: (e: MessageEntry) => void;
  clearSelection: () => void;
  focusSearch?: () => void;
}

/** True when the event came from somewhere the user is typing. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable;
}

export function createInboxKeys(ctx: InboxKeyCtx) {
  return (e: KeyboardEvent): void => {
    if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

    const rows = ctx.rows();
    const at = ctx.cursor();
    const current = rows[at];
    const move = (delta: number) => {
      if (!rows.length) return;
      // Clamped, not wrapping: wrapping from the last row back to the top of a
      // paginated list reads as a scroll jump, not as navigation.
      ctx.setCursor(Math.min(rows.length - 1, Math.max(0, at + delta)));
    };

    switch (e.key) {
      case "j": case "ArrowDown": move(1); break;
      case "k": case "ArrowUp": move(-1); break;
      case "Enter": case "o": if (current) ctx.open(current); break;
      case "s": if (current) ctx.star(current); break;
      case "e": if (current) ctx.trash(current); break;
      case "u": if (current) ctx.toggleRead(current); break;
      case "x": if (current) ctx.toggleSelect(current); break;
      case "/": ctx.focusSearch?.(); break;
      case "Escape": ctx.clearSelection(); return; // no preventDefault: Esc also closes panels
      default: return;
    }
    e.preventDefault();
  };
}
