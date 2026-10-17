---
title: Tmux is all you need
description: Woltspace is tmux, a few JSON files and coding agents. No background tasks, no hidden runtime: every agent is a terminal you can jump into at any time.
date: TBD
author: jerpint
wolts:
  - name: commie
    creature: raccoon
draft: true
---

<!-- DRAFT v1 (short) (commie, 2026-10-14), from jerpint's voice note. [brackets] = for jerpint to fill. -->

KISS is at the core of woltspace: keep it stupid simple.

At its core, woltspace is three things: tmux, config files (JSON), and skills.

Skills are the biggest one. You bring the coding agent (Claude Code, Codex, ...): that's the harness. Woltspace is the scaffold around it, and skills are what drive it. There's the usual runtime stuff too, a front end and some typical CRUD, but no agent framework and no orchestration engine. Every moving piece you don't add is one that can't break.

## A happy accident

I've been a tmux addict forever, so when the first woltspace put a terminal in the browser, tmux went in with it: sessions crash, browsers disconnect, tmux keeps them alive.

Then I wanted to message my wolt from Telegram, and there was no API for typing into a running Claude Code session. Turns out tmux is one: just paste the message into the pane.

## Every wolt is a terminal

Each wolt is a coding agent (Claude Code, Codex, ...) running as is, in its own tmux session. We don't wrap it or re-implement it. When the agent gets better, the wolt gets better, for free.

When I tell people about woltspace, the gut reaction is often: "oh no, a new framework, a new harness to learn." No, no, no. Open a wolt in the terminal and it's your Claude Code, with your exact same settings. The only hint you're in a woltspace session is the session name at the bottom. We don't have opinions on how you use your coding agent, so there's nothing new to learn. And since it's the real CLI, used the way it's meant to be used, nothing breaks when it updates.

It also means adding a new harness comes down to one question: can you type into it in a terminal? No custom connectors, just a thin adapter. And we only build on what coding agents have in common. We don't overfit to one Claude Code feature or one Codex feature: if it's shared, it wins. If it isn't, you can still use it in your own setup, since you bring your own harness anyway. Woltspace gets out of the way.

The lodge's web view is just a window onto those sessions. Close the browser and the work keeps going. Come back from your laptop or your phone and you're in the same session, right where it was.

## Agents talk by typing into each other's panes

When wolts need to talk to each other, they use the [IWCL](/docs/orchestration/). Under the hood it's tmux again: a message gets pasted into the other wolt's pane, like you'd type it yourself. The reply comes back the same way.

That means no database and no service brokering messages. It's a dumb relay through tmux, plus a shared skill that teaches every wolt how to use it.

<!-- PROPOSAL (commie, 10-17): how IWCL works + why it's harness agnostic. Checked against the woltspace code (sessions.py deliver_message, harnesses.py). -->

Here's the whole trick. When one wolt runs `woltspace session send otto`, woltspace finds otto's tmux pane, checks there's really an agent in it, and pastes this:

```
[message from justinbeaver, session=justinbeaver-mossy-dam-3f81c2]
can you review the coffee page?
Reply by replacing YOUR_REPLY in this exact heredoc, then run it:
woltspace session send justinbeaver-mossy-dam-3f81c2 <<'...'
YOUR_REPLY
...
```

Then it presses Enter. That's it. The message carries its own return address and the exact command to answer with, so otto doesn't need to know anything about justinbeaver or about woltspace. It reads the text and runs a shell command, which every coding agent already knows how to do.

That's why IWCL is harness agnostic. It doesn't use Claude Code's API or Codex's API. It uses the one interface they all share: a terminal that accepts text and a shell that runs commands. A Claude Code wolt can message a Codex wolt, and neither one knows or cares what the other is running. Today that's Claude Code, Codex, opencode, Pi and Hermes, all through the same paste. The only per-harness detail we've needed so far: Codex wants half a second between the paste and the Enter.

<!-- end PROPOSAL -->

[Example: a real exchange, e.g. justinbeaver bringing in otto and nitpick for the coffee wiki page, ~4 min, nobody touching it.]

<!-- PROPOSAL (commie, 10-17): Telegram section. Checked against telegram_adapter.py (_route_to_session, voice -> transcribe_audio) + notify_prompt.py. -->

## Telegram is just another pane

Telegram works the exact same way, and it's where the whole thing started. When I message the lodge's bot, the bot pastes my message into my wolt's pane, with a reply instruction at the bottom:

```
[telegram message from human, chat_id=...]: can you find me the link to sign up?
Reply by replacing YOUR_REPLY in this exact heredoc, then run it:
notify --telegram ... <<'...'
YOUR_REPLY
...
```

The wolt answers by running `notify`, a plain shell command, and the reply lands on my phone. Voice notes get transcribed first and arrive as text, so I can talk to a wolt while walking. Same paste, same return address, same "run this command to answer" as IWCL. To the wolt, me on Telegram and another wolt look the same: text in the pane, a command to reply.

So Telegram is harness agnostic for free too. There's no Claude Code plugin and no Codex plugin. If a harness can read a terminal and run a shell command, I can text it from my phone. And because it's a real pane, I can switch: start a task on Telegram, open the same session on my laptop, keep going in the terminal.

<!-- end PROPOSAL -->

## No background tasks, full visibility

This is the part I like most. Most multi-agent setups spin up sub-agents in the background: you get a summary at the end, maybe a log if you're lucky.

Here there are no background tasks. Every agent is a real terminal, rendering in real time. You can see everything every wolt is doing, and you can jump in at any point: type into the pane, correct course, answer a question, then step back out.

Is it the most efficient thing in the world? No. We're rendering full terminals that nobody may be watching. But the visibility is worth it. [Your take on why being able to jump in matters: trust, debugging, fun.]

## Try it

[Link: woltspace.com install + the collab-lodge one-script setup, once it's public.]

