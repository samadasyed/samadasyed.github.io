# Open Frontier // Live Translation

A single-page web app that live-translates the [Open Frontier](https://www.openfrontier.ai/)
livestream (or any YouTube video) using **Gemini 3.5 Live Translate**, with
YouTube-style captions and a translated voice you can mix against the original
audio.

It mirrors the openfrontier.ai theme: near-black background, white text, orange
(`#f97316`) accent, monospace typography, and a scrolling researcher marquee.

---

## Features

- **Pick a target language** (40+ languages, BCP-47).
- **Original-audio %** slider — controls how loud the original stream plays.
- **Translated-audio** volume + on/off toggle.
- **Start Translation** — captures the stream audio and streams it to Gemini.
- **Live captions** — translated text over the video, YouTube-style (white text
  on a dark grey box), plus a running transcript log.
- **Demo / Livestream** toggle — ships with a NeurIPS 2025 panel as the demo;
  drop in the real livestream ID on event day.

The site runs on **GitHub Pages**. There are two ways to authenticate:

- **Bring-your-own-key** (default): each visitor pastes their own Gemini key,
  entered at runtime and never committed.
- **Shared key** (keyless for visitors): a tiny free **Cloudflare Worker** holds
  your key server-side and proxies the Gemini Live WebSocket, so anyone can
  translate without a key and the key never ships to the browser. See
  [`worker/README.md`](worker/README.md). Set `CONFIG.proxyUrl` in `app.js` to
  your Worker's `wss://…workers.dev` URL to switch the site into shared mode —
  the key field disappears and a “✓ SHARED KEY ACTIVE” badge shows instead.

> ⚠️ **Do not embed a raw API key directly in the page.** A GitHub Pages site is
> fully public source, so an embedded key is visible to everyone, can be abused
> on your bill, and is usually auto-revoked by secret scanning. The Worker proxy
> exists precisely to avoid this.

---

## How it works

1. You paste your Gemini API key and choose a language.
2. On **Start**, the browser asks what to share. Choose **This Tab** (or the
   tab/window playing the stream) and tick **Share tab audio**.
3. The shared audio is downsampled to 16 kHz PCM and streamed over a WebSocket
   to `gemini-3.5-live-translate-preview`.
4. Gemini streams back 24 kHz translated audio (played here) and a live
   transcription (shown as captions).

> **Avoiding echo:** if you also play the translated voice in the *same* tab you
> are capturing, it gets re-captured and re-translated. For the cleanest result,
> open the livestream in a **separate** tab and share *that* tab — the translated
> voice plays in this app's tab and is never re-captured. For a quick demo,
> captions work regardless; you can also just turn the translated voice off.

Browser support: tab/screen **audio** capture via `getDisplayMedia` works in
**Chrome / Edge** (desktop). Firefox/Safari support is limited.

---

## Run locally

No build step. Serve the folder over HTTP (needed for `getDisplayMedia`):

```bash
# any one of these from the project folder
python3 -m http.server 8000
# then open http://localhost:8000
```

`file://` won't work for screen capture — use `http://localhost` or HTTPS.

---

## Deploy to GitHub Pages

1. Create a new repo on GitHub (e.g. `openfrontier-live-translation`).
2. Push this folder:

   ```bash
   git remote add origin https://github.com/<you>/openfrontier-live-translation.git
   git branch -M main
   git push -u origin main
   ```

3. On GitHub: **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: **main** / **/ (root)** → **Save**
4. Your site goes live at `https://<you>.github.io/openfrontier-live-translation/`
   within a minute or two.

GitHub Pages serves HTTPS, which `getDisplayMedia` requires. The `.nojekyll`
file is included so all assets are served as-is.

---

## Configure the real livestream

In `app.js`, set the livestream id once it's known:

```js
const CONFIG = {
  ...
  liveVideoId: "YOUR_LIVE_VIDEO_ID", // from youtube.com/watch?v=THIS
};
```

If you leave it blank, clicking **LIVESTREAM** will prompt you to paste the URL.

---

## Notes / limitations

- `gemini-3.5-live-translate-preview` is a **preview** API; exact request field
  names may shift. Server errors are surfaced in the status line and browser
  console — if a field is rejected, the message there tells you what to adjust
  (the setup payload lives in `connectWebSocket()` in `app.js`).
- The API key is used directly from the browser. That's fine for a personal
  demo, but anyone with access to the running page's network traffic could see
  it. For a public production deployment, proxy through a backend with an
  ephemeral token instead.
