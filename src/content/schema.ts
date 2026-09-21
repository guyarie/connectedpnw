// Shared content schemas.
//
// This file is imported by two things:
//   1. `src/content/config.ts` — Astro validates every content file against it at build time.
//   2. `worker/` — the content service validates agent and API edits against it
//      *before* they are committed, so a bad edit can never break the build.
//
// It must therefore stay free of Astro-only imports (`astro:content` etc.) and
// import zod from `astro/zod` so both sides share a single zod instance.
import { z } from 'astro/zod';

export const bulletItem = z.object({ strong: z.string(), text: z.string() });
export const card = z.object({ heading: z.string(), body: z.string() });

// One of the two "different starting points" panels on the home page.
export const audience = z.object({
  label: z.string(),
  body: z.string(),
  image: z.string().optional(),
  image_alt: z.string().optional(),
});

// A phase of the program. Used in short form on the home page and in
// long form (detail paragraphs + bullet list) on /how-it-works.
export const phase = z.object({
  num: z.string(),
  heading: z.string(),
  body: z.string(),
  image: z.string().optional(),
  image_alt: z.string().optional(),
  image_placeholder: z.string().optional(),
  detail: z.array(z.string()).optional(),
  list_heading: z.string().optional(),
  list: z.array(z.string()).optional(),
  list_footnote: z.string().optional(),
});

// A button. `style` defaults to secondary.
export const action = z.object({
  label: z.string(),
  url: z.string(),
  style: z.enum(['primary', 'secondary']).optional(),
});

export const faqItem = z.object({ question: z.string(), answer: z.string() });

export const founderSection = z.object({
  heading: z.string().optional(),
  paragraphs: z.array(z.string()),
});

export const founderBio = z.object({
  name: z.string(),
  role: z.string().optional(),
  image: z.string().optional(),
  image_alt: z.string().optional(),
  // Short bio — a single paragraph. Use `sections` instead for a long,
  // multi-part bio with subheadings.
  bio: z.string().optional(),
  sections: z.array(founderSection).optional(),
});

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');

export const event = z.object({
  date: isoDate, // used for sorting and the upcoming/past split
  display_date: z.string().optional(),
  time: z.string().optional(),
  name: z.string(),
  location: z.string().optional(),
  body: z.string().optional(),
  perks: z.array(bulletItem).optional(),
  image: z.string().optional(),
  image_alt: z.string().optional(),
  link_label: z.string().optional(),
  link_url: z.string().optional(),
});

export const siteSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  // Hero (home)
  eyebrow: z.string().optional(),
  hero_heading: z.string().optional(),
  hero_lead: z.string().optional(),
  hero_note: z.string().optional(),
  cta_primary_label: z.string().optional(),
  cta_primary_url: z.string().optional(),
  cta_secondary_label: z.string().optional(),
  cta_secondary_url: z.string().optional(),
  hero_image: z.string().optional(),
  hero_image_alt: z.string().optional(),
  hero_image_placeholder: z.string().optional(),
  // Section common fields
  kicker: z.string().optional(),
  section_heading: z.string().optional(),
  section_intro: z.string().optional(),
  // Card grids
  cards: z.array(card).optional(),
  // "Different starting points" (home)
  audience_heading: z.string().optional(),
  audiences: z.array(audience).optional(),
  // "Most dating advice..." three feature rules (home)
  features_heading: z.string().optional(),
  features_intro: z.string().optional(),
  features: z.array(card).optional(),
  // Program phases — short form on home, long form on /how-it-works
  phases_heading: z.string().optional(),
  phases_intro: z.string().optional(),
  phases: z.array(phase).optional(),
  // Buttons shown at the foot of a section/page
  actions: z.array(action).optional(),
  // Closing CTA band
  cta_heading: z.string().optional(),
  cta_body: z.string().optional(),
  cta_label: z.string().optional(),
  cta_url: z.string().optional(),
  // FAQ
  faqs: z.array(faqItem).optional(),
  // Contact
  contact_program_details: z.string().optional(),
  contact_commitment: z.string().optional(),
  contact_button_label: z.string().optional(),
  contact_sending_label: z.string().optional(),
  contact_error_message: z.string().optional(),
  contact_subject: z.string().optional(),
  contact_nav_label: z.string().optional(),
  contact_note: z.string().optional(),
  contact_form_action: z.string().optional(),
  mailerlite_form_action: z.string().optional(),
  contact_redirect_url: z.string().optional(),
  instagram_url: z.string().optional(),
  facebook_url: z.string().optional(),
  contact_phone: z.string().optional(),
  // Events
  events: z.array(event).optional(),
  events_empty_note: z.string().optional(),
  // Shown by a listing page when it has nothing to show
  empty_note: z.string().optional(),
  // Home page banner
  enabled: z.boolean().optional(),
  banner_image: z.string().optional(),
  banner_image_mobile: z.string().optional(),
  banner_mobile_ratio: z.string().optional(), // e.g. '3 / 2' — shape of the mobile image
  banner_alt: z.string().optional(),
  banner_link_url: z.string().optional(),
  banner_dismissible: z.boolean().optional(),
  banner_start: z.string().optional(),
  banner_end: z.string().optional(),
  // Team section
  founders_heading: z.string().optional(),
  founders_intro: z.string().optional(),
  founders_narrative: z.array(z.string()).optional(),
  founders_combined_note: z.string().optional(),
  bios_heading: z.string().optional(),
  bios_intro: z.string().optional(),
  founders: z.array(founderBio).optional(),
  values_heading: z.string().optional(),
  values_intro: z.string().optional(),
  values: z.array(card).optional(),
});

