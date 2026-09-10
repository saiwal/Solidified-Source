// Word-for-word pirate substitution, kept import-free so the check can run it
// under plain node.
const WORDS: Record<string, string> = {
  hello: "ahoy", hi: "ahoy", welcome: "welcome aboard", goodbye: "fair winds",
  friend: "matey", friends: "mateys", friendship: "fellowship",
  you: "ye", "you're": "ye be", "you've": "ye've", your: "yer", yours: "yers",
  my: "me", is: "be", are: "be", am: "be", was: "were", the: "th'",
  of: "o'", to: "t'", for: "fer", over: "o'er", between: "betwixt",
  before: "afore", yes: "aye", no: "nay", not: "nay", never: "ne'er",
  stop: "belay", cancel: "belay", man: "matey", woman: "lass", girl: "lass",
  boy: "lad", people: "crew", person: "soul", everyone: "all hands",
  user: "sailor", users: "crew", member: "crewmate", members: "crew",
  admin: "cap'n", owner: "cap'n", channel: "ship", channels: "ships",
  group: "fleet", groups: "fleets", message: "missive", messages: "missives",
  post: "yarn", posts: "yarns", comment: "remark", comments: "remarks",
  search: "hunt", find: "hunt fer", delete: "scuttle", remove: "scuttle",
  settings: "riggin'", options: "riggin'", file: "cargo", files: "cargo",
  folder: "hold", upload: "haul aboard", download: "haul ashore",
  photo: "portrait", photos: "portraits", image: "portrait",
  money: "doubloons", price: "bounty", cart: "haul", buy: "barter fer",
  error: "blunder", failed: "went down with all hands", warning: "squall ahead",
  loading: "hoistin' sails", save: "stow", saved: "stowed", send: "dispatch",
  share: "spread th' word", login: "come aboard", logout: "abandon ship",
  home: "home port", away: "at sea", online: "on deck", offline: "ashore",
  new: "fresh", old: "weathered", quickly: "smartly", stopped: "belayed",
  help: "parley", about: "concernin'", left: "port", right: "starboard",
  down: "below decks", up: "aloft", food: "grub", drink: "grog",
  music: "shanties", song: "shanty", songs: "shanties", story: "tale",
  treasure: "plunder", map: "chart", maps: "charts", flag: "colours",
  hey: "avast", stopping: "belayin'", ok: "aye", okay: "aye",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Word-for-word pirate substitution. Deterministic and idempotent — no
 *  replacement word is itself a key, so re-running changes nothing. */
export function piratize(s: string): string {
  // Odd indices are {{placeholders}}, left untouched so interpolation still works.
  return s
    .split(/(\{\{[^}]*\}\})/)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(/\b[A-Za-z']+\b/g, (w) => {
            const hit = WORDS[w.toLowerCase()];
            if (!hit) return w;
            return w.charAt(0) === w.charAt(0).toUpperCase() ? cap(hit) : hit;
          }),
    )
    .join("");
}
