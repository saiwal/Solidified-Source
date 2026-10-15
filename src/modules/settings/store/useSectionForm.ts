import { useQuery, useMutation, useQueryClient } from "@utsukta/spa-core/lib/query";
import { toast } from "@utsukta/spa-core/store/toast";

/**
 * Generic hook for a settings section form.
 *
 * - Loads data via TanStack Query under ["settings", section].
 * - `handleSubmit` collects FormData, coerces numeric fields, runs the save
 *   mutation, then invalidates the section cache (or reloads if `reloadOn`
 *   predicate returns true).
 *
 * Usage:
 *   const { data, saving, handleSubmit } = useSectionForm({
 *     section: "display",
 *     fetcher: fetchDisplaySettings,
 *     saver: saveDisplaySettings,
 *     numericFields: ["thread_allow", "itemspage", ...],
 *     reloadOn: (prev, next) => prev?.theme !== next.theme,
 *   });
 */
export function useSectionForm<T extends object>(options: {
  section: string;
  fetcher: () => Promise<T>;
  saver: (data: Partial<T>) => Promise<void>;
  numericFields?: string[];
  checkboxFields?: string[];
  reloadOn?: (prev: T | undefined, next: Partial<T>) => boolean;
  /** Called with the saved payload on success — for patching cross-cutting
   *  client state (e.g. auth-store flags) that other components read. */
  onSaved?: (payload: Partial<T>) => void;
}) {
  const {
    section,
    fetcher,
    saver,
    numericFields = [],
    checkboxFields = [],
    reloadOn,
    onSaved,
  } = options;

  const queryClient = useQueryClient();

  const query = useQuery(() => ({
    queryKey: ["settings", section] as const,
    queryFn: fetcher,
    // These forms are uncontrolled inputs seeded from the fetched data — a
    // background refetch mid-edit would clobber unsaved user input.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  }));

  const save = useMutation(() => ({
    mutationFn: (payload: Partial<T>) => saver(payload),
    onSuccess: (_res: void, payload: Partial<T>) => {
      if (reloadOn?.(query.data, payload)) {
        window.location.reload();
        return;
      }
      onSaved?.(payload);
      toast.success("Saved");
      queryClient.invalidateQueries({ queryKey: ["settings", section] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Save failed");
    },
  }));

  function handleSubmit(e: Event) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const raw = Object.fromEntries(new FormData(form)) as Record<
      string,
      string
    >;

    for (const f of checkboxFields) {
      if (!(f in raw)) raw[f] = "0";
    }
    // Coerce declared numeric fields; leave the rest as strings
    const payload = Object.fromEntries(
      Object.entries(raw).map(([k, v]) =>
        numericFields.includes(k) ? [k, Number(v)] : [k, v],
      ),
    ) as Partial<T>;

    save.mutate(payload);
  }

  return {
    data: () => query.data,
    saving: () => save.isPending,
    handleSubmit,
  };
}
