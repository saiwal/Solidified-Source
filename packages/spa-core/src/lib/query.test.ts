// node --conditions=browser --experimental-strip-types packages/spa-core/src/lib/query.test.ts
//
// An observer update on a query that already has data (here setQueryData;
// in the app the staleTime timer or a refetchInterval tick) must not flip an
// enclosing <Suspense> to its fallback. The raw hook does — that is the bug.
import assert from "node:assert/strict";
import { Suspense, createComputed, createMemo, createRoot } from "solid-js";
import { QueryClient, useQuery as rawUseQuery } from "@tanstack/solid-query";
import { useQuery } from "./query.ts";
import { queryClient } from "./query-client.ts";

const tick = () => new Promise((r) => setTimeout(r, 10));

async function fallbackFlashes(hook: typeof rawUseQuery): Promise<boolean> {
  const client = new QueryClient();
  client.setQueryData(["k"], "v1");
  const seen: unknown[] = [];
  const dispose = createRoot((d) => {
    const out = Suspense({
      fallback: "FALLBACK",
      get children() {
        const q = hook(() => ({ queryKey: ["k"], queryFn: async () => "v1", staleTime: Infinity }), () => client);
        // Read inside the boundary, as a component's JSX would.
        return createMemo(() => q.data) as unknown as string;
      },
    }) as unknown as () => unknown;
    createComputed(() => {
      const v = out();
      seen.push(typeof v === "function" ? (v as () => unknown)() : v);
    });
    return d;
  });
  await tick();
  seen.length = 0;
  client.setQueryData(["k"], "v2");
  await tick();
  dispose();
  client.clear();
  return seen.includes("FALLBACK");
}

assert.equal(await fallbackFlashes(rawUseQuery), true, "raw hook no longer flashes — the wrapper may be unnecessary");
assert.equal(await fallbackFlashes(useQuery), false, "wrapped useQuery tripped <Suspense>");
// A refetch returning equal data must keep row identity, or every <For> over
// it remounts (the widgets-flash-on-refocus bug). Uses the app's client defaults.
{
  const rows = () => [{ id: 1, n: "a" }, { id: 2, n: "b" }];
  let next = rows();
  const out = await new Promise<[unknown, unknown, unknown]>((resolve) => {
    createRoot(async (d) => {
      const q = useQuery(() => ({ queryKey: ["rows"], queryFn: async () => next }), () => queryClient);
      await tick();
      const first = (q.data as unknown[])[0];
      next = rows(); next[1].n = "c";
      await queryClient.refetchQueries({ queryKey: ["rows"] });
      await tick();
      const d2 = q.data as { n: string }[];
      resolve([first, d2[0], d2[1].n]);
      d();
    });
  });
  assert.equal(out[0], out[1], "unchanged row lost identity on refetch — reconcile default missing");
  assert.equal(out[2], "c", "changed row not updated");
  queryClient.clear();
}
console.log("ok");
