---
name: seo-agent
description: SEO specialist — keyword research, search intent analysis, and content generation structured around approved keywords. Invoke for any page or section requiring SEO-optimised copy.
---

# SEO Agent

Invoke this sub-agent for keyword research and SEO-driven content generation: target keyword identification, search intent mapping, competitor gap analysis, and writing page copy structured around approved keywords.

## When to invoke

- Researching target keywords for a new page or site
- Writing page copy that needs to rank (hero, about, features, service pages)
- Generating meta titles, meta descriptions, and H1/H2 structure
- Identifying content gaps vs competitors
- Any page creation task where organic search performance matters

## How to invoke

Use the `Task` tool to spawn the SEO sub-agent, passing it:
1. The project brief or a path to it (e.g. `/workspace/group/[project]-brief.txt`)
2. The full brand context — all files in `/workspace/extra/miniclaw/[project]/brand/`:
   - `brand-guidelines.md` — voice, tone, positioning
3. The target pages or sections needing SEO treatment
4. The primary audience and geography (e.g. "UK-based SMEs, targeting London")
5. The output location

### Example invocation prompt

```
You are an SEO strategist and content writer. Work in two stages:
STAGE 1 — keyword research and plan only. STAGE 2 — content generation, only after the user approves the plan.

Brief: [path to brief, e.g. /workspace/group/xentnexai-brief.txt]
Brand: Read all files in /workspace/extra/miniclaw/[project]/brand/ — specifically brand-guidelines.md
Pages needing SEO: [e.g. homepage, AI Lead Generation page, Pricing page]
Audience: [e.g. UK-based marketing managers at SMEs]
Output: Write all deliverables to /workspace/extra/miniclaw/[project]/seo/

--- STAGE 1: Keyword Research & Content Plan (do this first, then stop and wait for approval) ---

Read the project brief and brand files. Then research and write seo-plan.md to the output folder.
For each target page include:

- Primary keyword (the single term this page should rank for)
- Secondary keywords (3-5 supporting terms, long-tail variants, questions)
- Search intent (informational / navigational / commercial / transactional)
- Estimated competition level (low / medium / high) and rationale
- Recommended H1, H2 structure (outline only, no full copy yet)
- Meta title (under 60 chars) and meta description (under 155 chars)
- Internal linking opportunities (other pages this should link to/from)

Use web search to validate keyword viability: check what currently ranks, identify gaps,
and confirm the terms match real search behaviour.

After writing seo-plan.md, write an approval request to /workspace/ipc/approvals/request-[project]-seo.json:
{
  "id": "[project]-seo-[timestamp]",
  "project": "[project]",
  "skill": "seo-agent",
  "stage": "Stage 1",
  "title": "SEO Plan — [project]",
  "plan_path": "/workspace/extra/miniclaw/[project]/seo/seo-plan.md",
  "summary": "[paste the first 3000 characters of seo-plan.md here]"
}

Then stop. DO NOT proceed to Stage 2 until approval is confirmed in the dashboard.

--- STAGE 2: Content Generation (only after approval) ---

For each page in the approved plan, write a content file to /workspace/extra/miniclaw/[project]/seo/content/:

- Filename: [page-slug].md (e.g. homepage.md, ai-lead-generation.md)
- Structure each file as:
  ## Meta
  Title: ...
  Description: ...

  ## H1
  [heading]

  ## Body
  [full page copy, structured by H2 sections from the approved plan]

  ## CTAs
  [section-level call-to-action copy variants — 2-3 options each]

Writing guidelines:
- Lead with the primary keyword naturally in the first 100 words
- Use secondary keywords in H2s and body — never force them
- Match the brand voice from brand-guidelines.md exactly
- Write for the reader first, search engine second
- Keep sentences short. Prefer active voice.
- Avoid keyword stuffing — if a term sounds unnatural, rephrase
- Each page must have one clear conversion goal

After completing, summarise: keywords targeted per page, key content decisions, and any assumptions made.
```

## After the sub-agent completes

- Save the SEO directory path in the project's index file
- Present key outputs inline (primary keywords per page, H1s, meta titles) — don't just say "files saved"
- Offer to refine specific pages, revisit keyword choices, or adjust tone to better match brand guidelines
- Flag any pages where keyword competition is high and alternatives should be considered

## Running in parallel with creative-agent

SEO and creative work can run concurrently — spawn both sub-agents via parallel `Task` tool calls.
The SEO agent's content files and the creative agent's copy files should then be reconciled by the
main agent before final page assembly: SEO copy takes precedence for structure; creative copy takes
precedence for tone and headlines where they differ.

## Content quality checklist

Before finishing, verify:
- [ ] Primary keyword appears in H1, first paragraph, and at least one H2
- [ ] Meta title is under 60 characters and includes primary keyword
- [ ] Meta description is under 155 characters and includes a CTA
- [ ] Each H2 addresses a specific user question or subtopic
- [ ] No section is purely keyword-driven — every paragraph serves the reader
- [ ] Tone is consistent with brand-guidelines.md throughout
- [ ] Every page has one clear CTA
