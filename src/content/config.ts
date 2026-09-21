import { defineCollection, z } from 'astro:content';

const bulletItem = z.object({ strong: z.string(), text: z.string() });
const card = z.object({ heading: z.string(), body: z.string() });

// One of the two "different starting points" panels on the home page.
const audience = z.object({
  label: z.string(),
  body: z.string(),
  image: z.string().optional(),
  image_alt: z.string().optional(),
});

// A phase of the program. Used in short form on the home page and in
// long form (detail paragraphs + bullet list) on /how-it-works.
const phase = z.object({
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
const action = z.object({
  label: z.string(),
  url: z.string(),
  style: z.enum(['primary', 'secondary']).optional(),
});

const faqItem = z.object({ question: z.string(), answer: z.string() });
const founderSection = z.object({
  heading: z.string().optional(),
  paragraphs: z.array(z.string()),
});
const founderBio = z.object({
  name: z.string(),
  role: z.string().optional(),
  image: z.string().optional(),
  image_alt: z.string().optional(),
  // Short bio — a single paragraph. Use `sections` instead for a long,
  // multi-part bio with subheadings.
  bio: z.string().optional(),
  sections: z.array(founderSection).optional(),
});

const event = z.object({
  date: z.string(), // YYYY-MM-DD — used for sorting and upcoming/past split
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

const site = defineCollection({
  type: 'content',
  schema: z.object({
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
  }),
});

const posts = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.date(),
    author: z.string().default('Connected PNW'),
    image: z.string().optional(),
    tags: z.array(z.string()).optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { site, posts };
