---
name: website-generation
description: Orchestration skill — coordinates all sub-agents to produce a complete Next.js website. Runs requirements, branding, wireframe, SEO, creative, page-builder, QA, and deployment in the correct order with approval gates between phases.
---

# Website Generation

This skill orchestrates the full pipeline for generating a Next.js website from brief to deployment. You are the conductor — spawn sub-agents, wait for their outputs, check approval status before advancing, and assemble the final product.

## Prerequisites

Before starting, confirm:
- Project name and slug (e.g. `xentnexai`)
- Project brief exists or needs to be created (run requirements-agent first if not)
- Output base path: `/workspace/extra/miniclaw/[project]/`

## Pipeline Overview

```
Phase 1  [sequential — needs human input]
  └── requirements-agent → project-brief.md, usp.md          [APPROVAL GATE]

Phase 2  [sequential — builds on brief]
  └── branding-agent Stage 1 → brand-plan.md                 [APPROVAL GATE]
      branding-agent Stage 2 → brand assets (on approval)

Phase 3  [sequential — needs brand context]
  └── wireframe-agent → page-architecture.md                  [APPROVAL GATE]

Phase 4  [parallel — both read from brief + brand + wireframe]
  ├── seo-agent Stage 1 → seo-plan.md                        [APPROVAL GATE]
  └── creative-agent Stage 1 → creative-brief.md             [APPROVAL GATE]

Phase 5  [parallel — after both Phase 4 approvals]
  ├── seo-agent Stage 2 → SEO content files
  └── creative-agent Stage 2 → copy + visual assets

Phase 6  [sequential — assembles all outputs]
  └── page-builder-agent → Next.js site code

Phase 7  [sequential — validates the build]
  └── qa-agent → QA report, auto-fixes, issues logged to dashboard  [APPROVAL GATE if issues]

Phase 8  [sequential — deploys to production]
  └── deployment-agent → Cloudflare Pages
```

## Approval gates

All approvals are handled in the browser dashboard (port 3002 → Approvals tab). Do NOT ask the user for approval via chat message. Sub-agents write approval requests to `/workspace/ipc/approvals/` which appear in the dashboard automatically.

Between phases that have an approval gate: poll the approval status by checking whether the relevant output files from Stage 2 exist. If a Stage 2 output file is not yet present, the approval is still pending — do not proceed.

## Phase-by-phase execution

### Phase 1 — Requirements

Invoke requirements-agent as documented in `.claude/skills/requirements-agent/SKILL.md`.
Pass: project slug, any known business details.

**Important:** requirements-agent also scaffolds the entire folder and IPC directory structure in Step 1. This must complete before any other agent runs.

Wait for `/workspace/extra/miniclaw/[project]/project-brief.md` to exist and approval to be confirmed before proceeding.

### Phase 2 — Branding

Invoke branding-agent as documented in `.claude/skills/branding-agent/SKILL.md`.
Pass: project name, description from project-brief.md, any preferences from usp.md.

Wait for `/workspace/extra/miniclaw/[project]/brand/brand-guidelines.md` to exist (Stage 2 complete) before proceeding.

### Phase 3 — Wireframe

Invoke wireframe-agent as documented in `.claude/skills/wireframe-agent/SKILL.md`.
Pass: brief, brand guidelines, USP file paths.

Wait for approval in the dashboard before proceeding to Phase 4.

### Phase 4 — SEO + Creative (parallel)

Spawn both sub-agents simultaneously using parallel Task tool calls:

1. **SEO agent** — follow `.claude/skills/seo-agent/SKILL.md`. Pass: brief, brand, wireframe, audience from project-brief.md.
2. **Creative agent** — follow `.claude/skills/creative-agent/SKILL.md`. Pass: brief, full brand folder, pages from page-architecture.md.

Both will write approval requests to the dashboard. Wait for BOTH to show approved before proceeding to Phase 5.

### Phase 5 — SEO content + Creative assets (parallel)

Once both Phase 4 approvals are confirmed, spawn both agents again for Stage 2:

1. **SEO agent Stage 2** — generate content files per the approved seo-plan.md
2. **Creative agent Stage 2** — generate copy + visual assets per the approved creative-brief.md

Wait for both to complete before proceeding.

### Phase 6 — Page Builder

Invoke page-builder-agent as documented in `.claude/skills/page-builder-agent/SKILL.md`.
Pass: all content paths (brief, brand, wireframe, SEO content, creative copy, visual assets).

### Phase 7 — QA

Invoke qa-agent as documented in `.claude/skills/qa-agent/SKILL.md`.

Wait for QA to pass (zero BLOCKERs, or QA approval confirmed in dashboard) before proceeding.

### Phase 8 — Deployment

Invoke deployment-agent as documented in `.claude/skills/deployment-agent/SKILL.md`.
Pass: site path, project slug.

## After the pipeline completes

- Report the live URL to the user
- Summarise: pages built, keywords targeted, assets generated, QA results, deployment status
- Save project index at `/workspace/extra/miniclaw/[project]/index.md` with paths to all key files
