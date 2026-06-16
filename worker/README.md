# Shared-key proxy (Cloudflare Worker)

This Worker lets visitors translate **without their own key**. It stores your
Gemini API key as a Cloudflare secret and proxies the Gemini Live WebSocket, so
the key is never shipped to the browser.

```
browser  ──wss──▶  Cloudflare Worker  ──wss + key──▶  Gemini Live API
(no key)           (holds GEMINI_API_KEY)
```

## One-time setup

You need a free [Cloudflare account](https://dash.cloudflare.com/sign-up) and a
standard Gemini API key (`AIza...`) from
[aistudio.google.com/apikey](https://aistudio.google.com/apikey).

```bash
cd worker

# 1. Install + log in (opens a browser)
npm install -g wrangler
wrangler login

# 2. Store your real Gemini key as a secret (paste it when prompted).
#    It is never written to any file or committed to git.
wrangler secret put GEMINI_API_KEY

# 3. Edit wrangler.toml -> ALLOWED_ORIGINS: set your GitHub Pages URL,
#    e.g. https://yourname.github.io  (keep http://localhost:8000 for testing)

# 4. Deploy
wrangler deploy
```

`wrangler deploy` prints a URL like:

```
https://openfrontier-translate.<your-subdomain>.workers.dev
```

## Point the site at the proxy

In `../app.js`, set `CONFIG.proxyUrl` to that URL with the **wss://** scheme:

```js
proxyUrl: "wss://openfrontier-translate.<your-subdomain>.workers.dev",
```

Commit and push. The key field disappears and the site shows
“✓ SHARED KEY ACTIVE” — anyone can translate, no key required.

## Test locally first (optional)

```bash
cd worker
echo 'GEMINI_API_KEY = "AIza...your-key..."' > .dev.vars   # gitignored
wrangler dev            # serves the proxy at ws://localhost:8787
```

Then temporarily set `CONFIG.proxyUrl = "ws://localhost:8787"` in app.js and run
the site on http://localhost:8000.

## Protecting your quota

- **ALLOWED_ORIGINS** already blocks WebSocket connections from other sites.
- For request-rate caps, add a **Rate limiting rule** in the Cloudflare
  dashboard (Security → WAF → Rate limiting rules) on the Worker route, or wire
  in a Durable Object counter.
- Watch usage in [Google AI Studio](https://aistudio.google.com); rotate the key
  with `wrangler secret put GEMINI_API_KEY` anytime.
