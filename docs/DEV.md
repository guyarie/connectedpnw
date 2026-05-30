# Developer Guide — Connected PNW

Reference for maintaining and extending the site.

---

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Astro 4 | Static output by default; SSR-ready via adapter |
| Styling | Tailwind CSS + custom CSS | Layout utilities via Tailwind; component styles and CSS variables in `src/styles/global.css` |
| Content | Astro Content Collections | Typed schemas in `src/content/config.ts`; one `.md` per section |
| Hosting | DigitalOcean droplet | Nginx serves `dist/` as document root |
| Deploy | `deploy.sh` / GitHub Actions | See `DEPLOY.md` |

---

## Local development

```bash
npm install
npm run dev          # http://localhost:4321
npm run build        # outputs to dist/
npm run preview      # preview the dist/ build locally
```

---

## Project structure

```
src/
  content/
    config.ts          # Zod schemas — edit when adding new content fields
    site/              # One .md file per page section
  layouts/
    Base.astro         # HTML shell: fonts, theme script, Header + Footer slots
  components/
    Header.astro       # Sticky nav, brand, theme toggle, CTA button
    Footer.astro       # Footer nav + copyright
  styles/
    global.css         # CSS custom properties (light/dark), all component classes
  pages/
    index.astro        # Home — renders all 6 sections from content files
    about.astro        # /about standalone page
    faq.astro          # /faq standalone page
    contact.astro      # /contact — Formspree-ready form
public/
  favicon.svg
  images/              # Add client images here
```

---

## Content system

Content lives entirely in `src/content/site/*.md` frontmatter. Pages import entries with `getEntry('site', 'slug')` and render frontmatter fields directly — no hardcoded strings in `.astro` files.

### Adding a new field to an existing page

1. Add the field to the schema in `src/content/config.ts` (mark optional with `.optional()` unless every page needs it).
2. Add the field and its value to the relevant `.md` file.
3. Reference `entry.data.your_field` in the corresponding `.astro` page.

### Adding a new page

1. Create `src/content/site/new-page.md` with appropriate frontmatter.
2. Extend the schema in `config.ts` if new field types are needed.
3. Create `src/pages/new-page.astro`, import with `getEntry('site', 'new-page')`, wrap in `<Base>`.
4. Add the route to `Header.astro` nav links and `Footer.astro` if needed.

---

## Styling approach

**CSS custom properties handle theming.** Light and dark mode values are defined in `:root` and `[data-theme="dark"]` in `global.css`. Components use `var(--color-*)` throughout — Tailwind color utilities (`bg-primary`, etc.) are wired to these same variables via `tailwind.config.mjs`.

**Tailwind is used for layout utilities** where convenient (`grid`, `flex`, spacing). Complex component styles (hero, timeline, model steps, FAQ accordion) stay as named CSS classes in `global.css` to keep `.astro` files readable.

**Theme toggle** is handled by a small inline script in `Base.astro` that sets `data-theme` on `<html>` based on `prefers-color-scheme`, then toggles on button click. No framework needed.

### Key CSS variables

```css
--color-primary          /* teal — buttons, accents, dots */
--color-primary-hover    /* darker teal — hover states */
--color-primary-highlight /* light teal — eyebrow bg, timeline nums */
--color-bg               /* page background */
--color-surface          /* card / panel background */
--color-text             /* body text */
--color-text-muted       /* secondary text */
--color-text-inverse     /* text on primary-colored backgrounds */
```

---

## Common tasks

### Add an image to a section

1. Place the image in `public/images/`.
2. In the relevant `.astro` page, add `<img src="/images/filename.jpg" alt="..." />` where needed.
3. Optionally add an `image` field to the content schema + `.md` file so the filename is editable by staff without touching code.

### Add a new FAQ item

Edit `src/content/site/faq.md` — add a new `- question: / answer:` block to the `faqs` array. No code change needed.

### Add a new card to a section

Same pattern — edit the relevant `.md` file's `cards` or `steps` array. If you need more than 3 columns, update `.cards-3` in `global.css` (or add a `.cards-4` variant).

### Change section order on the home page

Reorder the `<section>` blocks in `src/pages/index.astro`. Update the nav anchor links in `Header.astro` to match.

### Add a blog

1. Define a new `posts` collection in `src/content/config.ts`:
   ```ts
   const posts = defineCollection({
     type: 'content',
     schema: z.object({
       title: z.string(),
       date: z.date(),
       description: z.string().optional(),
       draft: z.boolean().optional(),
     }),
   });
   ```
2. Create `src/content/posts/` and add `.md` files.
3. Create `src/pages/blog/index.astro` (listing) and `src/pages/blog/[slug].astro` (single post).

### Enable SSR (when a dynamic feature is needed)

```js
// astro.config.mjs
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',         // or 'hybrid' for per-route opt-in
  adapter: node({ mode: 'standalone' }),
  integrations: [tailwind()],
});
```

Then `npm install @astrojs/node`. The Node server runs via `node ./dist/server/entry.mjs`. Update Nginx to reverse-proxy instead of serving static files.

### Add Decap CMS

1. Create `public/admin/index.html` (Decap bootstrap page).
2. Create `public/admin/config.yml` pointing at your GitHub repo and `src/content/site/` collections.
3. Configure Netlify Identity or a third-party OAuth provider (e.g. `netlify-cms-github-oauth-provider` for self-hosted).

No Astro or content schema changes needed — Decap edits the same `.md` files.

### Connect the contact form

Update `contact_form_action` in `src/content/site/contact.md` with the Formspree endpoint:

```yaml
contact_form_action: "https://formspree.io/f/YOUR_FORM_ID"
```

No code change needed. The form already uses `method="POST"` and named inputs.

---

## Upgrading Astro

```bash
npx @astrojs/upgrade
```

Check the [Astro changelog](https://github.com/withastro/astro/blob/main/packages/astro/CHANGELOG.md) for breaking changes before upgrading across major versions.

---

## Deployment

See `DEPLOY.md` for the full Nginx config, GitHub Actions workflow, and git post-receive hook setup.

Quick rebuild on the server:

```bash
bash /var/www/connectedpnw/deploy.sh
```
