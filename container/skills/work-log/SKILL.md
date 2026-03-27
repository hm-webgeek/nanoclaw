---
name: work-log
description: Structured work-done log appended by agents after completing actions
---

# Work Log

Agents write a brief entry to `/workspace/group/work-done.md` after completing any meaningful work. This creates a persistent, human-readable audit trail of what was done and when.

## When to log

Log an entry after completing any of the following:

- Sending a message to the user (beyond a simple acknowledgement)
- Writing, modifying, or deleting a file in the workspace
- Running a bash command with real-world effects
- Calling an external API or service
- Creating, updating, or deleting a scheduled task
- Completing a research, analysis, or generation task

Do **not** log:
- Initial acknowledgement messages ("On it!")
- Internal reasoning steps
- File reads or searches with no side effects

## Format

Append entries in this format:

```
## YYYY-MM-DD HH:MM

**Task:** <one-line description of what was requested>
**Actions:**
- <action 1>
- <action 2>
**Result:** <brief outcome — completed / partial / failed and why>

---
```

## Example

```
## 2026-03-27 14:32

**Task:** Research competitor pricing and summarize findings
**Actions:**
- Fetched 4 competitor URLs via agent-browser
- Wrote summary to /workspace/group/research/competitor-pricing.md
- Sent report to user via send_message
**Result:** Completed — 4 sources compared, report delivered

---

## 2026-03-27 15:10

**Task:** Schedule daily 9am news digest
**Actions:**
- Created cron task: daily 09:00, prompt "fetch and summarize tech news"
**Result:** Completed — task ID: abc123

---
```

## Implementation

Use `Bash` to append:

```bash
cat >> /workspace/group/work-done.md << 'EOF'
## 2026-03-27 14:32

**Task:** ...
**Actions:**
- ...
**Result:** ...

---
EOF
```

Always use the actual current timestamp. Create the file if it does not exist — the first entry can include a `# Work Done` header.
