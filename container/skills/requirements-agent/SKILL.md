---
name: requirements-agent
description: Discovery specialist — collects business requirements, defines USPs, and scaffolds the full project folder structure for the website generation pipeline.
---

# Requirements Agent

Invoke this sub-agent at the start of every website generation project. It conducts a structured discovery session, writes the project brief and USPs, and creates the entire folder and IPC directory structure so all subsequent agents have a clean workspace.

## When to invoke

- Starting a new website generation project
- Kicking off the website-generation orchestration pipeline (always Phase 1)

## How to invoke

Use the `Task` tool to spawn the requirements sub-agent, passing it:
1. The project name/slug (e.g. `xentnexai`)
2. Any known details — business name, URL, industry, goals, audience
3. The output base path

### Example invocation prompt

```
You are a requirements specialist. Conduct structured discovery for a new website project,
then scaffold the full project workspace.

Project slug: [slug]
Known details: [business name, URL, industry, goals, audience — or "none yet"]
Output base: /workspace/extra/miniclaw/[slug]/

--- STEP 1: Scaffold project workspace ---

Create the full directory structure the pipeline will need:

mkdir -p /workspace/extra/miniclaw/[slug]/brand
mkdir -p /workspace/extra/miniclaw/[slug]/wireframe
mkdir -p /workspace/extra/miniclaw/[slug]/seo/content
mkdir -p /workspace/extra/miniclaw/[slug]/creative/copy
mkdir -p /workspace/extra/miniclaw/[slug]/creative/banners
mkdir -p /workspace/extra/miniclaw/[slug]/site
mkdir -p /workspace/extra/miniclaw/[slug]/qa
mkdir -p /workspace/ipc/approvals
mkdir -p /workspace/ipc/qa

--- STEP 2: Research ---

If a URL or business name was provided, use agent-browser to:
- Visit the business website (if URL provided)
- Search for the business to understand what they do
- Visit 2-3 competitor sites to understand the landscape

--- STEP 3: Write deliverables ---

Write to /workspace/extra/miniclaw/[slug]/:

1. project-brief.md:
   - Business name and one-line description
   - What the business does and how it makes money
   - Target audience (who they are, what they need)
   - Geography (local/national/global, specific cities/regions if relevant)
   - Business goals for the website (leads, sales, awareness, bookings)
   - Pages needed (list each page with its purpose)
   - Existing brand assets (logo, colours, fonts — note if none)
   - Key competitors (name + URL)
   - Technical constraints (e.g. must integrate with Stripe, uses Calendly)

2. usp.md:
   - 5-10 unique selling points of the business
   - Ranked by importance to the target audience
   - Written from the audience's perspective ("You get X" not "We offer X")

--- STEP 4: Request approval ---

Write approval request to /workspace/ipc/approvals/request-[slug]-requirements.json:
{
  "id": "[slug]-requirements-[timestamp]",
  "project": "[slug]",
  "skill": "requirements-agent",
  "stage": "Stage 1",
  "title": "Project Requirements — [slug]",
  "plan_path": "/workspace/extra/miniclaw/[slug]/project-brief.md",
  "summary": "[paste the full content of project-brief.md here, up to 3000 chars]"
}

Then stop. Do not proceed until approval is confirmed in the dashboard.
```

## After the sub-agent completes

- Confirm folder structure was created
- Present the key requirements inline (audience, goals, pages list)
- Offer to refine any section before proceeding to branding

## Requirements quality checklist

Before requesting approval, verify:
- [ ] Audience is specific (not just "businesses" or "everyone")
- [ ] Goals are measurable or at least actionable
- [ ] All pages are listed with a clear purpose for each
- [ ] USPs are differentiated — not generic claims any competitor could make
- [ ] All IPC directories exist at `/workspace/ipc/approvals/` and `/workspace/ipc/qa/`
