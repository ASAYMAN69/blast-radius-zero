#!/usr/bin/env bash
# secret-scan — fail if a secret is tracked, staged, or present in git history.
#
# NEVER prints a secret. It prints the FILE PATH and the LINE NUMBER only.
# Exit 0 = clean. Exit 1 = a secret was found.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

PATTERNS='gsk_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----'

fail=0
note() { printf '%s\n' "$1"; }

# 1. Tracked files -------------------------------------------------------
tracked_hits=$(git grep -InE "$PATTERNS" -- . 2>/dev/null | cut -d: -f1-2 | sort -u)
if [ -n "$tracked_hits" ]; then
  note "FAIL  a secret pattern appears in TRACKED files:"
  printf '%s\n' "$tracked_hits" | sed 's/^/      /'
  fail=1
else
  note "ok    no secret pattern in tracked files"
fi

# 2. The index (staged content) -----------------------------------------
staged_hits=$(git diff --cached --name-only 2>/dev/null | while read -r f; do
  [ -f "$f" ] && grep -InE "$PATTERNS" "$f" 2>/dev/null | cut -d: -f1-2
done | sort -u)
if [ -n "$staged_hits" ]; then
  note "FAIL  a secret pattern appears in STAGED content:"
  printf '%s\n' "$staged_hits" | sed 's/^/      /'
  fail=1
else
  note "ok    no secret pattern in staged content"
fi

# 3. Untracked-but-not-ignored files -------------------------------------
#     A file that is neither tracked nor ignored is about to be committed.
untracked_hits=$(git ls-files --others --exclude-standard 2>/dev/null | while read -r f; do
  [ -f "$f" ] && grep -IlE "$PATTERNS" "$f" 2>/dev/null | sed 's/$/:1/'
done | sort -u)
if [ -n "$untracked_hits" ]; then
  note "FAIL  a secret pattern appears in an UNTRACKED, UNIGNORED file:"
  printf '%s\n' "$untracked_hits" | sed 's/^/      /'
  note "      either gitignore it or remove the secret."
  fail=1
else
  note "ok    no secret pattern in untracked, unignored files"
fi

# 4. Git history ---------------------------------------------------------
#     Every blob ever committed, scanned. Slow on a big repo; this one is small.
history_hits=$(git rev-list --all --objects 2>/dev/null \
  | git cat-file --batch-check='%(objectname) %(objecttype)' 2>/dev/null \
  | awk '$2=="blob"{print $1}' \
  | git cat-file --batch 2>/dev/null \
  | grep -cE "$PATTERNS" 2>/dev/null || true)
if [ "${history_hits:-0}" -gt 0 ]; then
  note "FAIL  a secret pattern appears in GIT HISTORY (${history_hits} blob(s))."
  note "      Rewriting history is required: treat the key as compromised and rotate it."
  fail=1
else
  note "ok    no secret pattern in git history"
fi

# 5. The ignore rules are doing their job ---------------------------------
if git check-ignore -q .env 2>/dev/null; then
  note "ok    .env is ignored"
else
  note "FAIL  .env is not ignored — it would be committable"
  fail=1
fi
if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  note "FAIL  .env is TRACKED"
  fail=1
else
  note "ok    .env is not tracked"
fi

if [ "$fail" -eq 0 ]; then
  note "PASS  no secrets found"
  exit 0
fi
note "FAIL  one or more secret checks failed"
exit 1
