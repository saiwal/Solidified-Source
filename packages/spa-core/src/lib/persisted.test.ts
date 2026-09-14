// node --experimental-strip-types packages/spa-core/src/lib/persisted.test.ts
import assert from "node:assert";

const store = new Map<string, string>();
let blocked = false;
(globalThis as any).localStorage = {
  getItem: (k: string) => {
    if (blocked) throw new Error("blocked");
    return store.has(k) ? store.get(k)! : null;
  },
  setItem: (k: string, v: string) => {
    if (blocked) throw new Error("blocked");
    store.set(k, v);
  },
};

const { persistedSignal, oneOf, boolFlag } = await import("./persisted.ts");

// stored value wins over the fallback, and a set writes through
store.set("k", "b");
const [v, setV] = persistedSignal("k", "a", oneOf("a", "b"));
assert.equal(v(), "b");
setV("a");
assert.equal(v(), "a");
assert.equal(store.get("k"), "a");

// a stored value the union doesn't allow falls back instead of selecting it
store.set("bad", "nope");
assert.equal(persistedSignal("bad", "a", oneOf("a", "b"))[0](), "a");

// custom codec round trip: the flag is stored as "1"/"0", not "true"
const [flag, setFlag] = persistedSignal("f", false, boolFlag.parse, boolFlag.format);
assert.equal(flag(), false);
setFlag(true);
assert.equal(store.get("f"), "1");
assert.equal(persistedSignal("f", false, boolFlag.parse, boolFlag.format)[0](), true);

// a parse that throws (JSON) falls back rather than taking the app down
store.set("j", "{not json");
assert.deepEqual(persistedSignal<number[]>("j", [], JSON.parse, JSON.stringify)[0](), []);

// private mode: both read and write throw, and neither is fatal
blocked = true;
const [p, setP] = persistedSignal("k", "a", oneOf("a", "b"));
assert.equal(p(), "a");
setP("b");
assert.equal(p(), "b");
blocked = false;

console.log("persisted: ok");
