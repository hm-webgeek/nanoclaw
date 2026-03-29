---
name: ai-news-xentnexai
description: Daily AI news pipeline for xentnexai.com.au. Fully automated — determines today's service topic by sequential rotation, scrapes relevant news, writes one article, generates a WebP hero image, and commits.
---

# XentnexAI — Daily AI News Pipeline

Fully automated. No user approval required. Publishes **one article per day** tied to a rotating XentnexAI service topic.

## Workspace

- Site root: `/workspace/xentnexai`
- Articles output: `/workspace/xentnexai/content/articles/`
- Images output: `/workspace/xentnexai/public/images/articles/`
- Deploy key: `/workspace/deploy-keys/xentnexai_deploy`
- IPC messages: `/workspace/ipc/messages/`

---

## Pipeline

### Step 1 — Determine today's date and service topic

Run this Python snippet to get today's date (Brisbane time) and which service topic to cover:

```python
from datetime import datetime, timezone, timedelta, date

brisbane = timezone(timedelta(hours=10))
today = datetime.now(brisbane).date()

epoch = date(2026, 1, 1)
days = (today - epoch).days

services = [
    {
        'name': 'AI Lead Generation',
        'description': 'AI-powered lead capture, qualification, and nurture automation for small businesses',
        'search_terms': ['AI lead generation 2026', 'AI sales automation small business', 'AI CRM tools'],
        'category': 'automation'
    },
    {
        'name': 'AI Voice Agents',
        'description': 'AI voice agents for phone answering, call handling, and customer service automation',
        'search_terms': ['AI voice agent 2026', 'AI phone answering service', 'conversational AI customer service'],
        'category': 'ai-tools'
    },
    {
        'name': 'GEO / AI Search Visibility',
        'description': 'Generative Engine Optimisation — being visible in ChatGPT, Gemini, and Perplexity search results',
        'search_terms': ['generative engine optimisation 2026', 'AI search visibility business', 'ChatGPT Gemini Perplexity business'],
        'category': 'industry-news'
    },
    {
        'name': 'AI Website Building',
        'description': 'AI-powered web design, website generation, and rapid deployment tools for businesses',
        'search_terms': ['AI website builder 2026', 'AI web design tools', 'AI website generation business'],
        'category': 'ai-tools'
    }
]

service = services[days % 4]
today_str = today.isoformat()

print(f"Date: {today_str}")
print(f"Service topic: {service['name']} (day {days}, rotation index {days % 4})")
```

Store `today_str` and `service` for use in subsequent steps.

---

### Step 2 — Scrape RSS sources for relevant news

Fetch these feeds and collect items from the last 48 hours:

```
https://techcrunch.com/tag/artificial-intelligence/feed/
https://venturebeat.com/ai/feed/
https://www.theverge.com/rss/ai-artificial-intelligence/index.xml
https://news.ycombinator.com/rss
https://feeds.feedburner.com/oreilly/radar
```

Use `curl` or Bash. Extract: title, link, pubDate, description.
For Hacker News, filter to items mentioning AI, ML, LLM, GPT, Claude, or automation.
Collect up to 30 candidate items.

---

### Step 3 — Score relevance to today's service topic (Ollama)

For each candidate item, call Ollama with `qwen2.5:14b` to score relevance **specifically to today's service topic**:

```
"You are an editor for an AI news site targeting Sunshine Coast small business owners.
Today's focus topic is: {service['name']} — {service['description']}

Given this article title and description, score how relevant it is to this specific topic:
1. Score 1-5 (5=directly relevant to {service['name']}, 1=unrelated)
2. If score >= 3: write a 2-sentence summary focused on the practical business value.

Title: {title}
Description: {description}

Reply in JSON: {\"score\": N, \"summary\": \"...\"}"
```

Discard items with score < 3. Keep the rest sorted by score descending.

**If Ollama is unavailable:** Try `ollama serve &`, wait 5s, retry once. If still down, pick the first candidate item that contains any of today's search terms in the title or description.

**If zero items remain after filtering:** Skip publishing, notify via IPC: "No relevant news found for {service['name']} on {today_str}. Site unchanged."

---

### Step 4 — Select the single best item

