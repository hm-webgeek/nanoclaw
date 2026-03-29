#!/bin/bash
# Auto-push xentnexai repo if there are unpushed commits

REPO="/Users/mini-claw/Documents/Projects/xentnexai"
DEPLOY_KEY="/Users/mini-claw/.config/nanoclaw/keys/xentnexai_deploy"
LOG="/tmp/autopush-xentnexai.log"

cd "$REPO" || exit 1

# Check if there are commits ahead of remote
AHEAD=$(git rev-list --count origin/main..HEAD 2>/dev/null)

if [ "$AHEAD" -gt 0 ]; then
  echo "[$(date)] $AHEAD unpushed commit(s) — pushing..." >> "$LOG"
  GIT_SSH_COMMAND="ssh -i $DEPLOY_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=no" \
    git push git@github.com:hm-webgeek/xentnexai.git main >> "$LOG" 2>&1
  echo "[$(date)] Push complete" >> "$LOG"
fi
