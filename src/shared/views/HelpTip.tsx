import Tooltip from "./Tooltip";

interface Props {
  text: string;
}

export default function HelpTip(props: Props) {
  return (
    <Tooltip content={props.text} placement="top">
      <span
        tabindex={0}
        class="inline-flex items-center justify-center w-4 h-4 rounded-full
               bg-surface border border-rim
               cursor-default flex-shrink-0"
      >
        <span class="text-[0.625rem] font-medium text-muted select-none leading-none">
          ?
        </span>
      </span>
    </Tooltip>
  );
}
