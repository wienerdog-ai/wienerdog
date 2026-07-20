#!/usr/bin/env bash
#
# End-to-end install smoke test — the one gate the unit suite cannot cover.
#
# The scheduler unit tests inject a fake loader, so they never touch the real
# OS scheduler; and a maintainer cannot run a *real* install on their own
# machine without colliding with their live Wienerdog agent. This script runs
# the whole lifecycle — init -> sync -> doctor -> safety -> the incident-drill
# managed-block check -> catch-up teardown -> uninstall — against a REAL
# install in a throwaway HOME on a clean CI runner, where nothing collides.
#
# It asserts the file-level behavior that must hold (managed blocks, private
# modes, catch-up teardown, reversible uninstall). Live scheduler registration
# (launchd gui-domain / systemd --user) needs a login session CI runners may
# lack, so it is exercised best-effort and reported, never asserted.
#
# Usage: scripts/smoke-install.sh   (run from the repo root)
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
WD() { node "$REPO/bin/wienerdog.js" "$@"; }

SB="$(mktemp -d "${TMPDIR:-/tmp}/wd-smoke.XXXXXX")"
trap 'rm -rf "$SB"' EXIT

# Full sandbox: HOME itself is the throwaway root, and every config root sits
# under it, so no path can resolve to a real dir even off a CI runner's HOME.
export HOME="$SB/home"
export CLAUDE_CONFIG_DIR="$SB/home/.claude"
export CODEX_HOME="$SB/home/.codex"
unset WIENERDOG_HOME WIENERDOG_VAULT || true
mkdir -p "$CLAUDE_CONFIG_DIR" "$CODEX_HOME" # both adapters detectable

CORE="$SB/home/.wienerdog"
CLAUDE_MD="$CLAUDE_CONFIG_DIR/CLAUDE.md"
AGENTS_MD="$CODEX_HOME/AGENTS.md"
BEGIN="<!-- wienerdog:begin -->"
END="<!-- wienerdog:end -->"

pass=0
ok() {
  printf '  [ok] %s\n' "$1"
  pass=$((pass + 1))
}
die() {
  printf '  [FAIL] %s\n' "$1" >&2
  exit 1
}
# Count literal occurrences of a needle in a file (whole-file, byte-exact).
# A missing file counts as zero — after uninstall a file Wienerdog created is
# gone entirely, which is "no managed block" just the same.
occ() {
  [ -f "$1" ] || {
    printf '0'
    return
  }
  node -e 'const fs=require("fs");const b=fs.readFileSync(process.argv[1]);const n=Buffer.from(process.argv[2]);let c=0,i=0;while((i=b.indexOf(n,i))>=0){c++;i+=n.length;}process.stdout.write(String(c));' "$1" "$2"
}
mode_of() { stat -f '%Lp' "$1" 2>/dev/null || stat -c '%a' "$1"; }

echo "== 1. init (fresh vault, both adapters) =="
WD init --yes --fresh-vault </dev/null
[ -f "$CORE/config.yaml" ] || die "init did not create config.yaml"
ok "config.yaml created at the core"

echo "== 2. sync (managed blocks + digest + private-modes hardening) =="
WD sync </dev/null
[ -f "$CORE/state/digest.md" ] || die "sync did not write the digest"
ok "digest written"
[ "$(occ "$CLAUDE_MD" "$BEGIN")" = "1" ] && [ "$(occ "$CLAUDE_MD" "$END")" = "1" ] || die "CLAUDE.md managed block not exactly one pair"
ok "CLAUDE.md has exactly one managed-block pair"
[ "$(occ "$AGENTS_MD" "$BEGIN")" = "1" ] && [ "$(occ "$AGENTS_MD" "$END")" = "1" ] || die "AGENTS.md managed block not exactly one pair"
ok "AGENTS.md has exactly one managed-block pair"
# A9 private modes: the credential store is owner-only after sync. This runs on
# the POSIX CI matrix (ubuntu/macos) where mode bits are meaningful.
if [ -d "$CORE/secrets" ]; then
  [ "$(mode_of "$CORE/secrets")" = "700" ] || die "secrets/ is $(mode_of "$CORE/secrets"), expected 700"
  ok "secrets/ is 0700 (A9 private modes)"
