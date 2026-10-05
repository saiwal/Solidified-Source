import { createSignal } from "solid-js";
import { fetchNotes, deleteNote, type Note, type NoteFilters } from "./api";
import { toast } from "@utsukta/spa-core/store/toast";
import { resetReveal, exitCard } from "@/shared/stream/reveal";

const PAGE_SIZE = 20;

const [notes, setNotes]     = createSignal<Note[]>([]);
const [loading, setLoading] = createSignal(false);
const [hasMore, setHasMore] = createSignal(false);
const [offset, setOffset]   = createSignal(0);
const [filters, setFilters] = createSignal<NoteFilters>({});

export { notes, loading, hasMore, filters };

export async function loadNotes(reset = false, nextFilters?: NoteFilters) {
  if (nextFilters !== undefined) setFilters(nextFilters);
  if (reset) {
    setOffset(0);
    setNotes([]);
  }
  setLoading(true);
  try {
    const res = await fetchNotes(reset ? 0 : offset(), PAGE_SIZE, filters());
    const items = res.data ?? [];
    // A fresh list (new filter) replays the card entrance, as streams do.
    if (reset) resetReveal();
    setNotes(reset ? items : [...notes(), ...items]);
    setHasMore(res.meta?.has_more ?? false);
    setOffset((reset ? 0 : offset()) + items.length);
  } catch (e: any) {
    toast.error(e.message ?? "Failed to load notes");
  } finally {
    setLoading(false);
  }
}

export async function removeNote(note: { mid: string; uuid: string }) {
  const prev = notes();
  // Same fade-and-collapse as a deleted stream post (CardShell's exit).
  exitCard(note.uuid, () => setNotes((cur) => cur.filter((n) => n.mid !== note.mid)));
  try {
    await deleteNote(note.uuid);
  } catch (e: any) {
    setNotes(prev);
    toast.error(e.message ?? "Delete failed");
  }
}
