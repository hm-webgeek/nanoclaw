---
name: wireframe-agent
description: Information architect — produces a page architecture document defining all pages, sections, and content order before copywriting and SEO begin.
---

# Wireframe Agent

Invoke this sub-agent after branding is complete and before SEO and creative work begins. It produces a lightweight page architecture document — not visual wireframes, but a structural plan that defines what pages exist, what sections each contains, and in what order. This prevents SEO and creative agents from making conflicting structural assumptions.

## When to invoke

- After branding assets are produced (Phase 3 of website-generation pipeline)
- Before spawning seo-agent or creative-agent
- Any time the site structure needs to be defined or revised

## How to invoke

Use the `Task` tool to spawn the wireframe sub-agent, passing it:
1. The project brief path
2. The brand guidelines path
3. The USP file path
4. The output location

### Example invocation prompt

```
You are an information architect. Define the page structure for this website.

Brief: Read /workspace/extra/miniclaw/[project]/project-brief.md
Brand: Read /workspace/extra/miniclaw/[project]/brand/brand-guidelines.md
USPs: Read /workspace/extra/miniclaw/[project]/usp.md
Output: /workspace/extra/miniclaw/[project]/wireframe/page-architecture.md

--- STAGE 1: Page Architecture (produce this, then stop for approval) ---

Read all input files. Then write page-architecture.md with the following structure
for each page in the site:

## [Page Name] — /[slug]

**Purpose:** What this page must achieve for the user and the business
**Primary CTA:** The single most important action on this page
**SEO intent:** What search query this page primarily targets

### Sections (in order)
| # | Section | Content type | ~Words | Notes |
|---|---------|-------------|--------|-------|
| 1 | Hero | Headline + subheadline + CTA | 30 | Primary keyword in H1 |
| 2 | ... | ... | ... | ... |

---

Include every page from project-brief.md. Add a shared components section for elements
that appear across pages (header, footer, nav CTA).

After writing page-architecture.md, write approval request to /workspace/ipc/approvals/request-[project]-wireframe.json:
{
  "id": "[project]-wireframe-[timestamp]",
  "project": "[project]",
  "skill": "wireframe-agent",
  "stage": "Stage 1",
  "title": "Page Architecture — [project]",
  "plan_path": "/workspace/extra/miniclaw/[project]/wireframe/page-architecture.md",
  "summary": "[paste the full content of page-architecture.md here, up to 3000 chars]"
}

Then stop. Do not proceed further.
```

## After the sub-agent completes

- Confirm pages and section count
- Flag any pages from the brief that seem redundant or missing
- Offer to consolidate pages or add a missing one before proceeding

## Architecture quality checklist

Before requesting approval, verify:
- [ ] Every page from project-brief.md is included
- [ ] Every page has exactly one primary CTA
- [ ] Every page has a defined SEO intent (no two pages target the same query)
- [ ] Section order follows a logical narrative (problem → solution → proof → CTA)
- [ ] Shared components (nav, footer) are documented
