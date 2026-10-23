// Fixture for scripts/check-ui.mjs: server-renders the @ui primitives so their
// label/id/aria wiring can be asserted without a browser or a test framework.
import { renderToString } from "solid-js/web";
import { Field, Input, Select } from "./Field";
import { Toggle } from "./Toggle";
import { TabPanel, Tabs } from "./Tabs";
import { CountBadge } from "./Badge";
import { Chip, RemovableChip } from "./Chip";
import { Skeleton, SkeletonText } from "./Skeleton";
import { Banner } from "./Banner";
import { CopyButton } from "./CopyButton";
import { SearchField } from "./SearchField";
import { Popover } from "./Popover";
import { Collapsible } from "./Collapsible";
import { ProgressBar } from "./ProgressBar";
import { ErrorState } from "./ErrorState";
import { Tooltip } from "./Tooltip";
import { MenuButton } from "./MenuButton";
import { MenuItem } from "./Menu";
import { ListRow } from "./ListRow";
import { LoadMore } from "./LoadMore";
import { DataTable } from "./DataTable";
import { Stat } from "./Stat";
import { ColorSwatch } from "./ColorSwatch";
import { FileDropZone } from "./FileDropZone";

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
      <Tabs id="t" label="Linked" value="b" onChange={() => {}} items={[{ value: "a", label: "A", count: 3 }, { value: "b", label: "B" }]} />
      <TabPanel tabs="t" value="b">panel</TabPanel>
      <Chip selected count={3} onClick={() => {}}>Active</Chip>
      <Chip onClick={() => {}}>Idle</Chip>
      <Chip rainbow style={{ "--rainbow-h": "200" }} onClick={() => {}}>Rainbow</Chip>
      <RemovableChip onRemove={() => {}} removeLabel="Remove Alice">Alice</RemovableChip>
      <Skeleton class="h-4 w-10" />
      <SkeletonText lines={2} />
      <Banner tone="warning" title="Heads up">Check the rules.</Banner>
      <SearchField value="abc" onInput={() => {}} label="Search" clearLabel="Clear" />
      <CopyButton value="clip" label="Copy link" copiedLabel="Copied" />
      <Popover label="Panel" trigger={(p) => <button {...p} aria-label="Open panel">Open</button>}>
        <p>Panel body</p>
      </Popover>
      <Collapsible open={false} onOpenChange={() => {}} header={(p) => <button {...p} id="c-closed-btn">Closed</button>}>
        hidden
      </Collapsible>
      <Collapsible open onOpenChange={() => {}} header={(p) => <button {...p} id="c-open-btn">Open</button>}>
        Collapsible body
      </Collapsible>
      <ProgressBar label="Uploading" value={40} max={100} />
      <ErrorState message="Could not load" detail="Network error" retry={() => {}} retryLabel="Try again" />
      <Tooltip content="Hint"><button aria-label="Tip target">?</button></Tooltip>
      <MenuButton label="More"><MenuItem>One</MenuItem></MenuButton>
      <ListRow title="Row title" meta="Meta" onClick={() => {}} />
      <LoadMore hasMore loading={false} onClick={() => {}} label="Load more" />
      <LoadMore hasMore={false} loading={false} onClick={() => {}} label="Gone" />
      <DataTable<{ id: number; name: string; count: number }>
        columns={[
          { key: "name", header: "Name", sortable: true, cell: (r) => r.name },
          { key: "count", header: "Count", cell: (r) => String(r.count) },
        ]}
        rows={[{ id: 1, name: "Alpha", count: 2 }]}
        rowKey={(r) => r.id}
        sort={{ key: "name", dir: "asc" }}
        onSort={() => {}}
      />
      <Stat label="Total" value={42} accent />
      <ColorSwatch value="#336699" onChange={() => {}} label="Accent colour" />
      <FileDropZone onFiles={() => {}} label="Upload files" hint="or drag them" />
    </div>
  ));
