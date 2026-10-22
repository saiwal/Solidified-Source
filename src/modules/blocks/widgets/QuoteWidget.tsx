// Quote of the day — same quote for everyone on a given date (deterministic
// pick from a bundled list), with a shuffle button for a random one. No
// backend, no config: purely a client-side content block.

import { createSignal } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { IoShuffleOutline } from "solid-icons/io";
import { IconButton } from "@ui/Button";
import { Card } from "@ui/Card";

const QUOTES: [string, string][] = [
  ["The only way to do great work is to love what you do.", "Steve Jobs"],
  ["Simplicity is the ultimate sophistication.", "Leonardo da Vinci"],
  ["Code is like humor. When you have to explain it, it's bad.", "Cory House"],
  ["First, solve the problem. Then, write the code.", "John Johnson"],
  ["Any fool can write code that a computer can understand. Good programmers write code that humans can understand.", "Martin Fowler"],
  ["Make it work, make it right, make it fast.", "Kent Beck"],
  ["The best error message is the one that never shows up.", "Thomas Fuchs"],
  ["Talk is cheap. Show me the code.", "Linus Torvalds"],
  ["Programs must be written for people to read, and only incidentally for machines to execute.", "Harold Abelson"],
  ["Premature optimization is the root of all evil.", "Donald Knuth"],
  ["A day without laughter is a day wasted.", "Charlie Chaplin"],
  ["The journey of a thousand miles begins with a single step.", "Lao Tzu"],
  ["It always seems impossible until it's done.", "Nelson Mandela"],
  ["What we think, we become.", "Buddha"],
  ["The only limit to our realization of tomorrow will be our doubts of today.", "Franklin D. Roosevelt"],
  ["Do or do not. There is no try.", "Yoda"],
  ["In the middle of difficulty lies opportunity.", "Albert Einstein"],
  ["Stay hungry, stay foolish.", "Stewart Brand"],
  ["Small deeds done are better than great deeds planned.", "Peter Marshall"],
  ["The best time to plant a tree was 20 years ago. The second best time is now.", "Chinese Proverb"],
];

function dayOfYearIndex(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const day = Math.floor(diff / 86400000);
  return day % QUOTES.length;
}

export default function QuoteWidget() {
  const { t } = useI18n();
  const [index, setIndex] = createSignal(dayOfYearIndex());

  const shuffle = () => setIndex((i) => (i + 1 + Math.floor(Math.random() * (QUOTES.length - 1))) % QUOTES.length);

  return (
    <Card class="px-4 py-4">
      <div class="flex items-start justify-between gap-2">
        <blockquote class="text-sm text-txt italic leading-snug">
          “{QUOTES[index()][0]}”
        </blockquote>
        <IconButton label={t("widgets.quote_shuffle")} size="sm" class="shrink-0" onClick={shuffle}>
          <IoShuffleOutline size={16} />
        </IconButton>
      </div>
      <p class="text-xs text-muted mt-2">— {QUOTES[index()][1]}</p>
    </Card>
  );
}
