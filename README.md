# samadsyed.com

My personal website. Plain HTML + CSS — no build step, no framework.

## Files

| File | What it is |
|------|------------|
| `index.html` | All the content. Edit the text between the tags here. |
| `style.css` | All the styling. Colors/sizes live in the `:root` block at the top. |
| `CNAME` | Tells GitHub Pages to serve the site at `samadsyed.com`. Don't delete. |
| `assets/` | Put `resume.pdf` and any images here. |

## How to edit

1. Open `index.html`.
2. Find the section you want to change (each is labeled with a big comment, e.g. `EXPERIENCE`).
3. Edit the text. To add another job/project, copy one `<li>…</li>` block and change its contents.
4. Save, commit, and push — the live site updates in about a minute.

To change colors or fonts, edit the variables in the `:root { … }` block at the top of `style.css`.

## Preview locally

Just open `index.html` in your browser, or run a tiny local server:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Publishing changes

The site auto-deploys from the `main` branch. To push an update:

```bash
git add -A
git commit -m "describe your change"
git push
```

The live site at https://samadsyed.com updates within ~1 minute.

## Hosting setup (for reference)

- **Host:** GitHub Pages, repo `samadasyed/samadasyed.github.io`, deploy from `main` / root.
- **Domain:** `samadsyed.com`, registered on Cloudflare (DNS managed there).
- **Custom domain:** set by the `CNAME` file in this repo + the Pages settings.
- **DNS records on Cloudflare** (all set to "DNS only" / grey cloud):
  - Four `A` records on `@` → `185.199.108.153`, `.109.153`, `.110.153`, `.111.153`
  - Four `AAAA` records on `@` → `2606:50c0:8000::153` through `:8003::153`
  - One `CNAME`: `www` → `samadasyed.github.io` (redirects www to the bare domain)
- **HTTPS:** "Enforce HTTPS" is enabled in the repo's Pages settings.

## To do later

- Add `photo-1.jpg`, `photo-2.jpg`, `photo-3.jpg` to `assets/` for the photo strip.
- Add a redacted resume and point the "Resume" link (currently `#`) at it.
- Re-enable the Writing section in `index.html` once there are posts.
