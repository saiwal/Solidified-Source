// node --conditions=browser --experimental-strip-types packages/spa-core/src/lib/query.test.ts
//
// An observer update on a query that already has data (here setQueryData;
// in the app the staleTime timer or a refetchInterval tick) must not flip an
// enclosing <Suspense> to its fallback. The raw hook does — that is the bug.
import assert from "node:assert/strict";
import { Suspense, createComputed, createMemo, createRoot } from "solid-js";
import { QueryClient, useQuery as rawUseQuery } from "@tanstack/solid-query";
import { useQuery } from "./query.ts";

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
console.log("ok");
