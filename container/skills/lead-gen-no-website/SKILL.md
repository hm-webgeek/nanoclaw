---
name: lead-gen-no-website
description: Lead generation for web agencies. Scrapes Google Maps for local businesses with no website, generates a personalised one-page site for each, deploys it to a live preview URL, then sends a personalised outreach email with the link and a calendar booking CTA.
---

# Lead Gen — No-Website Businesses

Finds local businesses with no website, builds them one, sends it to them.

## Required environment variables

These must be set in `/workspace/project/.env` or the group's environment:

```
OUTSCRAPER_API_KEY=        # outscraper.com — used to query Google Maps
RESEND_API_KEY=            # resend.com — used to send outreach emails
OUTREACH_FROM_EMAIL=       # e.g. hello@xentnexai.com.au
OUTREACH_CALENDAR_URL=     # Calendly / Cal.com link for booking
OUTREACH_AGENCY_NAME=      # e.g. XentnexAI
OUTREACH_SENDER_NAME=      # e.g. Hamish
SURGE_TOKEN=               # surge.sh token — for deploying preview sites
```

---

## How to invoke

The user will provide:
- **Niche** — e.g. "roofer", "plumber", "cafe", "physio"
- **City** — e.g. "Sunshine Coast, Queensland"
- **Count** — how many leads to target (max 50 per run)

Example trigger message:
> "Run the no-website lead gen skill. Niche: cafe. City: Sunshine Coast QLD. Count: 20."

---

## Phase 1 — Scrape Google Maps

Call the OutScraper API to find businesses matching the niche and city that have no website listed.

```bash
curl -s "https://api.outscraper.com/maps/search-v3" \
  -H "X-API-KEY: $OUTSCRAPER_API_KEY" \
  -G \
  --data-urlencode "query=${NICHE} in ${CITY}" \
  --data-urlencode "limit=${COUNT}" \
  --data-urlencode "language=en" \
  | jq '.data[0] | map(select(.site == null or .site == "")) | .[:'"$COUNT"']'
```

Extract for each result:
- `name` — business name
- `full_address` — address
- `phone` — phone number
- `category` — business category
- `rating` — Google rating
- `reviews` — review count
- `about` — description if available

Discard any result that has a `site` value. Present a numbered list to the user:

```
Found 18 businesses in [niche] in [city] with no website:

1. [Business Name] — [address] — ⭐ [rating] ([reviews] reviews)
2. ...

Reply with numbers to generate sites and send outreach (e.g. "1, 3, 5, 7")
or "all" to process all of them.
```

**Stop here and wait for the user's selection.**

---

## Phase 2 — Generate websites

For each selected business, generate a personalised one-page website.

### Website brief

Use this prompt to generate the HTML:

```
You are a professional web designer building a one-page website for a local business.

Business details:
- Name: {name}
- Type: {category}
- Address: {full_address}
- Phone: {phone}
- Rating: {rating} stars ({reviews} reviews)
- Description: {about}

Generate a complete, self-contained single HTML file for this business. Requirements:
- Inline all CSS (no external stylesheets, no CDN links)
- Mobile-responsive
- Professional, clean design appropriate for a local {category} business
- Sections: hero (name + tagline), about, services (inferred from category), contact (address + phone)
- Colour scheme: pick 2-3 colours appropriate for the business type
- Include a prominent CTA button ("Call Us" linking to tel:{phone})
- Footer with address and "Website by {OUTREACH_AGENCY_NAME}"
- No JavaScript required
- Must look great and be production-ready

Output ONLY the complete HTML file, nothing else.
```

### Save and deploy

```bash
SLUG=$(echo "{name}" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd '[:alnum:]-')
mkdir -p /tmp/lead-gen-sites/$SLUG
# [write generated HTML to /tmp/lead-gen-sites/$SLUG/index.html]

# Deploy to surge.sh
npm install -g surge 2>/dev/null
echo $SURGE_TOKEN | surge --project /tmp/lead-gen-sites/$SLUG --domain ${SLUG}.surge.sh
```

This gives a live URL: `https://${SLUG}.surge.sh`

---

## Phase 3 — Send outreach emails

For each business, send a personalised email via Resend.

### Email template

Subject: `I built you a website, [Business Name]`

```
Hi [Business Name] team,

I noticed [Business Name] doesn't have a website yet — and with [reviews] reviews on Google,
you're clearly doing great work. You deserve an online presence that shows it.

So I went ahead and built you one.

👉 Check it out here: https://${SLUG}.surge.sh

No strings attached — I just wanted to show you what's possible.

If you like it and want to make it yours (custom domain, more pages, booking system),
I'd love to chat. You can grab 15 minutes with my team here:

[OUTREACH_CALENDAR_URL]

Either way, I hope it puts a smile on your face.

– [OUTREACH_SENDER_NAME]
[OUTREACH_AGENCY_NAME]
```

### Send via Resend

```bash
curl -s -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "'"$OUTREACH_SENDER_NAME"' <'"$OUTREACH_FROM_EMAIL"'>",
    "to": ["'"$business_email"'"],
    "subject": "I built you a website, '"$business_name"'",
    "html": "'"$email_html"'"
  }'
```

**Note on email addresses:** OutScraper results sometimes include email addresses. If no email is present, note this in the summary — the user may want to follow up manually or use a different outreach channel for those businesses.

---

## Phase 4 — Report results

Post a summary via IPC:

```bash
cat > /workspace/ipc/messages/leadgen-done-$(date +%s).json << EOF
{
  "type": "message",
  "text": "✅ Lead gen complete — [niche] in [city]\n\n**Sites built & deployed:**\n{list of business name + surge URL}\n\n**Emails sent:** {n}\n**No email found:** {list of names}\n\n**Total:** {n} leads contacted."
}
EOF
```

---

## Error handling

- **OutScraper fails:** Post error, suggest checking API key and balance
- **Surge deploy fails:** Save HTML locally, report URL as unavailable, still send email without preview link (mention "site being finalised")
- **Resend fails:** Log which emails failed, include in summary
- **No results found:** "No businesses found matching [niche] in [city] without a website. Try a broader niche or different city."

---

## Cost estimate

- OutScraper: ~$0.01 per business result
- Resend: free tier covers 3,000 emails/month
- Surge.sh: free tier for unlimited static sites
- Claude API (site generation): ~$0.01–0.03 per site

**Approximate cost per 20-lead run: ~$0.40–$0.80**
