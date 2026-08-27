// modules/directory/tokens/store.ts
import { createSignal } from "solid-js";
import type { GuestToken } from "./api";

// Which token the editor is on: null = closed, 0 = a new one, >0 = editing.
// Module-level so the section header's "New guest" button and the form itself
// stay in step.
const [editing, setEditing] = createSignal<GuestToken | 0 | null>(null);

export { editing, setEditing };
