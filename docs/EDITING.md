# Editing Guide — Connected PNW

This guide is for anyone updating the website's text, images, or basic appearance. You don't need to know how to code. All edits are made by changing plain text files on GitHub.

---

## How edits work

Every piece of text on the site lives in a file inside the `src/content/site/` folder. You edit these files on GitHub, save (commit), and the site rebuilds automatically within a minute or two.

---

## Step-by-step: editing text on GitHub

1. Go to the repository on GitHub.
2. Click into `src/content/site/`.
3. Click the file you want to edit (e.g. `home.md`).
4. Click the **pencil icon** (Edit this file) in the top-right of the file view.
5. Make your changes.
6. Scroll to the bottom, write a short note in the "Commit changes" box (e.g. *"Update hero heading"*), and click **Commit changes**.

The site will rebuild and go live in about 60–90 seconds.

---

## The content files and what they control

| File | What it controls |
|---|---|
| `home.md` | Hero heading, subtext, the eyebrow label, the two buttons, and the "difference" panel on the right |
| `model.md` | The five coaching model steps |
| `gains.md` | The three "What participants gain" cards (Insight, Skill, Confidence) |
| `journey.md` | The four program journey steps (Group learning → Paired practice) |
| `faq.md` | All FAQ questions and answers |
| `contact.md` | The contact page heading, intro text, and the privacy note at the bottom |

---

## Understanding the file format

Each file has two parts separated by `---` lines.

```
---
title: "Page title here"
hero_heading: "Your heading text here"
---
```

Everything between the two `---` lines is **frontmatter** — structured fields the site reads. Everything after the second `---` is body text (not used on most pages, safe to leave blank).

### Rules for editing frontmatter

- Keep each value inside its quotes: `"like this"`.
- Don't change the field names (the part before the colon). Only change the values.
- Em dashes (—) and apostrophes are fine to use directly.
- To use a quote mark inside a value, use a curly/smart quote (`"`) or escape it with a backslash: `\"`.

### Editing lists

Some fields are lists of items. They look like this:

```yaml
faqs:
  - question: "Is Connected PNW therapy?"
    answer: "No. It is a structured, skills-based program."
  - question: "What is paired practice?"
    answer: "Participants are paired with another participant..."
```

To **edit** an item: change the text after `question:` or `answer:`.

To **add** a new item: copy an existing `- question:` / `answer:` block, paste it at the end of the list, and update the text. Make sure the indentation (the spaces at the start of each line) matches the other items exactly.

To **remove** an item: delete its two lines (`- question:` and `answer:`).

---

## Writing blog posts

Blog posts live in `src/content/posts/` — one Markdown file per post. Unlike the site content files, the text after the frontmatter **is** the post body, written in Markdown.

1. On GitHub, navigate to `src/content/posts/`.
2. Click **Add file → Create new file**.
3. Name it something URL-friendly ending in `.md`, e.g. `understanding-your-dating-patterns.md`. The filename becomes the post's URL: `/blog/understanding-your-dating-patterns/`.
4. Add frontmatter and body, e.g.:

   ```markdown
   ---
   title: "Understanding Your Dating Patterns"
   description: "A short one- or two-sentence summary shown on the blog listing page."
   date: 2026-07-06
   author: "Connected PNW"
   draft: false
   ---

   Your post content goes here, written in Markdown. Use blank lines between
   paragraphs, `## Heading` for subheadings, and `- item` for bullet lists.
   ```

5. Commit the file. If `draft: false`, it goes live on the next build (~60–90 seconds). Set `draft: true` to keep working on a post without publishing it — draft posts never appear in the production listing, post pages, or the RSS feed.

See `src/content/posts/welcome-to-the-connected-pnw-blog.md` for a working example (it's a draft, so it won't appear on the live site).

For an AI agent to publish posts programmatically instead of using the GitHub web UI, see the "Agent publishing" section of `DEV.md`.

---

## Adding or changing images

Images are stored in the `public/images/` folder.

### To add a new image

1. On GitHub, navigate to `public/images/`.
2. Click **Add file → Upload files**.
3. Upload your image. Use a descriptive filename with no spaces (e.g. `group-session-photo.jpg`).
4. Commit the upload.

To use the image on a page, a developer needs to add it to the relevant `.astro` page file. Add a note in the content file or contact your developer with the filename.

### Image guidelines

- Use `.jpg` for photos, `.png` for graphics with transparency, `.svg` for logos and icons.
- Resize photos to no wider than **2000px** before uploading — large files slow the site.
- Aim for files under **400 KB**. Tools like [Squoosh](https://squoosh.app) can compress images for free.
- Use descriptive filenames: `facilitator-headshot.jpg`, not `IMG_4823.jpg`.

---

## Changing colors

The site's colors are defined in one place: `src/styles/global.css`, at the very top of the file under `:root {`.

The main colors:

| Variable | What it affects | Default value |
|---|---|---|
| `--color-primary` | Buttons, links, accents, dot colors | `#01696f` (teal) |
| `--color-primary-hover` | Button hover state | `#0c4e54` (darker teal) |
| `--color-primary-highlight` | Light teal backgrounds (eyebrow, timeline numbers) | `#d9eceb` |
| `--color-bg` | Page background | `#f7f6f2` (warm off-white) |
| `--color-text` | Body text | `#28251d` (near-black) |
| `--color-text-muted` | Secondary/muted text | `#6d6a63` (warm grey) |

To change a color, edit the hex value on that line. The dark mode equivalents are just below in the `[data-theme="dark"]` block — update both if you want the change to apply in both modes.

---

## Changing fonts

Fonts are loaded at the top of `src/layouts/Base.astro` via this line:

```html
<link href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&f[]=zodiak@400,700&display=swap" rel="stylesheet" />
```

- **Zodiak** is the display/heading font.
- **Satoshi** is the body font.

To swap fonts, replace the font names in that URL with others from [fontshare.com](https://www.fontshare.com), then update the `--font-display` and `--font-body` variables in `global.css` to match.

---

## What to ask a developer to do

Some changes are quick for a developer but risky to do without code knowledge:

- Adding a photo to a specific section of a page
- Changing the layout of a section (e.g. 3 columns → 2 columns)
- Adding a new section or page
- Changing navigation links
- Connecting the contact form to a Formspree account (one-time setup — update `contact_form_action` in `contact.md`)
- Changing spacing, font sizes, or border styles

When asking, be specific: *"Add the photo `group-session-photo.jpg` below the hero heading on the home page"* is faster to act on than *"add a photo somewhere."*