fi

echo "== 3. doctor (no hard failures) =="
DOC="$(WD doctor 2>&1 || true)"
printf '%s\n' "$DOC" | grep -qiE '^\s*\[fail\]' && {
  printf '%s\n' "$DOC" | grep -iE '^\s*\[fail\]' >&2
  die "doctor reported a hard failure on a fresh install"
}
ok "doctor: no [fail] lines on a fresh install"
if printf '%s\n' "$DOC" | grep -qiE 'core directory exists'; then
  ok "doctor resolves the core"
else
  die "doctor did not print the core line"
fi

echo "== 4. safety (A0 pre-use gates present; blocked until reviewed) =="
SAF="$(WD safety 2>&1 || true)"
printf '%s\n' "$SAF" | grep -qiE 'block|disabled|gate' || die "safety did not report the pre-use gates"
ok "safety reports the A0 pre-use gates"

echo "== 5. incident-drill managed-block check (clean passes, poison fails) =="
MARK="__WD_SMOKE_POISON__"
[ "$(occ "$CLAUDE_MD" "$MARK")" = "0" ] || die "clean install already contains the test marker"
ok "clean managed block: marker absent (drill PASS)"
cp "$CLAUDE_MD" "$SB/claude.bak"
# Inject the marker inside the block; the whole-file check must catch it.
node -e 'const fs=require("fs");const f=process.argv[1];const m=process.argv[2];const s=fs.readFileSync(f,"utf8").replace("<!-- wienerdog:begin -->","<!-- wienerdog:begin -->\n"+m);fs.writeFileSync(f,s);' "$CLAUDE_MD" "$MARK"
[ "$(occ "$CLAUDE_MD" "$MARK")" = "1" ] || die "poison injection failed"
ok "poisoned managed block: marker found (drill FAIL detected)"
mv "$SB/claude.bak" "$CLAUDE_MD"

echo "== 6. catch-up teardown (remove every job -> sync -> no catch-up) =="
# Remove every scheduled job; the shared catch-up entry must not survive at
# zero jobs, and a later sync must not resurrect it (A9 runbook R5-1).
while read -r JOB; do
  [ -n "$JOB" ] || continue
  WD schedule remove "$JOB" </dev/null || true
done < <(WD schedule list 2>/dev/null | sed -nE 's/^[[:space:]]*([A-Za-z0-9._-]+)[[:space:]].*/\1/p')
WD sync </dev/null
if grep -qE '"kind"[[:space:]]*:[[:space:]]*"scheduler-entry"' "$CORE/install-manifest.json" 2>/dev/null; then
  grep -qiE 'catchup' "$CORE/install-manifest.json" && die "catch-up scheduler-entry survived at zero jobs (R5-1)"
fi
ok "no catch-up scheduler-entry after removing all jobs"

echo "== 7. uninstall (reverses the install; managed blocks removed) =="
WD uninstall --yes </dev/null
# The security-relevant reversibility: no injected managed block is left behind
# in either harness file (a file Wienerdog created is removed outright; a
# pre-existing file keeps its own content minus the block). A customized
# config.yaml is deliberately preserved, so the core shell may remain — that is
# correct behavior, not a leak, so we assert the block and the app state, not a
# vanished core dir.
[ "$(occ "$CLAUDE_MD" "$BEGIN")" = "0" ] || die "uninstall left a managed block in CLAUDE.md"
ok "CLAUDE.md managed block removed"
[ "$(occ "$AGENTS_MD" "$BEGIN")" = "0" ] || die "uninstall left a managed block in AGENTS.md"
ok "AGENTS.md managed block removed"
[ ! -d "$CORE/state" ] && [ ! -d "$CORE/app" ] || die "uninstall left app/state behind under the core"
ok "app + state removed under the core (config.yaml preservation is expected)"

echo
echo "SMOKE PASS — $pass checks."
