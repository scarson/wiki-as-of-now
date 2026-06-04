#!/bin/bash
# SessionStart bootstrap for WikiAsOfNow (Claude Code on the web).
#
# Each web session runs in a fresh, ephemeral container where $HOME/.claude is
# empty. The repo itself is the only thing that persists. This hook restores the
# user-scoped tooling the repo depends on so a web session comes up fully wired:
#
#   1. gstack (global, team mode) — the repo runs gstack in "required" mode, and
#      .claude/hooks/check-gstack.sh blocks ALL Skill usage when gstack is not
#      installed at ~/.claude/skills/gstack. Without this bootstrap every fresh
#      web session would have all skills blocked.
#   2. superpowers plugin from the official Anthropic marketplace (it is enabled
#      in .claude/settings.json but the plugin payload lives in the ephemeral
#      ~/.claude cache and must be reinstalled).
#
# The agent-skills bundle is vendored under .claude/skills/ and is committed to
# the repo, so it needs no bootstrap here.
#
# Synchronous + idempotent: safe to run every session. On a warm container cache
# the steps are near-instant; on a cold container they re-download.
set -uo pipefail

log() { printf '[session-start] %s\n' "$*"; }

# Only bootstrap user-scoped tooling in the remote (web) environment. Local
# developers install gstack themselves per CLAUDE.md / gstack team-mode docs.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

GSTACK_DIR="$HOME/.claude/skills/gstack"

# 1. gstack — global install, team mode ---------------------------------------
if [ ! -d "$GSTACK_DIR/bin" ]; then
  log "Installing gstack (global, team mode)…"
  git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git "$GSTACK_DIR" \
    || log "WARN: gstack clone failed (network?) — gstack skills unavailable this session"
fi
if [ -x "$GSTACK_DIR/setup" ]; then
  ( cd "$GSTACK_DIR" && GSTACK_SKIP_FONTS=1 GSTACK_SKIP_COREUTILS=1 ./setup --team < /dev/null ) \
    >/dev/null 2>&1 || log "WARN: gstack setup reported an error (continuing)"
fi

# 2. superpowers plugin — official Anthropic marketplace ----------------------
claude plugin marketplace add anthropics/claude-plugins-official >/dev/null 2>&1 || true
claude plugin install superpowers@claude-plugins-official        >/dev/null 2>&1 || true

log "bootstrap complete"
exit 0
