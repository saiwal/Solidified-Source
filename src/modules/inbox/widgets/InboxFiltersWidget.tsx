// The network's grouped filter panel, pointed at the inbox. /spa/hq-messages
// reads the same params through Concerns/StreamFilters, so the sources, post
// types and refinements carry over as-is; only the "Show" flags differ, and
// folders and RSS are inbox sections rather than filters here. InboxView reads
// the URL itself, so there is nothing to re-apply.
import {
  MdFillMark_email_unread, MdFillAlternate_email, MdFillNotifications, MdFillAttach_file,
} from "solid-icons/md";
import type { WidgetProps } from "@utsukta/spa-core/types/module.types";
import StreamFiltersWidget, { type FilterHost } from "@/modules/network/widgets/StreamFiltersWidget";

const INBOX_HOST: FilterHost = {
  apply: () => {},
  show: [
    { key: "unread", labelKey: "hq.filter_unread",     Icon: MdFillMark_email_unread },
    { key: "conv",   labelKey: "hq.filter_mentioned",  Icon: MdFillAlternate_email   },
    { key: "pf",     labelKey: "network.following",    Icon: MdFillNotifications     },
    { key: "has",    labelKey: "hq.filter_attachment", Icon: MdFillAttach_file, value: "attachment" },
  ],
  // The search box still takes typed operators (from:alice is:liked …).
  searchPlaceholderKey: "hq.search_placeholder",
};

export default function InboxFiltersWidget(props: WidgetProps) {
  return <StreamFiltersWidget {...props} host={INBOX_HOST} />;
}
