// Fixture for scripts/check-ui.mjs: server-renders the @ui primitives so their
// label/id/aria wiring can be asserted without a browser or a test framework.
import { renderToString } from "solid-js/web";
import { Field, Input, Select } from "./Field";
import { Toggle } from "./Toggle";
import { Tabs } from "./Tabs";
import { CountBadge } from "./Badge";

export const html = () =>
  renderToString(() => (
    <div>
      <Field label="Name" hint="Your name"><Input value="x" /></Field>
      <Field label="Pair" error="Bad"><Input /><Input /></Field>
      <Field label="Own"><Select id="explicit"><option>a</option></Select></Field>
      <Input />
      <Toggle name="opt" label="Opt" hint="Opt hint" checked />
      <i id="c0"><CountBadge n={0} /></i><i id="c5"><CountBadge n={5} /></i><i id="c150"><CountBadge n={150} /></i>
      <Tabs label="Views" value="b" onChange={() => {}} items={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} />
    </div>
  ));
