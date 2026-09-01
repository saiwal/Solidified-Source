// The channel-details card and post feed are registered as widgets in
// ../index.ts (both in the contentTop slot) and rendered by Layout.tsx's
// <Slot name="contentTop" .../> above this view — see hq/views/HqView.tsx
// for the same pattern. The feed layouts are alternatives: the user picks one
// in the widget picker, which is why they stay widgets rather than living here.
export default function ChannelView() {
  return null;
}
