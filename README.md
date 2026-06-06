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

## Deploy (GitHub Pages)

See the setup notes — once the repo is pushed and Pages is enabled, every push to the
`main` branch publishes automatically.
