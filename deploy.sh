#!/usr/bin/env bash
# Publishes Pocket Skies to https://hexa3.github.io/pocket-skies/
set -euo pipefail
cd /home/sheheryar/pocket-skies

gh repo create hexa3/pocket-skies --public --source . --remote origin \
  --description "Hands-first WebXR puzzle garden: pinch the sun, drag the clouds, bloom a tiny island in your lap."

gh api -X POST repos/hexa3/pocket-skies/pages -f build_type=workflow >/dev/null \
  || gh api -X PUT repos/hexa3/pocket-skies/pages -f build_type=workflow >/dev/null

git push -u origin main

sleep 5
RUN_ID=$(gh run list --repo hexa3/pocket-skies --workflow pages.yml --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch "$RUN_ID" --repo hexa3/pocket-skies --exit-status

echo
echo "Live at: https://hexa3.github.io/pocket-skies/"