// Blog posts. `date` may be written quoted ("2026-07-06") or bare in YAML;
// coerce accepts both. The worker validates the raw string form with
// `postFrontmatterSchema` before committing.
export const postSchema = z.object({
  title: z.string(),
  description: z.string(),
  date: z.coerce.date(),
  author: z.string().default('Connected PNW'),
  image: z.string().optional(),
  tags: z.array(z.string()).optional(),
  draft: z.boolean().default(false),
});

export const postFrontmatterSchema = postSchema.extend({ date: isoDate });

export type SiteData = z.infer<typeof siteSchema>;
export type PostFrontmatter = z.infer<typeof postFrontmatterSchema>;

// The editable pages. `slug` is what editors and agents refer to; `file` is
// the content file under src/content/site/. Keep this in sync with the
// routes table in CLAUDE.md.
export const PAGES = {
  home: {
    file: 'home.md',
    route: '/',
    label: 'Home page',
    description:
      'Hero text and buttons, the two "starting points" panels, the three feature rules, the intro text above the program phases, and the closing call-to-action band. The phases themselves live on the how-it-works page.',
  },
  how: {
    file: 'how.md',
    route: '/how-it-works',
    label: 'How It Works',
    description:
      'The three program phases (heading, body, detail paragraphs, bullet list) plus the page intro and buttons. The short form of each phase also renders on the home page.',
  },
  team: {
    file: 'team.md',
    route: '/about',
    label: 'Founders',
    description:
      'The founders narrative, each founder\'s short bio, the "How We Hold the Space" values, and the closing call-to-action band.',
  },
  events: {
    file: 'events.md',
    route: '/events',
    label: 'Events',
    description:
      'The events list. Each event has a date (YYYY-MM-DD, used to split upcoming from past), a name, and optional time, location, body, perks and link.',
  },
  faq: {
    file: 'faq.md',
    route: '/faq',
    label: 'FAQ',
    description: 'The list of questions and answers, plus the page heading and buttons.',
  },
  contact: {
    file: 'contact.md',
    route: '/contact',
    label: 'Schedule a conversation (interest form)',
    description:
      'The interest-form page: heading, intro, program details, privacy note, button labels, phone number and social links. The form endpoints (Formspree, MailerLite, scheduling redirect) also live here — change those only on purpose.',
  },
  blog: {
    file: 'blog.md',
    route: '/blog/',
    label: 'Blog listing',
    description: 'Heading and intro text of the blog index page. Individual posts are separate.',
  },
  banner: {
    file: 'banner.md',
    route: '/',
    label: 'Home page banner',
    description:
      'An optional promotional image shown at the top of the home page. Turn it on or off with `enabled`, and optionally limit it to a date window with banner_start / banner_end.',
  },
} as const;

export type PageSlug = keyof typeof PAGES;
export const PAGE_SLUGS = Object.keys(PAGES) as PageSlug[];

// Frontmatter fields that are lists of objects. Used by the list-item tools
// so an agent can add, change or remove one item without resending the list.
export const LIST_FIELDS = {
  home: ['audiences', 'features', 'actions'],
  how: ['phases', 'actions'],
  team: ['founders', 'values'],
  events: ['events'],
  faq: ['faqs', 'actions'],
  contact: [],
  blog: [],
  banner: [],
} as const satisfies Record<PageSlug, readonly string[]>;
