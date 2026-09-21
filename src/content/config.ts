import { defineCollection } from 'astro:content';
import { siteSchema, postSchema } from './schema';

// The schemas live in ./schema.ts so the content service (worker/) can
// validate edits with the exact same rules before committing them.
const site = defineCollection({ type: 'content', schema: siteSchema });
const posts = defineCollection({ type: 'content', schema: postSchema });

export const collections = { site, posts };
