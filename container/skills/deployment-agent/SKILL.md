---
name: deployment-agent
description: Deployment engineer — pushes the built Next.js site to GitHub and deploys to Cloudflare Pages. Confirms the live URL is accessible before reporting success.
---

# Deployment Agent

Invoke this sub-agent after QA passes (Phase 8 of the website-generation pipeline). It initialises git if needed, creates a GitHub repo, pushes the site, creates a Cloudflare Pages project linked to the repo, and confirms the live URL is accessible.

## When to invoke

- After qa-agent passes (no BLOCKERs, or all issues resolved)
- QA approval gate is cleared in the dashboard

## How to invoke

Use the `Task` tool to spawn the deployment sub-agent.

### Example invocation prompt

```
You are a deployment engineer. Deploy this Next.js site to Cloudflare Pages via GitHub.

Site: /workspace/extra/miniclaw/[project]/site/
Project slug: [project]
GitHub account: [from environment or project-brief.md]

--- DEPLOYMENT STEPS ---

1. Initialise git (if not already a repo):
   cd /workspace/extra/miniclaw/[project]/site
   git init
   git add .
   git commit -m "Initial site build — [project]"

2. Create .gitignore if missing:
   echo "node_modules\n.next\n.env*.local" > .gitignore
   git add .gitignore && git commit -m "chore: add .gitignore" --allow-empty

3. Create GitHub repository:
   gh repo create [project] --public --source=. --remote=origin --push
   (If repo already exists: git remote add origin https://github.com/[account]/[project].git && git push -u origin main)

4. Create Cloudflare Pages project (if not already exists):
   npx wrangler pages project create [project] \
     --production-branch main

   Configure build settings via wrangler.toml or Cloudflare dashboard:
   - Build command: npm run build
   - Output directory: .next
   - Node.js version: 18+

5. Trigger deployment:
   npx wrangler pages deploy .next --project-name [project] --branch main

   Or push triggers auto-deploy if GitHub integration is configured.

6. Confirm the deployment:
   - Get the live URL from wrangler output or `gh` CLI
   - Open the URL with agent-browser: agent-browser open [url]
   - Take a snapshot to confirm the homepage loads: agent-browser snapshot
   - Verify the page title matches the expected H1/meta title

Report: live URL, deployment ID, and screenshot confirmation.
```

## After the sub-agent completes

- Report the live URL prominently
- Save it to `/workspace/extra/miniclaw/[project]/index.md` along with all key file paths
- Offer to set up a custom domain if needed

## Deployment quality checklist

Before reporting success, verify:
- [ ] `git push` succeeded with no errors
- [ ] Cloudflare Pages build log shows success (check via wrangler or dashboard)
- [ ] Live URL returns HTTP 200
- [ ] Page title is correct (not a Cloudflare error page)
- [ ] At least one image loads (visual assets deployed correctly)

## Environment variables

If the site requires environment variables (API keys, endpoints), check project-brief.md for any noted technical integrations. Add them via:
```
npx wrangler pages secret put SECRET_NAME --project-name [project]
```
Flag any required env vars that are not yet set — the site may deploy but fail at runtime.
