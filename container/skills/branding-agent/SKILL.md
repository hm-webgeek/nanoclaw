---
name: branding-agent
description: Brand identity specialist — logo concepts, colour palettes, typography, visual guidelines, naming. Invoke when creating any new project, website, product, or app that needs a visual identity.
---

# Branding Agent

Invoke this sub-agent whenever the user is starting a new project that needs a visual identity, or explicitly asks for branding work: logos, colours, typography, brand guidelines, naming, or taglines.

## When to invoke

- New website, app, or product being created
- User asks for a logo, colour scheme, or brand guide
- Rebranding an existing project
- Naming a project or product

## How to invoke

Use the `Task` tool to spawn the branding sub-agent, passing it:
1. The project name and description
2. Any existing preferences (colours, mood, references the user mentioned)
3. The output location in the project workspace

### Example invocation prompt

```
You are a branding specialist. Work in two stages:
STAGE 1 — brand plan only. STAGE 2 — asset production, only after approval in the dashboard.

Project: [name]
Description: [what it does, who it's for]
Preferences: [any user-stated preferences, or "none specified"]
Output: Write all deliverables to /workspace/extra/miniclaw/[project]/brand/

--- STAGE 1: Brand Plan (do this first, then stop and request approval) ---

Research the industry and similar brands using agent-browser if needed. Then write
brand-plan.md to the output folder with:
- Proposed brand name rationale (if naming is in scope)
- Positioning statement
- Tone of voice (3-5 defining traits with examples)
- Colour direction: primary, secondary, accent — with hex codes, rationale, and usage notes
- Typography direction: heading font, body font (Google Fonts preferred), scale rationale
- Logo direction: concept description and rationale (wordmark, icon, or combination mark)
- Alt concepts considered and why they were ruled out

After writing brand-plan.md, write an approval request to /workspace/ipc/approvals/request-[project]-branding.json:
{
  "id": "[project]-branding-[timestamp]",
  "project": "[project]",
  "skill": "branding-agent",
  "stage": "Stage 1",
  "title": "Brand Plan — [project]",
  "plan_path": "/workspace/extra/miniclaw/[project]/brand/brand-plan.md",
  "summary": "[paste the first 3000 characters of brand-plan.md here]"
}

Then stop. DO NOT proceed to Stage 2 until approval is confirmed.

--- STAGE 2: Asset Production (only after approval is confirmed) ---

Using the approved brand-plan.md, produce all brand assets:

1. brand-guidelines.md — brand name rationale, voice/tone, positioning statement
2. colours.md — primary, secondary, accent palette with hex codes, RGB, HSL, and usage rules
3. typography.md — font pairings (Google Fonts preferred), scale, usage rules
4. logo.svg — a clean, usable SVG logo (wordmark, icon, or combination mark as approved)
5. logo-concepts.md — rationale for the chosen direction, alt concepts considered

For the SVG logo: use geometric/typographic marks that render crisply at small sizes.
Use the approved colour palette. Keep it simple — one or two colours max.

After completing, summarise the brand identity in 3-4 sentences.
```

## After the sub-agent completes

- Save the brand directory path in the project's index file
- Confirm to the user what was created and where
- Offer to iterate on any specific element (colours, logo direction, etc.)

## Colour selection guidance (for the sub-agent)

When selecting palettes, consider:
- **Industry context** — finance/legal: blues/greens (trust); creative/consumer: bolder choices
- **Accessibility** — ensure primary + background meet WCAG AA contrast (4.5:1)
- **Scalability** — define light/dark variants for both modes
- Always provide hex, RGB, and HSL for each colour

## Logo generation guidance (for the sub-agent)

Approach in order of preference:
1. **SVG wordmark** — clean typographic treatment of the brand name
2. **SVG icon + wordmark** — geometric or abstract mark alongside the name
3. **Describe the concept** and use `agent-browser` to generate via an image tool (Ideogram, Recraft, etc.) if the user needs a raster logo

For SVG logos, use `<text>` with a system-safe font stack or embed a minimal subset. Geometric shapes (`<circle>`, `<rect>`, `<path>`) are preferred over complex paths.

## Brand quality checklist

Before finishing Stage 2, verify:
- [ ] Colours meet WCAG AA contrast ratios
- [ ] Tone of voice is specific and differentiated — not generic adjectives
- [ ] Logo renders cleanly at 32px and at full width
- [ ] Typography scale covers heading, subheading, body, and small text
- [ ] All files are written to the output folder and paths are correct
