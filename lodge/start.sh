#!/bin/sh
# Throwaway native lodge for show tests, on :${SHOW_TEST_PORT:-47996}, wolts in lodge/wolts.
# CLEAN env on purpose: a lodge started from a wolt's env inherits its tunnel and bot tokens and would
# start a second connector on the main Cloudflare tunnel and second Telegram/Slack bots.
# WOLTSPACE_BIN: the woltspace CLI to run (default: woltspace on PATH).
cd "$(dirname "$0")"
mkdir -p wolts && touch .lodge-show-throwaway
exec env -i HOME="$HOME" USER="$USER" PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin" \
  TERM=xterm-256color LANG=en_US.UTF-8 SHELL=/bin/zsh \
  WOLTSPACE_WOLTS_DIR="$PWD/wolts" WOLTSPACE_PUBLIC_TUNNEL=false ENABLE_TELEGRAM_BOT=false ENABLE_SLACK_BOT=false \
  "${WOLTSPACE_BIN:-woltspace}" serve --port "${SHOW_TEST_PORT:-47996}" --no-doctor
