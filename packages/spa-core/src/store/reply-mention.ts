import { persistedSignal, boolFlag } from "../lib/persisted";

// pconfig spa/reply_mention — prefill "@{author} " when replying,
// as core's doreply() always does. Default on = core behaviour.
const [enabled, setEnabled] = persistedSignal(
  "hz-reply-mention",
  true,
  boolFlag.parse,
  boolFlag.format,
);

export function useReplyMention() { return enabled; }

export const setReplyMention = setEnabled;
