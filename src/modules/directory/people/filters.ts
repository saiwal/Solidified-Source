import { createSignal } from "solid-js";

const [safe, setSafe] = createSignal<0 | 1>(0);
const [pubforums, setPubforums] = createSignal<0 | 1>(0);
const [globalDir, setGlobalDir] = createSignal<0 | 1>(0);

export { safe, setSafe, pubforums, setPubforums, globalDir, setGlobalDir };
