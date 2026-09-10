// src/modules/invite/index.ts
//
// The Invite *app* lives at /invite, but its UI is a section of the directory
// module (/directory/invite). This module exists only to own that route, and
// deliberately declares no navItem: useNav's appToNavItem() labels an app tile
// with the owning module's navItem label when it has one, so parking /invite
// in the directory module made the Invite tile render as a second "Directory".
import { registerModule } from "@utsukta/spa-core/module-registry";

registerModule({
  id: "invite",
  routes: [
    { path: "/invite", component: () => import("./views/InviteRedirect") },
  ],
});
