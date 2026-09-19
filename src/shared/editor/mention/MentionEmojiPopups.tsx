/**
 * MentionEmojiPopups.tsx
 * Renders the mention/emoji popup pair driven by a useMentionEmojiWiring()
 * instance — replaces the duplicated <MentionPopup>/<EmojiPopup> JSX block
 * that used to live at the bottom of every composer.
 */

import { Show, useContext, type Component } from "solid-js";
import MentionPopup from "./MentionPopup";
import EmojiPopup from "../emoji/EmojiPopup";
import TagPopup from "../tag/TagPopup";
import { ComposerFrameContext } from "../store/composer-host";
import type { MentionEmojiWiring } from "./useMentionEmojiWiring";

export interface MentionEmojiPopupsProps {
  wiring: MentionEmojiWiring;
}

const MentionEmojiPopups: Component<MentionEmojiPopupsProps> = (props) => {
  const { mention, emoji, tag, selectMention, selectEmoji, selectTag } = props.wiring;
  // These three are Portal-mounted to document.body, so they are siblings of
  // the composer wrapper rather than children: `display:none` on a minimized
  // composer does NOT hide them, and a popup left open while minimizing would
  // float over the page forever. No frame (a locally-mounted composer) means
  // undefined !== "min", i.e. unchanged behaviour.
  const frame = useContext(ComposerFrameContext);
  const live = () => frame?.mode() !== "min";

  return (
    <Show when={live()}>
      <Show when={mention.open() && mention.rect() !== null}>
        <MentionPopup
          query={mention.query()!}
          entries={mention.filtered()}
          anchorRect={mention.rect()!}
          activeIdx={mention.activeIdx()}
          onSelect={(entry) => selectMention(entry)}
        />
      </Show>

      <Show when={emoji.open() && emoji.rect() !== null}>
        <EmojiPopup
          entries={emoji.filtered()}
          anchorRect={emoji.rect()!}
          activeIdx={emoji.activeIdx()}
          onSelect={(entry) => selectEmoji(entry)}
        />
      </Show>

      <Show when={tag?.open() && tag.rect() !== null}>
        <TagPopup
          entries={tag!.filtered()}
          anchorRect={tag!.rect()!}
          activeIdx={tag!.activeIdx()}
          onSelect={(entry) => selectTag(entry)}
        />
      </Show>
    </Show>
  );
};

export default MentionEmojiPopups;
