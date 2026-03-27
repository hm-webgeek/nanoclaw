---
name: page-builder-agent
description: Next.js developer — assembles the complete website from SEO content, creative copy, and visual assets into a production-ready Next.js App Router project.
---

# Page Builder Agent

Invoke this sub-agent after SEO content and creative assets are both complete (Phase 6 of the website-generation pipeline). It scaffolds or extends a Next.js App Router project, builds all pages from the assembled content, wires in brand tokens, and confirms the build passes before handing off to QA.

## When to invoke

- After seo-agent Stage 2 and creative-agent Stage 2 are both complete
- All content files exist in `/seo/content/` and `/creative/copy/`
- Visual assets are in `/creative/banners/`

## How to invoke

Use the `Task` tool to spawn the page-builder sub-agent, passing it the full context.

### Example invocation prompt

```
You are a Next.js developer. Build the complete website from assembled content and assets.

Stack: Next.js 14+ (App Router), TypeScript, Tailwind CSS
Brief: /workspace/extra/miniclaw/[project]/project-brief.md
Brand: /workspace/extra/miniclaw/[project]/brand/ (read all files)
Wireframe: /workspace/extra/miniclaw/[project]/wireframe/page-architecture.md
SEO content: /workspace/extra/miniclaw/[project]/seo/content/ (read all .md files)
Creative copy: /workspace/extra/miniclaw/[project]/creative/copy/ (read all .md files)
Visual assets: /workspace/extra/miniclaw/[project]/creative/banners/
Output: /workspace/extra/miniclaw/[project]/site/

--- BUILD INSTRUCTIONS ---

1. Scaffold the Next.js project if /site/ is empty:
   cd /workspace/extra/miniclaw/[project]/site
   npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*"

2. Configure brand tokens in tailwind.config.ts:
   - Add brand colours from colours.md as Tailwind theme extensions
   - Add Google Fonts from typography.md via next/font

3. For each page in page-architecture.md, create the corresponding route:
   - app/page.tsx → homepage
   - app/[slug]/page.tsx → other pages
   - Build each page section by section following page-architecture.md structure

4. Content priority rules:
   - SEO content takes precedence for: H1, H2s, meta title, meta description, body structure
   - Creative copy takes precedence for: sub-headlines, CTAs, tone of supporting copy
   - Where they conflict, prefer SEO structure with creative tone

5. For every page component, add generateMetadata():
   - title: from seo/content/[page].md Meta section
   - description: from seo/content/[page].md Meta section

6. Place visual assets:
   cp /workspace/extra/miniclaw/[project]/creative/banners/* /workspace/extra/miniclaw/[project]/site/public/images/
   Reference them in components with Next.js <Image> — always include width, height, alt

7. Create shared components:
   - components/Header.tsx — nav with primary CTA
   - components/Footer.tsx — links, contact, legal
   - Any section components used across multiple pages

8. Verify the build:
   cd /workspace/extra/miniclaw/[project]/site
   npm install
   npm run build

   Fix ALL TypeScript errors and build failures before finishing.
   Do not leave any 'any' casts introduced by this build — type everything properly.

After a clean build, write a summary: pages built, components created, any content decisions made.
```

## After the sub-agent completes

- Confirm clean build (no TypeScript errors)
- List pages and routes created
- Highlight any content that was missing and how it was handled
- Hand off to qa-agent

## Build quality checklist

Before finishing, verify:
- [ ] `npm run build` passes with zero errors
- [ ] Every page has a `generateMetadata()` export
- [ ] All images use `<Image>` with alt text, width, and height
- [ ] Brand colours and fonts are applied consistently
- [ ] No hardcoded hex values — all colours come from Tailwind config
- [ ] Mobile-responsive (Tailwind responsive prefixes used throughout)
- [ ] No placeholder text or TODO comments left in components
