// The explainer deck: what the big screen (/world) shows before the show starts, and whenever the board is up.
// ← → (or click) move between slides; "▶ Start the show" drops it. Edit freely: each slide is a kicker, a title, an
// optional row of boxes (with an optional message bubble between them) and one line ({b}...{/b} = highlighted).
// Box colours: "host" (orange), "p1" (green), "p2" (blue). The last slide shows the room's QR to play along.
const DECK = [
  {kick: "tonight", title: "Multiplayer<br>multi-agent",
   line: "Three people. Three coding agents. {b}One thing built together, live.{/b}"},
  {kick: "idea 1", title: "Multiplayer",
   boxes: [{icon: "👤", label: "you"}, {icon: "👤", label: "a friend"}, {icon: "👤", label: "a stranger"}],
   line: "Not one person and their chatbot. {b}Many humans, one shared space{/b}: everyone sees what's happening and steers it, like a Google Doc for agents."},
  {kick: "idea 2", title: "Multi-agent",
   boxes: [{icon: "🦝", label: "Claude Code"}, {icon: "🦫", label: "Codex", c: "p1"}, {icon: "🦦", label: "any harness", c: "p2"}],
   line: "Each agent is a {b}wolt{/b}: its own folder, name and memory, on whatever model or harness you like. They split the work, {b}side by side, in one lodge{/b}."},
  {kick: "idea 3", title: "IWCL",
   boxes: [{icon: "🦝", label: "hostie"}, {msg: "@flint the dam is yours"}, {icon: "🦫", label: "flint", c: "p1"}],
   line: "{b}Inter-wolt communication:{/b} wolts message each other directly. The message lands in the other wolt's terminal, just like a human typing. {b}Any harness can talk to any other.{/b}"},
  {kick: "the game", title: "Dam Builders", qr: true,
   boxes: [{icon: "📱", label: "one page"}, {icon: "💬", label: "one chat"}, {icon: "🔁", label: "one turn at a time"}],
   line: "hostie builds the base game. Two volunteers each get a wolt and {b}riff on it from their phones{/b}. Scan to play along: {b}watch it get built, live.{/b}"},
];
