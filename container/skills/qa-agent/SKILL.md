---
name: qa-agent
description: QA engineer — validates the generated Next.js site across code, content, SEO, accessibility, and functional checks. Auto-fixes minor issues, gates on structural problems, and reports everything to the dashboard.
---

# QA Agent

Invoke this sub-agent after the page-builder-agent completes (Phase 7 of the website-generation pipeline). It runs a structured set of checks, auto-fixes what it can, flags what needs human review, and writes results to both a report file and the QA dashboard panel.

## When to invoke

- After page-builder-agent confirms a clean build
- Before deployment

## How to invoke

Use the `Task` tool to spawn the QA sub-agent.

### Example invocation prompt

```
You are a QA engineer. Validate the generated website and report all findings.

Site: /workspace/extra/miniclaw/[project]/site/
SEO plan: /workspace/extra/miniclaw/[project]/seo/seo-plan.md
Brand: /workspace/extra/miniclaw/[project]/brand/colours.md
Report: /workspace/extra/miniclaw/[project]/qa/qa-report.md

Run all checks below. For each issue: attempt auto-fix first, then flag if unfixable.

--- CODE CHECKS ---

1. Build: run npm run build in the site directory
   - Fix TypeScript errors (wrong types, missing imports, unused vars with side effects)
   - Fix broken import paths
   - If build still fails after fixes, flag as BLOCKER

2. Lint: run npm run lint if configured
   - Apply auto-fixable lint rules (npx eslint --fix)
   - Flag remaining lint errors

--- CONTENT CHECKS ---

3. Placeholder text: search for "lorem", "[TODO]", "FIXME", "placeholder", "coming soon"
   - Flag each occurrence with file and line — do not auto-fix content

4. Missing sections: compare each page component against page-architecture.md
   - Flag any sections defined in the architecture but absent from the component

--- SEO CHECKS ---

5. Meta per page: verify generateMetadata() exists on every page route
   - Check title length (warn if >60 chars), description length (warn if >155 chars)
   - Auto-fix: truncate if clearly over limit and still meaningful

6. H1 per page: verify exactly one <h1> per page
   - Flag pages with zero or multiple H1s — do not auto-fix heading hierarchy

7. Image alt text: find all <Image> components missing alt prop
   - Auto-fix: add descriptive alt text based on filename and page context

--- ACCESSIBILITY CHECKS ---

8. Interactive elements: find <button> and <a> with no text content and no aria-label
   - Auto-fix: add aria-label based on context

9. Colour contrast: check brand colours in colours.md against WCAG AA (4.5:1 for normal text)
   - Flag failures — do not auto-fix colours

--- FUNCTIONAL CHECKS ---

10. Internal links: find all href values starting with / and verify the route exists in app/
    - Flag dead links — do not auto-fix

11. External links: find href values starting with http — verify they are intentional
    - Flag any that look like placeholder URLs (example.com, yoursite.com, etc.)

--- REPORT ---

Write qa-report.md with three sections:

## ✅ Passed
List of checks that passed cleanly.

## 🔧 Auto-Fixed
List each issue fixed, with: file, what was wrong, what was changed.

## ⚠️ Needs Review
List each unfixed issue with: severity (BLOCKER / WARNING / INFO), file, description, suggested fix.

--- IPC REPORTS ---

Write a QA run record to /workspace/ipc/qa/qa-[project]-[timestamp].json:
{
  "_update": false,
  "id": "qa-[project]-[timestamp]",
  "project": "[project]",
  "status": "passed|failed|partial",
  "issues_found": N,
  "issues_fixed": N,
  "issues_pending": N,
  "report_path": "/workspace/extra/miniclaw/[project]/qa/qa-report.md",
  "summary": "[N issues found, N auto-fixed, N require review — key items: ...]"
}

If issues_pending > 0, also write an approval request to /workspace/ipc/approvals/request-[project]-qa.json:
{
  "id": "[project]-qa-[timestamp]",
  "project": "[project]",
  "skill": "qa-agent",
  "stage": "QA Review",
  "title": "QA Issues — [project]",
  "plan_path": "/workspace/extra/miniclaw/[project]/qa/qa-report.md",
  "summary": "[paste the Needs Review section of qa-report.md here, up to 3000 chars]"
}

If issues_pending = 0 (all passed or auto-fixed), skip the approval request — deployment can proceed.
```

## After the sub-agent completes

- Surface the Needs Review items inline — don't just say "see the report"
- For each BLOCKER: stop and wait for the user to resolve it before deployment
- For WARNINGs: present them but offer to proceed anyway
- Offer to re-run QA after fixes are applied

## Severity definitions

| Severity | Meaning | Blocks deployment? |
|----------|---------|-------------------|
| BLOCKER | Build fails, missing H1, dead nav links | Yes |
| WARNING | Long meta titles, contrast failures, placeholder text | User decides |
| INFO | Minor accessibility improvements, style suggestions | No |
