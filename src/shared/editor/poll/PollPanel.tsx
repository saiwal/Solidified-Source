import { Index, Show, type Component } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import type { PollState } from "./usePollState";
import { MdOutlineClose } from "solid-icons/md";
import { IconButton } from "@ui/Button";
import { Input, Select } from "@ui/Field";
import { Switch } from "@ui/Toggle";

export interface PollPanelProps {
  poll: PollState;
}

const PollPanel: Component<PollPanelProps> = (props) => {
  const { t } = useI18n();
  const poll = props.poll;
  return (
    <div class="px-4 py-3 border-t border-rim bg-elevated/40 shrink-0 space-y-2">
      <span class="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
        {t("editor.poll_toggle")}
      </span>
      {/* Index, not For: answers are plain strings, so For would key on the
          value and recreate the input on every keystroke (focus loss). */}
      <Index each={poll.answers()}>
        {(ans, i) => (
          <div class="flex items-center gap-2">
            <Input
              class="flex-1"
              type="text"
              value={ans()}
              placeholder={`${t("editor.poll_answer_placeholder")} ${i + 1}`}
              onInput={(e) => poll.updateAnswer(i, e.currentTarget.value)}
            />
            <Show when={poll.answers().length > 2}>
              <IconButton
                label={t("editor.poll_remove_answer")}
                variant="danger"
                size="sm"
                onClick={() => poll.removeAnswer(i)}
              >
                <MdOutlineClose class="w-3.5 h-3.5" />
              </IconButton>
            </Show>
          </div>
        )}
      </Index>
      <label class="flex items-center gap-2 text-xs text-muted cursor-pointer">
        <Switch checked={poll.multiple()} onChange={poll.setMultiple} />
        {t("editor.poll_multiple")}
      </label>
      <div class="flex flex-wrap items-center gap-3 pt-1">
        <Show when={poll.answers().length < 10}>
          <button
            type="button"
            onClick={poll.addAnswer}
            class="text-xs text-accent hover:opacity-80 transition-opacity"
          >
            {t("editor.poll_add_answer")}
          </button>
        </Show>
        <div class="flex items-center gap-1.5 ml-auto">
          <span class="text-xs text-muted shrink-0">{t("editor.poll_expires_label")}</span>
          <Input
            size="sm"
            class="w-14"
            type="number"
            min="1"
            max="365"
            value={poll.expireValue()}
            onInput={(e) => poll.setExpireValue(e.currentTarget.value)}
          />
          <Select
            size="sm"
            class="cursor-pointer"
            value={poll.expireUnit()}
            onChange={(e) => poll.setExpireUnit(e.currentTarget.value)}
          >
            <option value="Days">{t("editor.poll_unit_days")}</option>
            <option value="Hours">{t("editor.poll_unit_hours")}</option>
            <option value="Minutes">{t("editor.poll_unit_minutes")}</option>
            <option value="Weeks">{t("editor.poll_unit_weeks")}</option>
          </Select>
        </div>
      </div>
    </div>
  );
};

export default PollPanel;
