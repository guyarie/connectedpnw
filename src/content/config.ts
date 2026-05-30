import { defineCollection, z } from 'astro:content';

const bulletItem = z.object({ strong: z.string(), text: z.string() });
const card = z.object({ heading: z.string(), body: z.string() });
const modelStep = z.object({ title: z.string(), body: z.string() });
const timelineStep = z.object({
  num: z.string(),
  heading: z.string(),
  body: z.string(),
  highlight: z.boolean().optional(),
});
const faqItem = z.object({ question: z.string(), answer: z.string() });
const founderSection = z.object({
  heading: z.string().optional(),
  paragraphs: z.array(z.string()),
});
const founderBio = z.object({
  name: z.string(),
  role: z.string(),
  sections: z.array(founderSection),
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
    // Difference panel (home hero aside)
    difference_heading: z.string().optional(),
    difference_bullets: z.array(bulletItem).optional(),
    // Section common fields
    kicker: z.string().optional(),
    section_heading: z.string().optional(),
    section_intro: z.string().optional(),
    // Card grids
    cards: z.array(card).optional(),
    // Coaching model
    model_steps: z.array(modelStep).optional(),
    // Program journey
    steps: z.array(timelineStep).optional(),
    // FAQ
    faqs: z.array(faqItem).optional(),
    // Contact
    contact_note: z.string().optional(),
    contact_form_action: z.string().optional(),
    contact_redirect_url: z.string().optional(),
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

export const collections = { site };
