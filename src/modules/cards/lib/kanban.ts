// Kanban board state that has to outlive a single component: which view the
// cards page is showing, and the fixed category that puts a card on the board.

import { createSignal } from "solid-js";

/** The board a channel has before it configures any — also the pre-multi-board one. */
export const DEFAULT_BOARD = "kanban";

/** Cards with no deck, or a deck that isn't one of the configured columns. */
export const UNFILED = "";

const STORAGE_KEY = "hz-cards-view";

export type BoardView = "board" | "kanban";

const stored = (): BoardView =>
  localStorage.getItem(STORAGE_KEY) === "kanban" ? "kanban" : "board";

const [boardView, setBoardViewSignal] = createSignal<BoardView>(stored());
export { boardView };

export function setBoardView(view: BoardView) {
  localStorage.setItem(STORAGE_KEY, view);
  setBoardViewSignal(view);
}
