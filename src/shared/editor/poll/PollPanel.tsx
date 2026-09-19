import { Index, Show, type Component } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import type { PollState } from "./usePollState";
import { MdOutlineClose } from "solid-icons/md";

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
            <input
              type="text"
              value={ans()}
              placeholder={`${t("editor.poll_answer_placeholder")} ${i + 1}`}
              onInput={(e) => poll.updateAnswer(i, e.currentTarget.value)}
              class="flex-1 bg-transparent border border-rim rounded px-2.5 py-1 text-sm
                     text-txt placeholder:text-muted outline-none focus:border-rim-strong transition-colors"
            />
            <Show when={poll.answers().length > 2}>
              <button
                type="button"
                onClick={() => poll.removeAnswer(i)}
                title={t("editor.poll_remove_answer")}
                class="p-1 rounded text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
              >
                <MdOutlineClose class="w-3.5 h-3.5" />
              </button>
            </Show>
          </div>
        )}
      </Index>
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
          <input
            type="number"
            min="1"
            max="365"
            value={poll.expireValue()}
            onInput={(e) => poll.setExpireValue(e.currentTarget.value)}
            class="w-14 bg-transparent border border-rim rounded px-2 py-0.5 text-xs text-txt
                   outline-none focus:border-rim-strong transition-colors"
          />
          <select
            value={poll.expireUnit()}
            onChange={(e) => poll.setExpireUnit(e.currentTarget.value)}
            class="bg-surface border border-rim rounded px-1.5 py-0.5 text-xs text-txt
                   outline-none focus:border-rim-strong transition-colors cursor-pointer"
          >
            <option value="Days">Days</option>
            <option value="Hours">Hours</option>
            <option value="Minutes">Minutes</option>
            <option value="Weeks">Weeks</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default PollPanel;
