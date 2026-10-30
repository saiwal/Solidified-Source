// src/shared/stream/components/PollCard.tsx
import { createSignal, For, Show } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { apiVotePoll } from "@utsukta/spa-core/lib/item-api";
import { toast } from "@utsukta/spa-core/store/toast";
import type { PollData } from "@utsukta/spa-core/types/post.types";
import { Button } from "@ui/Button";
import { Card } from "@ui/Card";

function formatEndTime(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale, {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function isPollClosed(poll: PollData): boolean {
  if (poll.closed) {
    try {
      return new Date(poll.closed) < new Date();
    } catch {
      return true;
    }
  }
  if (poll.end_time) {
    try {
      return new Date(poll.end_time) < new Date();
    } catch {
      return false;
    }
  }
  return false;
}

export default function PollCard(props: {
  uuid: string;
  poll: PollData;
  onVoted?: (votes: string[]) => void;
}) {
  const { t, locale } = useI18n();

  const closed   = () => isPollClosed(props.poll);
  const hasVoted = () => props.poll.viewer_votes.length > 0;

  const [selected, setSelected] = createSignal<string[]>(
    props.poll.viewer_votes.length > 0 ? [...props.poll.viewer_votes] : []
  );
  const [submitting, setSubmitting] = createSignal(false);
  const [voted, setVoted] = createSignal(hasVoted());
  const [error, setError] = createSignal<string | null>(null);

  function toggleOption(name: string) {
    if (voted() || closed()) return;
    if (props.poll.multiple) {
      setSelected(prev =>
        prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
      );
    } else {
      setSelected([name]);
    }
  }

  async function submit() {
    const sel = selected();
    if (!sel.length || submitting()) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiVotePoll(props.uuid, props.poll.multiple ? sel : sel[0]);
      setVoted(true);
      toast.success(t("post.poll_vote_submitted"));
      props.onVoted?.(sel);
    } catch (e: any) {
      setError(e?.message ?? t("post.poll_vote_failed"));
    } finally {
      setSubmitting(false);
    }
  }

  // Local vote state, not props: the poll prop isn't refetched after voting.
  const canVote = () => props.poll.can_vote && !voted() && !closed();

  const currentVotes = () =>
    voted() && !hasVoted()
      ? props.poll.options.map(o => ({
          ...o,
          votes: selected().includes(o.name) ? o.votes + 1 : o.votes,
        }))
      : props.poll.options;

  const currentTotal = () =>
    currentVotes().reduce((sum, o) => sum + o.votes, 0);

  return (
    <Card class="mt-3 p-3 space-y-2 text-sm">
      <For each={props.poll.options}>
        {(option) => {
          const isSelected  = () => selected().includes(option.name);
          const isVotedFor  = () => voted() && isSelected();
          // Results always show, as in core's format_poll().
          const votes       = () =>
            currentVotes().find(o => o.name === option.name)?.votes ?? option.votes;
          const pct         = () => {
            const t = currentTotal();
            return t > 0 ? Math.round((votes() / t) * 100) : 0;
          };

          return (
            <button
              type="button"
              disabled={!canVote()}
              onClick={() => toggleOption(option.name)}
              class={`w-full text-left rounded-md border px-3 py-2 relative overflow-hidden transition-colors
                ${canVote()
                  ? isSelected()
                    ? "border-accent bg-accent/10"
                    : "border-rim hover:border-accent/60 hover:bg-elevated cursor-pointer"
                  : "cursor-default border-rim"}`}
            >
              <div
                class="absolute inset-y-0 left-0 bg-accent/15 transition-all duration-500"
                style={{ width: `${pct()}%` }}
              />
              <div class="relative flex items-center justify-between gap-2">
                <span class={`truncate ${isVotedFor() ? "font-semibold text-accent" : "text-txt"}`}>
                  {option.name}
                </span>
                <span class="shrink-0 text-muted text-xs tabular-nums">
                  {pct()}% · {votes()}
                </span>
              </div>
            </button>
          );
        }}
      </For>

      <div class="flex items-center justify-between gap-3 pt-1">
        <span class="text-xs text-muted">
          {currentTotal() === 1 ? t("post.poll_votes_one") : t("post.poll_votes", { count: currentTotal() })}
          <Show when={closed()}>
            <span class="ml-1">· {t("post.poll_ended")}</span>
          </Show>
          <Show when={props.poll.end_time && !closed()}>
            <span class="ml-1">· {t("post.poll_ends", { when: formatEndTime(props.poll.end_time!, locale()) })}</span>
          </Show>
        </span>

        <Show when={canVote()}>
          <Button
            size="sm"
            class="shrink-0"
            disabled={selected().length === 0 || submitting()}
            onClick={submit}
          >
            {submitting() ? t("post.poll_voting") : t("post.poll_vote")}
          </Button>
        </Show>
      </div>

      <Show when={error()}>
        <p class="text-xs text-danger-txt">{error()}</p>
      </Show>
    </Card>
  );
}
