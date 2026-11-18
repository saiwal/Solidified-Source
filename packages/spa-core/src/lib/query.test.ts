// node --conditions=browser --experimental-strip-types packages/spa-core/src/lib/query.test.ts
//
// The wrapped useQuery must read like v5: data undefined (never suspending)
// before the first fetch lands and while disabled, the previous value during
// a refetch, errors on .error only — and a <Loading> around a reader must
// never show its fallback because of it.
import assert from "node:assert/strict";
import { Loading, createMemo, createRoot, createSignal, flush } from "solid-js";

// solid-query 6 treats `typeof window === "undefined"` as the server (no cache
// subscriptions, no observers) — define it before the library loads.
(globalThis as { window?: unknown }).window ??= globalThis;
const { QueryClient } = await import("@tanstack/solid-query");
const { useQuery } = await import("./query.ts");
const { queryClient } = await import("./query-client.ts");

const tick = () => new Promise((r) => setTimeout(r, 10));
const settle = async () => { flush(); await tick(); flush(); };

console.error("· disabled/enable/refetch/error");
// disabled → undefined, enabling fetches, refetch holds the old value, error stays on .error
{
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let release!: () => void;
  let answer: () => Promise<string> = async () => "one";
  const [on, setOn] = createSignal(false);
  let q!: { data: string | undefined; error: unknown };
  const dispose = createRoot((d) => {
    q = useQuery(() => ({ queryKey: ["k"], queryFn: () => answer(), enabled: on() }), () => client) as never;
    return d;
  });
  await settle();
  assert.equal(q.data, undefined, "disabled query should read undefined, not suspend");
  setOn(true);
  await settle();
  assert.equal(q.data, "one");
  answer = () => new Promise((r) => (release = () => r("two")));
  void client.refetchQueries({ queryKey: ["k"] });
  await settle();
  assert.equal(q.data, "one", "previous value should stay while refetching");
  release();
  await settle();
  assert.equal(q.data, "two");
  answer = async () => { throw new Error("boom"); };
  await client.refetchQueries({ queryKey: ["k"] }).catch(() => {});
  await settle();
  assert.equal(q.data, "two", "an error must not wipe or throw data");
  assert.ok(q.error, "error should be on .error");
  dispose();
  client.clear();
}

console.error("· loading boundary");
// a <Loading> around a pending first fetch keeps its children (no fallback)
{
  const client = new QueryClient();
  const seen: unknown[] = [];
  const dispose = createRoot((d) => {
    const out = Loading({
      fallback: "FALLBACK",
      get children() {
        const q = useQuery(() => ({ queryKey: ["slow"], queryFn: () => new Promise<string>(() => {}) }), () => client);
        // A disabled query's flags too: v6 computes them with isPending() on a
        // node that never settles, which held the Ctrl+K palette forever.
        const off = useQuery(() => ({ queryKey: ["off"], queryFn: async () => "x", enabled: false }), () => client);
        return createMemo(() => `child:${q.data ?? "none"}:${off.isLoading}:${off.isFetching}`) as unknown as string;
      },
    }) as unknown as () => unknown;
    const read = () => { const v = out(); return typeof v === "function" ? (v as () => unknown)() : v; };
    seen.push(read());
    globalThis.setTimeout(() => seen.push(read()), 20);
    return d;
  });
  await tick(); await tick(); flush();
  assert.ok(!seen.includes("FALLBACK"), `fallback shown: ${JSON.stringify(seen)}`);
  dispose();
  client.clear();
}

console.error("· row identity");
// a refetch returning equal data keeps row identity (else every <For> remounts)
{
  const rows = () => [{ id: 1, n: "a" }, { id: 2, n: "b" }];
  let next = rows();
  let q!: { data: { id: number; n: string }[] | undefined };
  const dispose = createRoot((d) => {
    q = useQuery(() => ({ queryKey: ["rows"], queryFn: async () => next }), () => queryClient) as never;
    return d;
  });
  await settle();
  const first = q.data![0];
  next = rows(); next[1].n = "c";
  await queryClient.refetchQueries({ queryKey: ["rows"] });
  await settle();
  assert.equal(q.data![0], first, "unchanged row lost identity on refetch");
  assert.equal(q.data![1].n, "c", "changed row not updated");
  dispose();
  queryClient.clear();
}
console.log("ok");
process.exit(0); // query-core gc timers would keep node alive
