#!/usr/bin/env bash
# Run from the repo root AFTER unzipping the update over it.
# Removes files from the v1 canvas engine that the v2 WebGL2 rewrite replaces.
set -euo pipefail
while read -r f; do
  [ -z "$f" ] && continue
  case "$f" in \#*) continue;; esac
  if [ -e "$f" ]; then git rm -q --ignore-unmatch "$f" 2>/dev/null || rm -f "$f"; echo "removed $f"; fi
done < REMOVED_FILES.txt
find src -type d -empty -delete
echo "done. now: npm ci && npm run lint && npm test && npm run build"
