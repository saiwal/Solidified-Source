import { createMemo, Show } from "solid-js";
import { useLocation } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import SubPageLayout from "@/shared/views/SubPageLayout";
import type { SubPageItem } from "@/shared/views/SubPageLayout";
import { useHelpMode } from "@utsukta/spa-core/store/help-mode";
import { helpable } from "@utsukta/spa-core/lib/helpable";
import { GAMES } from "../games-registry";
import GameCanvas from "../components/GameCanvas";


export default function GamesPage() {
  const { t } = useI18n();
  const location = useLocation();
  const { helpMode } = useHelpMode();

  const items: SubPageItem[] = GAMES.map((game) => ({
    path: game.id,
    label: () => String(t(game.labelKey)),
    icon: (() => { const I = game.icon; return <I class="w-5 h-5 shrink-0" />; })(),
  }));

  const activeKey = createMemo<string>(() => {
    const seg = location.pathname.replace(/^\/games\/?/, "").split("/")[0];
    return GAMES.some((g) => g.id === seg) ? seg : GAMES[0].id;
  });

  // Find the full game entry — keyed Show remounts GameCanvas on game change
  const activeGame = createMemo(() =>
    GAMES.find((g) => g.id === activeKey()) ?? GAMES[0],
  );

  const attribution = (
    <p class="text-xs text-muted leading-relaxed">
      <a
        href="https://www.chiark.greenend.org.uk/~sgtatham/puzzles/"
        target="_blank"
        rel="noopener noreferrer"
        class="underline hover:text-txt transition-colors"
      >
        Simon Tatham's Portable Puzzle Collection
      </a>
      {" — MIT License"}
    </p>
  );

  return (
    <SubPageLayout
      base="/games"
      items={items}
      activeKey={activeKey()}
      sidebarFooter={attribution}
      contentClass="flex-1 min-h-0 overflow-hidden flex flex-col"
    >
      <Show when={activeGame()} keyed>
        {(game) => (
          <div class="relative flex-1 min-h-0">
            {/* Captures clicks for help mode; transparent otherwise so iframe works normally */}
            <div
              ref={helpable(() => `games.${game.id}`)}
              class="absolute inset-0 z-10 cursor-default"
              style={`pointer-events:${helpMode() ? "auto" : "none"}`}
            />
            <GameCanvas gameId={game.id} />
          </div>
        )}
      </Show>
    </SubPageLayout>
  );
}
