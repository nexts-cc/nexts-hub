#!/usr/bin/env bash
set -euo pipefail

headers=(-H 'content-type: application/json')
if [[ -n "${BROWSER_AGENT_BRIDGE_TOKEN:-}" ]]; then
  headers+=(-H "authorization: Bearer ${BROWSER_AGENT_BRIDGE_TOKEN}")
fi

# Fixed connection target — loopback + pinned port, not configurable.
curl -sS \
  "${headers[@]}" \
  -X POST \
  --data "$1" \
  "http://127.0.0.1:18765/rpc"
