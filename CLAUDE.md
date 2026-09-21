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
- **Editing without GitHub**: a **content service** Cloudflare Worker (`worker/`) exposes the content as MCP tools (Claude / ChatGPT connectors) and a REST + OpenAPI surface (ChatGPT custom GPT), with Google sign-in + email allowlist; plus **Sveltia CMS** at `/admin` (`public/admin/`). Both commit to `main`. See `docs/CONTENT-SERVICE.md`.
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
| `/` | `src/pages/index.astro` | `home.md` + the phases from `how.md` |
| `/how-it-works` | `src/pages/how-it-works.astro` | `how.md` |
| `/about` | `src/pages/about.astro` | `team.md` (nav label: "Founders") |
| `/events` | `src/pages/events.astro` | `events.md` |
| `/faq` | `src/pages/faq.astro` | `faq.md` |
| `/contact` | `src/pages/contact.astro` | `contact.md` (the interest list) |
| `/blog/` | `src/pages/blog/index.astro` | `blog.md` + `src/content/posts/` |
| `/thanks` | `src/pages/thanks.astro` | Hardcoded (post-form redirect) |

## Content files (`src/content/site/`)
- `home.md` — hero, audience split, feature rules, closing CTA band
- `how.md` — the three program phases; the short form of each also renders on the home page
- `team.md` — Founders page: intro narrative, short bios, "How We Hold the Space" values
- `faq.md` — FAQ items
- `contact.md` — interest-list page + Formspree/MailerLite action URLs + redirect URL
- `blog.md` — blog listing page heading/intro
- `events.md` — events list (upcoming/past split by `date` at build time)
- `banner.md` — home-page-only banner image (`enabled`, image + optional mobile image, link, dismissible, date window); rendered by `src/components/Banner.astro` at the top of `index.astro`

## Content schema
Defined in `src/content/schema.ts` (Astro-free; `config.ts` just wires it in). The worker validates agent edits with the same file, so it must stay importable outside Astro (zod from `astro/zod`, no `astro:content`). All fields optional except `title`.
Founder bios use `bio: string` for the short form; `sections: [{heading?, paragraphs: []}]` is still supported for long, multi-part bios.
Any section that shows a photo takes `image` / `image_alt` / `image_placeholder` and renders through `src/components/ImageSlot.astro`, which falls back to a labelled dashed box when `image` is absent.

## CSS approach
All component styles and CSS custom properties (light + dark theme) live in `src/styles/global.css`. Tailwind handles layout utilities. Dark mode is driven by `data-theme` on `<html>` — no Tailwind dark: prefix needed. Do not add hardcoded color values to .astro files; use `var(--color-*)`.

## Theming
Light/dark toggle is in `src/layouts/Base.astro` (inline script). It always starts in light mode and the choice is not persisted across page loads — it does **not** currently read `prefers-color-scheme` or `localStorage`, despite what the toggle implies.

Accent colours: `--color-primary` (forest green) for structure and links, `--color-accent` (coral) for the feature top-rules and the CTA band. Both are defined for light and dark.

## Key constraints
- **Zero hardcoded text in .astro files** — all copy comes from content collections
- Non-technical staff edit `src/content/site/*.md` through the content service, `/admin`, or the GitHub web UI; don't restructure frontmatter keys they depend on without updating EDITING.md
- **Three things list the content fields and must stay in sync**: `src/content/schema.ts` (+ its `PAGES` / `LIST_FIELDS`), `public/admin/config.yml`, and `docs/EDITING.md`
- Worker checks: `npm run worker:check` (typecheck + vitest). CI (`.github/workflows/check.yml`) runs the site build and these on PRs.


## Documentation
- `docs/EDITING.md` — for non-technical staff (text, images, colors)
- `docs/DEV.md` — developer reference (adding pages, SSR, Decap CMS, blog)
- `docs/DEPLOY.md` — hosting (self-hosted on holdens-box), self-hosted runner deploy, Nginx config, TLS/renewal
- `docs/CONTENT-SERVICE.md` — the agent/CMS editing service: architecture, tools, one-time setup (Google OAuth, KV, PAT, custom GPT), V2 list
