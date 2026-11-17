# Diary

*A private, offline space for cyber safety and mindful digital living.*
*Dedicated to Diary.*

Diary is a Progressive Web App (PWA). It has no server, no accounts, no analytics and no third-party code. Everything a person writes stays encrypted on their own device.

## What's inside

| Section | What it does |
|---|---|
| **Today** | The *Digital Diet*: log nourishing vs. junk screen time, offline time, screens-off-before-bed, six healthy habits and a mood check. Shows a "digital plate", a balance score and a 7-day view. |
| **Journal** | Encrypted diary entries with tags, search, writing prompts and auto-saved drafts. |
| **Learn** | Six "Read the label" lessons styled as *Safety Facts* labels, each with a quiz: phishing, passwords & passkeys, UPI/OTP scams, social media, device hygiene, AI fakes & "digital arrest". |
| **Dedication** | The dedication page. Edit the `DEDICATION` block at the top of `app.js` to change it. |
| **Vault** | Lock, auto-lock, change passphrase, encrypted backup/restore, erase, helplines. |

## Deploy (any static host, HTTPS required)

Upload every file in this folder to the same directory. That's all.

- **Netlify / Cloudflare Pages:** drag-and-drop the folder. `_headers` applies the security headers automatically.
- **GitHub Pages:** push the folder to a repo and enable Pages. (GitHub Pages can't set custom headers; the app still works, but for full hardening prefer Cloudflare Pages or Netlify.)
- **School server (Apache):** put the files in a subfolder such as `/diary/` and add the headers from `_headers` to `.htaccess` with `Header set ...` lines.

Open the site once while online. After that it works offline, and users can choose **Install** / **Add to Home Screen**.

**Releasing an update:** change `CACHE` in `sw.js` (e.g. `diary-v1.0.1`) so devices fetch the new files.

## Test locally

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```
(WebCrypto and service workers need HTTPS or `localhost`.)

## Security

See `SECURITY.md`.