Pick the **highest-scoring item** from Step 3. If there are ties, prefer the most recent.

This is the one article to write today.

---

### Step 5 — Write the article

Write a full MDX article for the selected item:

- **Length:** 550–750 words
- **Structure:** Intro paragraph → 3–4 H2 subheadings with body → "What This Means for Sunshine Coast Businesses" section
- **Tone:** Practical, conversational, Australian English — written for a local business owner, not a developer
- **Local angle:** The final section must connect this news to how it affects businesses on the Sunshine Coast / in regional Queensland
- **Slug format:** `{today_str}-{kebab-case-title}` (keep total filename under 80 chars)

MDX frontmatter:
```yaml
---
title: "..."
date: "{today_str}"
category: "{service['category']}"
summary: "{2-sentence summary from Ollama}"
heroImage: "/images/articles/{slug}.webp"
sources:
  - url: "{original article URL}"
    title: "{original article title}"
---
```

Save to: `/workspace/xentnexai/content/articles/{slug}.mdx`

---

### Step 6 — Generate hero image (WebP)

Generate a hero image via ComfyUI.

- API: `http://host.docker.internal:8188` (NOT 127.0.0.1)
- Verify availability: `GET http://host.docker.internal:8188/system_stats`
- FLUX model loader: use `UnetLoaderGGUF` — discover via `GET http://host.docker.internal:8188/object_info/UnetLoaderGGUF`
- Dimensions: 1200×630
- Style: photorealistic editorial photography, clean professional, teal/navy palette

Derive the image prompt from the article title and service topic. Examples:
- Lead Generation: "Professional business owner reviewing AI-generated lead list on laptop, coastal office, clean editorial photography, teal accent lighting"
- Voice Agents: "AI voice assistant answering phone call, digital waveform visualisation, small business setting, teal and navy colour scheme"
- GEO/AI Search: "Business appearing in AI search results on smartphone screen, ChatGPT-style interface, professional editorial style, teal accents"
- Website Building: "Professional website launching on screen, AI-generated design elements, coastal business setting, clean editorial photography"

**After ComfyUI generates the PNG**, convert it to WebP using Python:

```python
from PIL import Image
img = Image.open('/workspace/xentnexai/public/images/articles/{slug}.png')
img.save('/workspace/xentnexai/public/images/articles/{slug}.webp', 'WEBP', quality=85)
import os; os.remove('/workspace/xentnexai/public/images/articles/{slug}.png')
```

**Fallback:** If ComfyUI is unavailable, generate a geometric PIL-based hero image using the XentnexAI style:
- Dark navy background (`#0B1426`)
- Teal accents (`#2DD4BF` / `#1BA899`)
- Subtle grid lines, corner bracket accents, glowing teal nodes connected by lines
- Save directly as WebP: `img.save(path, 'WEBP', quality=85)`
- Size: 1280×640

Always save the final image as `.webp`. The `heroImage` frontmatter value must end in `.webp`.

---

### Step 7 — Commit (push handled automatically)

```bash
cd /workspace/xentnexai
git add content/articles/{slug}.mdx public/images/articles/{slug}.webp
git commit -m "chore: add AI news article for {today_str}"
```

Do NOT push — the host machine runs an auto-push script every 5 minutes.

---

### Step 8 — Notify via IPC

```bash
cat > /workspace/ipc/messages/ainews-done-$(date +%s).json << EOF
{
  "type": "message",
  "text": "✅ AI News published for {today_str}: \"{article title}\" [{service name}] — xentnexai.com.au/ai-news"
}
EOF
```

---

## Error Handling

- **RSS fetch fails:** Skip that source, continue with others
- **Ollama unavailable:** Use keyword fallback (Step 3). Do not abort
- **Zero relevant items:** Notify via IPC and exit cleanly — do not fabricate sources
- **ComfyUI unavailable:** Use PIL geometric fallback (Step 6). Do not abort
- **Git commit fails:** Notify via IPC with error details

## Important Constraints

- Publish exactly **one article per day**
- Do not fabricate sources — every article must trace back to a real scraped item
- Always include the Sunshine Coast / local Australian business angle
- `heroImage` must end in `.webp` — never `.png`
- Git commit only to `main` branch
- Australian English spelling throughout
