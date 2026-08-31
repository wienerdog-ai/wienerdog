#!/usr/bin/env bash
#
# live-scheduler-probe.sh — read-only probe for a live Wienerdog scheduler
# registration in this OS user's real scheduler domain (launchd on macOS,
# systemd --user on Linux). WP-smoke-live-scheduler-preflight / issue #169.
#
# It reads the scheduler; it never writes one, never spawns the Wienerdog
# CLI, and creates no files. Three outcomes, three exit codes:
#   0  CLEAN          the client answered and nothing matched the prefix.
#   1  LIVE            the client answered and something matched; the
#                       matching line(s) are printed.
#   2  NOT-PROBEABLE   the client is absent, failed, or this platform has no
#                       supported query. Never collapsed into 0 — an
#                       unanswerable scheduler is an absence of evidence, not
#                       evidence of absence.
#
# Usage: scripts/live-scheduler-probe.sh [prefix]   (prefix defaults to
# "ai.wienerdog."; matched as a fixed string, never a regex or a path.)
set -euo pipefail

# Absolute by contract: a bare-name `launchctl` lookup could resolve through a
# shimmed PATH and make the probe observe its own machinery instead of the OS
# (the same reasoning as tests/scenarios/scheduler-guard.js:42).
LAUNCHCTL_PATH="/bin/launchctl"

PREFIX="${1:-ai.wienerdog.}"

not_probeable() {
  printf 'not-probeable: %s\n' "$1"
  exit 2
}

case "$(uname -s)" in
Darwin)
  if [ ! -x "$LAUNCHCTL_PATH" ]; then
    not_probeable "launchctl client absent at $LAUNCHCTL_PATH"
  fi
  if OUT="$("$LAUNCHCTL_PATH" print "gui/$(id -u)" 2>/dev/null)"; then
    RC=0
  else
    RC=$?
  fi
  if [ "$RC" -ne 0 ]; then
    not_probeable "launchctl print gui/$(id -u) exited $RC"
  fi
  ;;
Linux)
  if ! command -v systemctl >/dev/null 2>&1; then
    not_probeable "systemctl client absent"
  fi
  if OUT="$(systemctl --user list-units --all --no-legend 2>/dev/null)"; then
    RC=0
  else
    RC=$?
  fi
  if [ "$RC" -ne 0 ]; then
    not_probeable "systemctl --user list-units exited $RC"
  fi
  ;;
*)
  not_probeable "no supported scheduler query on $(uname -s)"
  ;;
esac

MATCHES="$(printf '%s\n' "$OUT" | grep -F "$PREFIX" || true)"
if [ -n "$MATCHES" ]; then
  printf '%s\n' "$MATCHES"
  exit 1
fi
exit 0
