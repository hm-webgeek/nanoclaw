#!/usr/bin/env bash
# Setup script: registers the theaireport group and schedules the daily pipeline
# Run this AFTER nanoclaw has started at least once (so data/ipc/main/messages/ exists)

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NANOCLAW_DIR="$(dirname "$SCRIPT_DIR")"
# Discover the main group's IPC task directory dynamically
IPC_DIR=""
for candidate in "$NANOCLAW_DIR/data/ipc/"*/tasks; do
  IPC_DIR="$candidate"
  break
done

if [[ -z "$IPC_DIR" || ! -d "$IPC_DIR" ]]; then
  echo "❌ IPC tasks directory not found under $NANOCLAW_DIR/data/ipc/"
  echo "   Start NanoClaw once first so the directory is created, then re-run."
  exit 1
fi

echo "→ Using IPC directory: $IPC_DIR"

TIMESTAMP=$(date +%s)

# Step 1: Register the theaireport group
echo "→ Writing register_group IPC message..."
cat > "$IPC_DIR/register-theaireport-${TIMESTAMP}.json" <<'EOF'
{
  "type": "register_group",
  "jid": "theaireport@internal",
  "name": "The AI Report",
  "folder": "theaireport",
  "trigger": "theaireport",
  "requiresTrigger": false,
  "containerConfig": {
    "additionalMounts": [
      {
        "host": "/Users/mini-claw/Projects/theaireport",
        "container": "/workspace/theaireport"
      }
    ]
  }
}
EOF

echo "   Waiting 3s for NanoClaw to process registration..."
sleep 3

# Step 2: Schedule the daily 7am pipeline
echo "→ Writing schedule_task IPC message..."
cat > "$IPC_DIR/schedule-theaireport-${TIMESTAMP}.json" <<'EOF'
{
  "type": "schedule_task",
  "targetJid": "theaireport@internal",
  "prompt": "Run the AI Report daily pipeline: scrape RSS sources, filter for business relevance using Ollama, tag categories, write articles with Claude, generate hero images via Stable Diffusion, commit and push MDX files to git. Follow the full pipeline in your CLAUDE.md.",
  "schedule_type": "cron",
  "schedule_value": "0 7 * * *",
  "context_mode": "isolated"
}
EOF

echo "✅ Done. NanoClaw will:"
echo "   1. Register the 'theaireport' group (container mounts /Users/mini-claw/Projects/theaireport)"
echo "   2. Schedule the AI Report pipeline at 7am daily"
echo ""
echo "Next steps:"
echo "  - Push theaireport to GitHub and connect to Cloudflare Pages"
echo "  - Test manually: send 'Run the AI Report pipeline now' to your main NanoClaw chat"
echo "  - Ensure Ollama is running: ollama serve"
echo "  - Optional: start Stable Diffusion AUTOMATIC1111 on localhost:7860"
