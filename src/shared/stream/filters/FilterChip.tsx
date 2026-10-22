import type { JSX } from "solid-js";
import { Button } from "@ui/Button";

export default function FilterChip(props: {
  active: boolean;
  onClick: () => void;
  label: string | JSX.Element;
}) {
  return (
    <Button variant="ghost" size="sm" pressed={props.active} class="shrink-0" onClick={props.onClick}>
      {props.label}
    </Button>
  );
}
