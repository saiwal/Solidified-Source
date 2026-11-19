// src/modules/network/views/ReactorList.tsx

import { For } from 'solid-js';
import { createAsyncResource } from "@utsukta/spa-core/lib/createAsyncResource";
import AsyncBoundary from "@/shared/views/AsyncBoundary";
import { fetchDislikes, fetchLikes, fetchRepeats } from '../api';
import { useI18n } from "@utsukta/spa-core/i18n";
import { Avatar } from "@ui/Avatar";

interface Props {
  mid: string;
  verb: 'likes' | 'dislikes' | 'repeats';
}

export default function ReactorList(props: Props) {
  const { t } = useI18n();
  const [data] = createAsyncResource(
    "reactors",
    () => ({ mid: props.mid, verb: props.verb }),
    ({ mid, verb }) =>
      verb === 'likes'    ? fetchLikes(mid)    :
      verb === 'dislikes' ? fetchDislikes(mid) :
                            fetchRepeats(mid),
  );

  return (
    <AsyncBoundary fallback={<p>{t("network.loading")}</p>}>
      <For each={data()?.reactions ?? []}>
        {(r) => (
          <div class="flex items-center gap-2 py-1">
            <Avatar src={r.photo} size={6} />
            <span class="text-sm">{r.name}</span>
          </div>
        )}
      </For>
    </AsyncBoundary>
  );
}
