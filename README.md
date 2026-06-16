# Open Frontier // Live Translation

A single-page web app that live-translates the [Open Frontier](https://www.openfrontier.ai/)
livestream (or any YouTube video) using **Gemini 3.5 Live Translate**, showing a
real-time **captions** feed and an optional translated voice you can mix against
the original audio.

It mirrors the openfrontier.ai theme: near-black background, white text, orange
(`#f97316`) accent, monospace typography, and a scrolling researcher marquee.

**Live:** https://samadasyed.github.io

---

## Features

- **Pick a target language** (38 languages, BCP-47).
- **Original-audio %** slider — sets how loud the original stream plays (drives
  the embedded YouTube player volume).
- **Translated-audio** volume + on/off toggle.
- **Start Translation** — captures the stream audio and streams it to Gemini.
- **Real-time captions** — the translated text streams into the **CAPTIONS**
  panel word-by-word (a blinking cursor marks the live line; finished lines dim).
  No on-video overlay, no waiting for a pause.
- **Demo / Livestream** toggle — ships with a NeurIPS 2025 panel as the demo;
  drop in the real livestream ID on event day.

The site is **keyless for visitors**: a free Cloudflare Worker holds the Gemini
key server-side, so anyone can translate without entering a key (see
[Authentication](#authentication)).

---

## How it works

1. Pick a target language and press **Start** (no key needed — shared mode).
2. The browser asks what to share. Use **Chrome or Edge** and tick **“Also share
   tab audio.”** There are two ways to run it:

   | Mode | What to share | Result |
   |---|---|---|
   | **Embedded (this page)** | **This Tab** | Live **captions only** — turn the translated voice **off** |
   | **Separate tab** | Open the stream in another tab, share **that** | Captions **+ translated voice** |

3. The shared audio is downsampled to 16 kHz PCM and streamed over a WebSocket
   (via the Worker) to `gemini-3.5-live-translate-preview`.
4. Gemini streams back a live transcription → the **CAPTIONS** panel, plus 24 kHz
   translated audio → played here if the voice is on.

> ### ⚠️ Avoiding the echo loop
> Anything the page plays is part of the tab audio we capture. So if you share
> **This Tab** with the translated voice **on**, that voice gets re-captured and
> Gemini re-translates its own output (target → target) — it loops on the same
> phrase. **Same-tab capture is captions-only; turn the voice off.** For
> captions **and** voice, use the separate-tab mode, where the voice plays in
> this tab and the original is captured from the other tab — nothing re-enters.

### Capturing this tab’s own audio

Two Chrome defaults work against self-capture, so the app overrides both in its
`getDisplayMedia` call (`app.js`):

- `selfBrowserSurface: "include"` — Chrome **excludes the calling tab** from the
  picker by default, so the app’s own tab wouldn’t even appear as shareable.
- `audio: { restrictOwnAudio: false }` — Chrome **strips audio originating from
  the capturing tab** by default (anti-feedback), which would silence the
  embedded player on a self-capture.

Browser support: tab **audio** capture via `getDisplayMedia` works in **Chrome /
Edge** (desktop). Firefox/Safari can’t capture tab audio this way.

---

## Authentication

Configured in `CONFIG` at the top of `app.js`:

- **Shared key (current setup):** `CONFIG.proxyUrl` is set to the Cloudflare
  Worker (`wss://openfrontier-translate.openfrontier-translate.workers.dev`).
  The key field is hidden and a **“✓ SHARED KEY ACTIVE”** badge shows; visitors
  translate with no key. The key lives only as a Worker secret — never in the
  repo or the browser. See [`worker/README.md`](worker/README.md).
- **Bring-your-own-key (fallback):** set `CONFIG.proxyUrl = ""` and each visitor
  pastes their own Gemini key (entered at runtime, optionally remembered in their
  browser, never committed).

> ⚠️ **Never embed a raw API key in the page.** A GitHub Pages site is fully
> public source, so an embedded key is visible to everyone, abusable on your
> bill, and usually auto-revoked by secret scanning. The Worker proxy exists
> precisely to avoid this.

---

## Run locally

No build step. Serve the folder over HTTP (needed for `getDisplayMedia`):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

`file://` won’t work for screen capture — use `http://localhost` or HTTPS. The
local origin (`http://localhost:8000`) is already in the Worker’s
`ALLOWED_ORIGINS`, so the shared key works from localhost too.

---

## Deploy (GitHub Pages)

This repo is a **user site** (`samadasyed/samadasyed.github.io`), so it serves at
the root and updates on every push to `main`:

```bash
git push origin main
```

Pages goes live at **https://samadasyed.github.io** within a minute or two and is
served over HTTPS (required by `getDisplayMedia`). The `.nojekyll` file makes
Pages serve all assets as-is.

> For a different account, create either a `<user>.github.io` repo (serves at
> root) or any repo with **Settings → Pages → Deploy from branch → main / root**
> (serves at `https://<user>.github.io/<repo>/`). Then add that origin to the
> Worker’s `ALLOWED_ORIGINS`.

---

## Configure the real livestream

In `app.js`, set the livestream id once it’s known:

```js
const CONFIG = {
  ...
  liveVideoId: "YOUR_LIVE_VIDEO_ID", // from youtube.com/watch?v=THIS
};
```

If left blank, clicking **LIVESTREAM** prompts you to paste the URL/ID.

---

## Notes / limitations

- `gemini-3.5-live-translate-preview` is a **preview** API. The setup payload
  lives in `connectWebSocket()` in `app.js`; server errors surface in the status
  line and browser console. Verified working end-to-end through the Worker.
- The capture pipeline also logs a `[capture] audio tracks: …` line to the
  console on Start, showing the granted audio track’s settings — handy if a
  capture comes through silent.
- The Worker only proxies WebSocket upgrades and checks `Origin` against
  `ALLOWED_ORIGINS`. For stronger quota protection, add a Cloudflare rate-limit
  rule on the Worker route (see [`worker/README.md`](worker/README.md)).

---

## Project layout

```
index.html      markup + theme
styles.css      Open Frontier theme
app.js          capture → Gemini Live WS → captions + translated voice
worker/         Cloudflare Worker proxy (holds the key, see its README)
```
