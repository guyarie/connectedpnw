# Connected PNW — Claude Code Project Guide

## What this is
A multi-page static website for **Connected PNW**, a guided dating and relational skills program (not therapy, not a dating service) co-founded by Miri Arie and Nina Helms. Based in the Pacific Northwest.

## Stack
- **Framework**: Astro 5, static output (`npm run build` → `dist/`)
- **Styling**: Tailwind CSS + custom CSS variables in `src/styles/global.css`
- **Content**: Astro Content Collections — all user-facing text lives in `src/content/site/*.md`
- **Hosting**: Self-hosted on **holdens-box** (home server, dynamic IP via DuckDNS `holdens-box.duckdns.org`), Nginx serves `dist/`. Site is behind Cloudflare (proxied / orange-cloud); `connectedpnw.com` + `www` are CNAMEs → `holdens-box.duckdns.org`.
- **Deploy**: A **GitHub Actions self-hosted runner runs on holdens-box**. On push to `main` it builds on the box and publishes locally with `rsync` to `/var/www/connectedpnw/dist/` — no SSH, no deploy secrets (`.github/workflows/deploy.yml`).
- **TLS**: Let's Encrypt via certbot (Nginx). ⚠️ Auto-renewal currently uses the HTTP-01 (`nginx`) authenticator, which **fails behind the Cloudflare proxy** — needs switching to DNS-01 with a Cloudflare API token before the cert expires (see `renewal .conf` / certbot).
- **Forms**: Formspree — form ID configured in `contact.md` (`contact_form_action`)
- **Email**: Cloudflare Email Routing → personal Gmail accounts
- **Analytics**: Plausible CE self-hosted at `analytics.16jets.com` (mini-PC, Docker, Cloudflare Tunnel)
- **SEO**: OG/Twitter Card tags, JSON-LD (`EducationalOrganization`), sitemap, robots.txt — all in `Base.astro` / `astro.config.mjs`

## Key commands
```bash
npm run dev      # local dev server at localhost:4321
npm run build    # build to dist/
npm run preview  # preview dist/ locally
```

## Pages
| Route | File | Content source |
|---|---|---|
| `/` | `src/pages/index.astro` | Imports all site/*.md entries |
| `/about` | `src/pages/about.astro` | `about.md` |
| `/events` | `src/pages/events.astro` | `events.md` |
| `/faq` | `src/pages/faq.astro` | `faq.md` |
| `/contact` | `src/pages/contact.astro` | `contact.md` |
| `/thanks` | `src/pages/thanks.astro` | Hardcoded (post-form redirect) |

## Content files (`src/content/site/`)
- `home.md` — hero, difference panel, CTAs
- `model.md` — 5 coaching model steps
- `gains.md` — 3 "what you gain" cards
- `journey.md` — 4 program journey timeline steps
- `about.md` — about section, 2 cards
- `team.md` — full team section: founders narrative, bios (with subsections), values
- `faq.md` — FAQ items
- `contact.md` — contact page + Formspree action URL + redirect URL
- `events.md` — events list (upcoming/past split by `date` at build time)
- `banner.md` — home-page-only banner image (`enabled`, image + optional mobile image, link, dismissible, date window); rendered by `src/components/Banner.astro` at the top of `index.astro`

## Content schema
Defined in `src/content/config.ts`. All fields optional except `title`.
Founder bios use `sections: [{heading?, paragraphs: []}]` — supports subsection headings within a bio.

## CSS approach
All component styles and CSS custom properties (light + dark theme) live in `src/styles/global.css`. Tailwind handles layout utilities. Dark mode is driven by `data-theme` on `<html>` — no Tailwind dark: prefix needed. Do not add hardcoded color values to .astro files; use `var(--color-*)`.

## Theming
Light/dark toggle is in `src/layouts/Base.astro` (inline script). Theme respects `prefers-color-scheme` on load.

## Key constraints
- **Zero hardcoded text in .astro files** — all copy comes from content collections
- Non-technical staff edit `src/content/site/*.md` via GitHub web UI; don't restructure frontmatter keys they depend on without updating EDITING.md


## Documentation
- `docs/EDITING.md` — for non-technical staff (text, images, colors)
- `docs/DEV.md` — developer reference (adding pages, SSR, Decap CMS, blog)
- `docs/DEPLOY.md` — hosting (self-hosted on holdens-box), self-hosted runner deploy, Nginx config, TLS/renewal
