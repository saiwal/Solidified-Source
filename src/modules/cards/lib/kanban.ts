// Kanban board state that has to outlive a single component: which view the
// cards page is showing, and the fixed category that puts a card on the board.

import { persistedSignal, oneOf } from "@utsukta/spa-core/lib/persisted";

/** Cards with no deck, or a deck that isn't one of the configured columns. */
export const UNFILED = "";

export type BoardView = "board" | "kanban";

const [boardView, setBoardView] = persistedSignal<BoardView>(
  "hz-cards-view",
  "board",
  oneOf<BoardView>("board", "kanban"),
);
export { boardView, setBoardView };
