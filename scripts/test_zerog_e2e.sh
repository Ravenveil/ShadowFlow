#!/usr/bin/env bash
# End-to-end test for the 0G bridge + ZeroGCheckpointStore
#
# Mode A (memory fallback, no private key needed):
#   bash scripts/test_zerog_e2e.sh
#
# Mode B (real 0G testnet):
#   ZEROG_PRIVATE_KEY=0x... bash scripts/test_zerog_e2e.sh
#
set -euo pipefail

BRIDGE_PORT=${BRIDGE_PORT:-3099}
BRIDGE_DIR="$(cd "$(dirname "$0")/../bridge" && pwd)"
PYTHON="${PYTHON:-python}"

echo "=== ShadowFlow × 0G Bridge E2E Test ==="

# ── 1. Start bridge ────────────────────────────────────────────
echo
echo "1. Starting bridge on :$BRIDGE_PORT ..."
if [ -z "${ZEROG_PRIVATE_KEY:-}" ]; then
  echo "   No ZEROG_PRIVATE_KEY → memory-fallback mode"
  ZEROG_FALLBACK=1 PORT=$BRIDGE_PORT node "$BRIDGE_DIR/dist/index.js" &
else
  echo "   ZEROG_PRIVATE_KEY set → 0G testnet mode"
  PORT=$BRIDGE_PORT node "$BRIDGE_DIR/dist/index.js" &
fi
BRIDGE_PID=$!
trap "kill $BRIDGE_PID 2>/dev/null || true" EXIT

# wait for bridge to boot
sleep 2

# ── 2. Health check ────────────────────────────────────────────
echo
echo "2. Health check ..."
HEALTH=$(curl -sf "http://127.0.0.1:$BRIDGE_PORT/health")
echo "   $HEALTH"
MODE=$(echo "$HEALTH" | python -c "import sys,json; print(json.load(sys.stdin)['mode'])")
echo "   mode=$MODE"

# ── 3. Python ZeroGCheckpointStore test ────────────────────────
echo
echo "3. Python ZeroGCheckpointStore round-trip ..."
$PYTHON - <<PYEOF
import sys
sys.path.insert(0, ".")
from shadowflow.runtime.checkpoint_store import ZeroGCheckpointStore
from shadowflow.runtime.contracts import CheckpointRef

bridge_url = "http://127.0.0.1:$BRIDGE_PORT"
store = ZeroGCheckpointStore(bridge_url=bridge_url)

raw = {
    "checkpoint_id": "e2e-ckpt-1",
    "run_id": "e2e-run-1",
    "step_id": "step-analyze",
    "state": {
        "current_node_id": "analyze",
        "next_node_id": "summarize",
        "visited_nodes": ["analyze"],
        "last_output": {"text": "analysis done"},
        "state": {},
    },
    "writeback": {
        "channel": "checkpoint",
        "target": "zerog",
        "mode": "reference",
        "host_action": "persist_checkpoint_ref",
        "next_node_id": "summarize",
        "resume_supported": True,
    },
    "state_ref": None,
    "metadata": {"test": "e2e"},
}
ckpt = CheckpointRef.model_validate(raw)

# PUT
record = store.put(ckpt)
assert record.checkpoint_id == "e2e-ckpt-1", f"bad id: {record.checkpoint_id}"
assert record.location.startswith("0g://"), f"bad location: {record.location}"
print(f"   put OK  location={record.location}")

# GET
retrieved = store.get("e2e-ckpt-1")
assert retrieved is not None, "get returned None"
assert retrieved.checkpoint_id == "e2e-ckpt-1"
print(f"   get OK  state.next_node={retrieved.writeback.next_node_id}")

# LIST
records = store.list_run("e2e-run-1")
assert any(r.checkpoint_id == "e2e-ckpt-1" for r in records), "not in list"
print(f"   list OK  {len(records)} record(s) in run")

print("\n   ✅ ZeroGCheckpointStore round-trip PASSED")
PYEOF

echo
echo "=== E2E test PASSED  (mode=$MODE) ==="
