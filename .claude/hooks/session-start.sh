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
#   3. Node pinned by .nvmrc — the base image ships Node 22; this project pins a
#      newer major. We provision it and verify it on every session (a check, so a
#      silent fall-back to the system Node is loud, not hidden).
#   4. Project dependencies (pnpm) — installed so tests/lint/build work the moment
#      the session starts, with native addons built against the pinned Node.
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

# 3. Node (.nvmrc pin) --------------------------------------------------------
# The base image ships Node 22 on PATH (/etc/profile.d/nodejs.sh), but this
# project pins its Node major in .nvmrc (CLAUDE.md runtime policy). We install
# that major via the system nvm and shim node/pnpm into $HOME/.local/bin, which
# $HOME/.local/bin/env prepends to PATH ahead of /opt/node22 ("override system
# binaries"). We shim into a directory already on PATH rather than mutating PATH
# itself: the shell's PATH is snapshotted per session, but directory CONTENTS
# resolve live at command time, so every later shell — the agent's tool calls and
# any subagents — gets the pinned Node regardless of when this hook runs relative
# to the shell snapshot. pnpm is the package manager (corepack-provided).
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NVMRC_FILE="${CLAUDE_PROJECT_DIR:-$REPO_ROOT}/.nvmrc"
NODE_MAJOR="$(head -1 "$NVMRC_FILE" 2>/dev/null | tr -dc '0-9.' | cut -d. -f1)"
NODE_MAJOR="${NODE_MAJOR:-24}"
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
if ! "$BIN_DIR/node" --version 2>/dev/null | grep -q "^v${NODE_MAJOR}\."; then
  log "Provisioning Node ${NODE_MAJOR} (.nvmrc pin)…"
  export NVM_DIR="${NVM_DIR:-/opt/nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1090,SC1091
    . "$NVM_DIR/nvm.sh"
    nvm install "$NODE_MAJOR" >/dev/null 2>&1 \
      || log "WARN: nvm install ${NODE_MAJOR} failed (network?) — pinned Node unavailable this session"
    NODE_BIN="$(dirname "$(nvm which "$NODE_MAJOR" 2>/dev/null)" 2>/dev/null)"
    if [ -n "${NODE_BIN:-}" ] && [ -x "$NODE_BIN/node" ]; then
      # corepack ships with the pinned node; enable pnpm so `pnpm`/`pnpx` shims exist
      "$NODE_BIN/corepack" enable --install-directory "$NODE_BIN" pnpm >/dev/null 2>&1 || true
      for b in node npm npx corepack pnpm pnpx; do
        [ -e "$NODE_BIN/$b" ] && ln -sf "$NODE_BIN/$b" "$BIN_DIR/$b"
      done
    fi
  else
    log "WARN: nvm not found at $NVM_DIR — cannot provision pinned Node (.nvmrc)"
  fi
fi

# Startup check — runs EVERY session (warm or cold): assert the shimmed Node
# matches the .nvmrc pin, so a silent fall-back to the system Node 22 (which bit
# an earlier session) is surfaced loudly instead of hidden.
ACTIVE_NODE="$("$BIN_DIR/node" --version 2>/dev/null || true)"
case "$ACTIVE_NODE" in
  v"${NODE_MAJOR}".*)
    log "Node check OK: $BIN_DIR/node is $ACTIVE_NODE + pnpm $("$BIN_DIR/pnpm" --version 2>/dev/null) (.nvmrc pins ${NODE_MAJOR})" ;;
  *)
    log "WARN: Node check FAILED — $BIN_DIR/node is '${ACTIVE_NODE:-missing}', expected v${NODE_MAJOR}.x per .nvmrc; later shells may fall back to system Node" ;;
esac

# 4. Project dependencies (pnpm) ----------------------------------------------
# Install node deps so tests/lint/build work the instant the session starts, and
# build native addons (better-sqlite3) against the PINNED Node. We prepend the
# Node shim dir to PATH for this step so node-gyp compiles for the right ABI.
# pnpm install is idempotent (fast on a warm store); but `pnpm install` alone will
# NOT recompile an unchanged dependency, so a native ABI mismatch (e.g. a cached
# node_modules built under the old Node major) is repaired with a targeted rebuild
# gated on an actual load probe.
if [ -f "$REPO_ROOT/package.json" ]; then
  log "Syncing project dependencies (pnpm)…"
  ( cd "$REPO_ROOT" && PATH="$BIN_DIR:$PATH" pnpm install ) \
    >/dev/null 2>&1 || log "WARN: pnpm install failed (network?) — deps may be incomplete"
  if ! ( cd "$REPO_ROOT" && PATH="$BIN_DIR:$PATH" node -e 'require("better-sqlite3")' ) >/dev/null 2>&1; then
    log "Native ABI mismatch — rebuilding better-sqlite3 against $("$BIN_DIR/node" --version 2>/dev/null)…"
    ( cd "$REPO_ROOT" && PATH="$BIN_DIR:$PATH" pnpm rebuild better-sqlite3 ) \
      >/dev/null 2>&1 || log "WARN: better-sqlite3 rebuild failed — DB tests may not load the native module"
  fi
fi

log "bootstrap complete"
exit 0
