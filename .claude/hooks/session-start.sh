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

# 3. Node 24 (.nvmrc pin) -----------------------------------------------------
# The base image ships Node 22 on PATH (/etc/profile.d/nodejs.sh), but this
# project pins Node 24 (.nvmrc, CLAUDE.md runtime policy). We install 24 via the
# system nvm and shim node/pnpm into $HOME/.local/bin, which $HOME/.local/bin/env
# prepends to PATH ahead of /opt/node22 ("override system binaries"). We shim into
# a directory already on PATH rather than mutating PATH itself: the shell's PATH is
# snapshotted per session, but directory CONTENTS resolve live at command time, so
# every later shell — the agent's tool calls and any subagents — gets Node 24
# regardless of when this hook runs relative to the shell snapshot. pnpm is the
# package manager (corepack-provided alongside node24).
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
if ! "$BIN_DIR/node" --version 2>/dev/null | grep -q '^v24\.'; then
  log "Provisioning Node 24 (.nvmrc pin)…"
  export NVM_DIR="${NVM_DIR:-/opt/nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1090,SC1091
    . "$NVM_DIR/nvm.sh"
    nvm install 24 >/dev/null 2>&1 \
      || log "WARN: nvm install 24 failed (network?) — Node 24 unavailable this session"
    N24BIN="$(dirname "$(nvm which 24 2>/dev/null)" 2>/dev/null)"
    if [ -n "${N24BIN:-}" ] && [ -x "$N24BIN/node" ]; then
      # corepack ships with node24; enable pnpm so `pnpm`/`pnpx` shims exist
      "$N24BIN/corepack" enable --install-directory "$N24BIN" pnpm >/dev/null 2>&1 || true
      for b in node npm npx corepack pnpm pnpx; do
        [ -e "$N24BIN/$b" ] && ln -sf "$N24BIN/$b" "$BIN_DIR/$b"
      done
      log "Node $("$BIN_DIR/node" --version 2>/dev/null) + pnpm $("$BIN_DIR/pnpm" --version 2>/dev/null) ready"
    fi
  else
    log "WARN: nvm not found at $NVM_DIR — cannot provision Node 24 (.nvmrc)"
  fi
fi

log "bootstrap complete"
exit 0
