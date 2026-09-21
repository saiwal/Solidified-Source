#!/usr/bin/env bash
# Run every spa-core PHP check inside the ddev container.
#
# The checks live next to the code they guard (packages/spa-core/php/Api/**/
# *.test.php) and run against the *deployed* theme, so `npm run build` first if
# you have edited the PHP. Each one prints its own ok/FAIL lines; this only
# collects the verdicts.
#
#   npm run test:php              # every check
#   npm run test:php -- parity    # only checks whose path matches "parity"
#
# Set HZ_DDEV_DIR if the Hubzilla ddev project is not at ../hz-ddev.
set -uo pipefail

HZ="${HZ_DDEV_DIR:-../hz-ddev}"
filter="${1:-}"

if [ ! -d "$HZ" ]; then
  echo "no ddev project at $HZ — set HZ_DDEV_DIR" >&2
  exit 2
fi
cd "$HZ" || exit 2

mapfile -t tests < <(
  ddev exec find core/extend/theme/utsukta-themes -path '*/spa-core/Api/*' \
    -name '*.test.php' 2>/dev/null | tr -d '\r' | sort
)

if [ "${#tests[@]}" -eq 0 ]; then
  echo "no deployed checks found — run 'npm run build' first" >&2
  exit 2
fi

pass=0; fail=0; skip=0; failed=()

for t in "${tests[@]}"; do
  [ -n "$filter" ] && [[ "$t" != *"$filter"* ]] && continue
  name="${t##*/spa-core/Api/}"
  printf '%-42s ' "$name"

  out="$(ddev exec php "$t" 2>&1)"
  code=$?
  last="$(printf '%s\n' "$out" | grep -vE '^\s*$' | tail -1)"

  # exit 2 is a check that needs arguments (a channel nick) or found nothing to
  # probe — not a failure, just not runnable unattended.
  if [ "$code" -eq 2 ]; then
    # the reason is the check's own first line ("usage: ..."); ddev's own red
    # failure notice lands last and says nothing useful.
    why="$(printf '%s\n' "$out" | sed 's/\x1b\[[0-9;]*m//g' | grep -viE '^failed to execute' | grep -vE '^\s*$' | head -1)"
    echo "SKIP  ${why:0:60}"; skip=$((skip+1))
  elif [ "$code" -eq 0 ]; then
    echo "ok    ${last:0:60}"; pass=$((pass+1))
  else
    echo "FAIL  ${last:0:60}"; fail=$((fail+1)); failed+=("$name")
  fi
done

echo
echo "$pass passed, $fail failed, $skip skipped"
if [ "$fail" -gt 0 ]; then
  printf '  failed: %s\n' "${failed[@]}"
  exit 1
fi
