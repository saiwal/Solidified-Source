/**
 * ComposerActionBar.tsx
 *
 * The composer's single bottom row, shared by all of them.
 *
 * It replaces two rows: an options row of toggles (ACL, encrypt, expire,
 * schedule, poll, location, …) and an actions row (discard, save-draft,
 * drafts, clear, submit). The toggles now live in the submit button's menu and
 * the drafts buttons are gone entirely — the composer autosaves — which leaves
 * one row: whatever the composer scopes on the left, the primary action right.
 *
 * `leading` is the ACL picker for the composers that have one. Article, card
 * and note scope through their own meta fields instead and pass nothing, so
 * the row is just the action cluster for them.
 */
import { Show, type Component, type JSX } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { IconButton, SecondaryButton, SplitSubmitButton } from "./buttons";

export interface ComposerActionBarProps {
  /** Left-aligned scope control — the ACL picker where there is one. */
  leading?: JSX.Element;
  /** Option toggles, folded into the submit button's caret menu. */
  menu?: JSX.Element;
  submitLabel: string;
  onSubmit: () => void;
  submitDisabled?: boolean;
  /** Close/cancel. Omitted for the page-hosted composers that have no modal. */
  onCancel?: () => void;
  cancelLabel?: string;
  /** Reset the composer to empty. Omitted, the X is not rendered. */
  onClear?: () => void;
}

const ComposerActionBar: Component<ComposerActionBarProps> = (props) => {
  const { t } = useI18n();

  return (
    <div class="flex items-center gap-2 w-full">
      <Show when={props.leading}>
        <div class="flex items-center gap-2 min-w-0">{props.leading}</div>
      </Show>

      <div class="flex items-center gap-2 ml-auto shrink-0">
        <Show when={props.onCancel}>
          <SecondaryButton onClick={() => props.onCancel!()}>
            {props.cancelLabel ?? t("editor.discard")}
          </SecondaryButton>
        </Show>

        <Show when={props.onClear}>
          <IconButton title={t("editor.clear_composer")} onClick={() => props.onClear!()} variant="danger">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </IconButton>
        </Show>

        <SplitSubmitButton
          onClick={props.onSubmit}
          disabled={props.submitDisabled}
          menu={props.menu}
          menuLabel={t("editor.more_options")}
        >
          {props.submitLabel}
        </SplitSubmitButton>
      </div>
    </div>
  );
};

export default ComposerActionBar;
